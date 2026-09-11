import { isSsoAuthMode } from "./config.js";
import { parseCloudEntitlement } from "./cloud-entitlement.js";
import { prisma } from "./prisma.js";
import { currentTeamScope, fileScopeWhere } from "./team-scope.js";

export type PersonalFileFeature = "diagrams" | "notes" | "drawings" | "flowcharts";

const DEFAULT_PERSONAL_FILE_LIMIT = 3;

const featureLabels: Record<PersonalFileFeature, string> = {
  diagrams: "ERD Builder",
  notes: "Notes",
  drawings: "Drawings",
  flowcharts: "Flowcharts",
};

export class PersonalFileQuotaError extends Error {
  readonly code = "PERSONAL_FILE_QUOTA_EXCEEDED";
  readonly status = 409;

  constructor(readonly feature: PersonalFileFeature, readonly limit: number) {
    super(`Personal Workspace has reached the limit of ${limit} ${featureLabels[feature]} files.`);
    this.name = "PersonalFileQuotaError";
  }
}

function storedPersonalLimit(value: unknown): number | null | undefined {
  if (typeof value !== "string") return undefined;

  try {
    const parsed = JSON.parse(value);
    const entitlement = parseCloudEntitlement({ ...parsed, status: "active" }, "active");
    return entitlement?.limits.max_personal_files_per_feature;
  } catch {
    return undefined;
  }
}

async function personalFileLimit(db: any, userId: string): Promise<number | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { cloudPersonalEntitlement: true },
  });
  const storedLimit = storedPersonalLimit(user?.cloudPersonalEntitlement);
  return storedLimit === undefined ? DEFAULT_PERSONAL_FILE_LIMIT : storedLimit;
}

async function assertPersonalFileQuota(db: any, feature: PersonalFileFeature, userId: string): Promise<void> {
  if (!isSsoAuthMode() || currentTeamScope()?.mode !== "personal") return;

  const where: any = { AND: [fileScopeWhere(userId)] };
  if (feature === "diagrams") {
    where.AND.push({ OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] });
  }

  const limit = await personalFileLimit(db, userId);
  if (limit === null) return;

  const count = await db[feature.slice(0, -1)].count({ where });
  if (count >= limit) throw new PersonalFileQuotaError(feature, limit);
}

export async function createPersonalFile<T>(
  feature: PersonalFileFeature,
  userId: string,
  create: (db: any) => Promise<T>,
): Promise<T> {
  if (!prisma) throw new Error("Database connection not available");
  if (!isSsoAuthMode() || currentTeamScope()?.mode !== "personal") {
    return create(prisma);
  }

  return prisma.$transaction(async (db: any) => {
    await assertPersonalFileQuota(db, feature, userId);
    return create(db);
  }, { isolationLevel: "Serializable" });
}
