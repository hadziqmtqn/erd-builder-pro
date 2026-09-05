import "dotenv/config";

import { randomUUID } from "node:crypto";

import { isLocalPostgres } from "../server/lib/config.js";
import { hashPassword } from "../server/lib/desktop-auth.js";
import { prisma } from "../server/lib/prisma.js";

const TEST_LICENSE_PREFIX = "test-fixture:";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The Team isolation seeder is disabled in production.");
  }
  if (!isLocalPostgres() || !prisma) {
    throw new Error("The Team isolation seeder only supports local PostgreSQL self-host mode.");
  }

  const admin = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error("No SuperAdmin exists. Complete the self-host setup before running this seeder.");
  }

  const runId = randomUUID().slice(0, 8);
  const teamName = process.env.TEAM_ISOLATION_TEAM_NAME?.trim() || `Isolation Test Team ${runId}`;
  const memberEmail = (process.env.TEAM_ISOLATION_MEMBER_EMAIL?.trim() || `team-isolation-${runId}@example.invalid`).toLowerCase();
  const memberPassword = process.env.TEAM_ISOLATION_MEMBER_PASSWORD?.trim() || `Isolation-${runId}!`;
  const memberName = process.env.TEAM_ISOLATION_MEMBER_NAME?.trim() || "Isolation Test Member";
  const teamId = randomUUID();
  const memberId = randomUUID();
  const licenseExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const { team, member } = await prisma.$transaction(async (database) => {
    const team = await database.team.create({
      data: {
        id: teamId,
        name: teamName,
        type: "team",
        createdBy: admin.id,
        status: "active",
        licenseId: `${TEST_LICENSE_PREFIX}${teamId}`,
        licenseStatus: "active",
        licenseExpiresAt,
        maxMembers: 10,
        bindingGeneration: 1,
      },
    });

    const member = await database.user.create({
      data: {
        id: memberId,
        email: memberEmail,
        name: memberName,
        password: hashPassword(memberPassword),
        isSuperAdmin: false,
      },
      select: { id: true, email: true, name: true },
    });

    await database.teamMember.create({
      data: {
        id: randomUUID(),
        teamId: team.id,
        userId: member.id,
        role: "member",
        status: "active",
      },
    });

    return { team, member };
  });

  console.log("\nTeam isolation fixture created successfully.");
  console.log(`Team: ${team.name} (${team.id})`);
  console.log(`Team status: active; local dashboard fixture valid until ${licenseExpiresAt.toISOString()}`);
  console.log(`Member: ${member.name} <${member.email}>`);
  console.log(`Member password: ${memberPassword}`);
  console.log(`Created by SuperAdmin: ${admin.email}`);
  console.log("Start the server for this fixture with: ERDBPRO_TEAM_FIXTURE_MODE=1 npm run dev");
}

main()
  .catch((error) => {
    console.error(`Team isolation seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
