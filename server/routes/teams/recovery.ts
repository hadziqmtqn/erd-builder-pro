import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { isLocalPostgres, isSsoAuthMode } from "../../lib/config.js";
import { isProvisionedMembership, isProvisionedTeam } from "../../lib/team-provisioning.js";
import { withTeamCapacityTransaction } from "../../lib/team-capacity-transaction.js";
import { instanceLicenseUsage } from "../../lib/instance-license-usage.js";
import { requireActiveInstanceLicense, TeamServiceError } from "./service.js";
import { copyRecoveryFile, recoveryModels, type RecoverySelection, type RecoveryFileType } from "./recovery-copy.js";

function database(superAdmin: boolean): any {
  if (!superAdmin) throw new TeamServiceError("SUPER_ADMIN_REQUIRED", 403);
  if (isSsoAuthMode() || !isLocalPostgres() || !prisma) throw new TeamServiceError("SELF_HOST_ONLY", 404);
  return prisma;
}

async function sourceTeam(db: any, id: string) {
  const team = await db.team.findUnique({ where: { id } });
  if (!team || team.type === "personal" || team.ssoOrganizationId) throw new TeamServiceError("RECOVERY_SOURCE_NOT_FOUND", 404, "Team not found.");
  if (team.status !== "quarantined") throw new TeamServiceError("RECOVERY_SOURCE_NOT_QUARANTINED", 409, "Only quarantined Teams can use file recovery.");
  return team;
}

function destinationValid(team: any): boolean {
  return team.type !== "personal" && !team.ssoOrganizationId && team.status === "active" && isProvisionedTeam(team)
    && (team.members || []).filter((member: any) => member.status === "active").every(isProvisionedMembership);
}

const fileWhere = (teamId: string) => ({ isDeleted: false, project: { teamId, isDeleted: false } });
const key = (file: RecoverySelection) => `${file.type}:${file.id}`;

export async function recoveryInventory(teamId: string, superAdmin: boolean) {
  const db = database(superAdmin);
  const source = await sourceTeam(db, teamId);
  const [teams, events, ...groups] = await Promise.all([
    db.team.findMany({ where: { status: "active", type: "team" }, include: { members: true }, orderBy: { name: "asc" } }),
    db.teamAuditEvent.findMany({ where: { teamId, action: "files_recovered" }, orderBy: { createdAt: "desc" } }),
    ...Object.entries(recoveryModels).map(async ([type, model]) => {
      const files = await db[model].findMany({ where: { ...fileWhere(teamId), ...(type === "erd" ? { OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] } : {}) }, select: { id: true, [type === "erd" ? "name" : "title"]: true, updatedAt: true, project: { select: { id: true, name: true } } }, orderBy: { updatedAt: "desc" } });
      return files.map((file: any) => ({ type, id: file.id, name: file.name ?? file.title, projectId: file.project.id, projectName: file.project.name, updatedAt: file.updatedAt }));
    }),
  ]);
  const recovered = new Map<string, { at: Date; teamName: string }>();
  for (const event of events) {
    try {
      const metadata = JSON.parse(event.metadata);
      for (const item of metadata.result?.items || []) {
        if (!recovered.has(key(item))) recovered.set(key(item), { at: event.createdAt, teamName: metadata.destinationName });
      }
    } catch { /* Ignore unrelated legacy audit metadata. */ }
  }
  return {
    source: { id: source.id, name: source.name },
    destinations: teams.filter(destinationValid).map((team: any) => ({ id: team.id, name: team.name })),
    files: groups.flat().map((file: any) => ({ ...file, recovery: recovered.get(key(file)) ?? null })),
  };
}

export async function recoverFiles(sourceId: string, actorId: string, superAdmin: boolean, input: { operationId: string; targetTeamId: string; files: RecoverySelection[] }) {
  database(superAdmin);
  if (input.files.length === 0 || input.files.length > 500) throw new TeamServiceError("RECOVERY_SELECTION_INVALID", 400, "Choose between 1 and 500 files.");
  const plan = await requireActiveInstanceLicense();
  const files = [...new Map(input.files.map((file) => [key(file), file])).values()].sort((a, b) => key(a).localeCompare(key(b)));
  const fingerprint = createHash("sha256").update(JSON.stringify({ sourceId, actorId, target: input.targetTeamId, files })).digest("hex");
  return withTeamCapacityTransaction(async (tx) => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { isSuperAdmin: true } });
    if (!actor?.isSuperAdmin) throw new TeamServiceError("SUPER_ADMIN_REQUIRED", 403);
    const previous = await tx.teamAuditEvent.findUnique({ where: { id: input.operationId } });
    if (previous) {
      const metadata = JSON.parse(previous.metadata);
      if (previous.action !== "files_recovered" || previous.actorId !== actorId || previous.teamId !== sourceId || metadata.fingerprint !== fingerprint) throw new TeamServiceError("RECOVERY_REQUEST_CONFLICT", 409, "This recovery request has already been used.");
      return metadata.result;
    }
    const sourceTeamRecord = await sourceTeam(tx, sourceId);
    const destination = await tx.team.findUnique({ where: { id: input.targetTeamId }, include: { members: true } });
    if (!destination || !destinationValid(destination)) throw new TeamServiceError("RECOVERY_DESTINATION_UNAVAILABLE", 409, "Choose an active, verified Team to receive the files.");
    const usage = await instanceLicenseUsage(tx);
    if ((plan.maxTeams !== null && usage.teamCount > plan.maxTeams) || (plan.maxMembers !== null && usage.memberCount > plan.maxMembers)) throw new TeamServiceError("INSTANCE_CAPACITY_EXCEEDED", 403);
    const projects = new Map<number, any>();
    const items = [];
    for (const file of files) {
      const source = await tx[recoveryModels[file.type]].findFirst({ where: { id: file.id, ...fileWhere(sourceId) }, include: { project: true } });
      if (!source || (file.type === "erd" && source.sourceType === "production_db")) throw new TeamServiceError("RECOVERY_FILE_UNAVAILABLE", 409, "A selected file is no longer available. Refresh the file list.");
      let project = projects.get(source.projectId);
      if (!project) {
        project = await tx.project.create({ data: { uid: randomUUID(), name: source.project.name, color: source.project.color, userId: actorId, teamId: destination.id } });
        projects.set(source.projectId, project);
      }
      const copy = await copyRecoveryFile(tx, file.type, source, project.id, actorId);
      items.push({ type: file.type as RecoveryFileType, id: file.id, sourceProjectId: source.projectId, sourceOwnerId: source.userId, copiedId: copy.id, copiedUid: copy.uid, projectId: project.id });
    }
    const result = { fileCount: items.length, projectCount: projects.size, targetTeamId: destination.id, items };
    await tx.teamAuditEvent.create({ data: { id: input.operationId, teamId: sourceId, actorId, action: "files_recovered", targetType: "team", targetId: destination.id, metadata: JSON.stringify({ fingerprint, sourceName: sourceTeamRecord.name, destinationName: destination.name, result }) } });
    return result;
  });
}
