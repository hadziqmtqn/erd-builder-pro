import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("../../lib/config.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../lib/config.js")>();
  return { ...actual, isLocalPostgres: () => true };
});

const originalDatabaseUrl = process.env.DATABASE_URL;
const tempDir = mkdtempSync(path.join(os.tmpdir(), "entity-history-"));
const databasePath = path.join(tempDir, "history.db");
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.DB_VARIANT = "sqlite";

const database = new Database(databasePath);
database.exec(readFileSync(path.resolve("scripts/schema.sql"), "utf8"));
database.close();

const { prisma } = await import("../../lib/prisma.js");
const notes = await import("../notes/service.js");
const history = await import("./service.js");
const mcp = await import("../../mcp/service.js");
const { runWithTeamScope } = await import("../../lib/team-scope.js");

describe("entity history restore", () => {
  beforeAll(async () => {
    await prisma!.user.create({ data: { id: "history-user", email: "history@test.local", password: "test" } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects stale restores and saves safety revisions before a valid restore", async () => {
    const note = await notes.createNote({
      uid: "history-note",
      userId: "history-user",
      title: "Initial",
      content: "<p>Initial content</p>",
    });
    await notes.updateNote("history-note", "history-user", { title: "Changed", content: "<p>Changed</p>" });

    const opened = await history.listHistory("notes", "history-note", "history-user", 100);
    expect(opened?.revisions).toHaveLength(1);
    const revisionId = opened!.revisions[0].id;
    const detail = await history.readHistoryRevision("notes", "history-note", "history-user", revisionId);
    expect(detail?.snapshot).toMatchObject({ title: "Initial", content: "<p>Initial content</p>" });

    await new Promise(resolve => setTimeout(resolve, 5));
    await notes.updateNote("history-note", "history-user", { title: "Newer change" });
    await expect(history.restoreHistoryRevision({
      entityType: "notes",
      uid: "history-note",
      userId: "history-user",
      revisionId,
      expectedUpdatedAt: opened!.current_updated_at,
    })).resolves.toMatchObject({ status: "conflict" });

    const refreshed = await history.listHistory("notes", "history-note", "history-user", 100);
    await expect(history.restoreHistoryRevision({
      entityType: "notes",
      uid: "history-note",
      userId: "history-user",
      revisionId,
      expectedUpdatedAt: refreshed!.current_updated_at,
    })).resolves.toMatchObject({ status: "ok" });

    const restored = await prisma!.note.findUnique({ where: { id: (note as { id: number }).id } });
    expect(restored).toMatchObject({ title: "Initial", content: "<p>Initial content</p>", version: 3 });
    const revisions = await history.listHistory("notes", "history-note", "history-user", 100);
    expect(revisions?.revisions.map(item => item.change_type)).toEqual(["restore", "pre_restore", "update"]);
  });

  it("restores a proposed history revision only with exact confirmation", async () => {
    await notes.createNote({
      uid: "mcp-history-note",
      userId: "history-user",
      title: "MCP current",
      content: "<p>Current</p>",
    });
    await notes.updateNote("mcp-history-note", "history-user", { content: "<p>Newer</p>" });

    const opened = await history.listHistory("notes", "mcp-history-note", "history-user", 100);
    const proposal = await mcp.proposeHistoryRestore("history-user", "notes", "mcp-history-note", opened!.revisions[0].id);
    expect(proposal.preview).toMatchObject({ title: "MCP current", content_preview: "Current" });
    await expect(mcp.applyHistoryRestore("history-user", proposal.proposal_id, "00000000-0000-0000-0000-000000000000"))
      .rejects.toThrow(/exactly match/);
    await expect(mcp.applyHistoryRestore("history-user", proposal.proposal_id, proposal.confirmation))
      .resolves.toMatchObject({ status: "ok", type: "notes", uid: "mcp-history-note" });
  });

  it("shares Team history with collaborators and keeps the editing actor visible", async () => {
    const contributor = await prisma!.user.create({
      data: { id: "team-history-contributor", email: "contributor@test.local", name: "Contributor", password: "test" },
    });
    const reader = await prisma!.user.create({
      data: { id: "team-history-reader", email: "reader@test.local", name: "Reader", password: "test" },
    });
    const team = await prisma!.team.create({ data: { name: "History Team", createdBy: contributor.id } });
    const otherTeam = await prisma!.team.create({ data: { name: "Other History Team", createdBy: reader.id } });
    const project = await prisma!.project.create({
      data: { name: "Shared project", userId: contributor.id, teamId: team.id },
    });
    await prisma!.note.create({
      data: { uid: "shared-history-note", title: "Initial", content: "Initial content", userId: contributor.id, projectId: project.id },
    });

    await runWithTeamScope({ mode: "team", teamId: team.id }, () =>
      notes.updateNote("shared-history-note", contributor.id, { title: "Collaborated" }));
    const sharedHistory = await runWithTeamScope({ mode: "team", teamId: team.id }, () =>
      history.listHistory("notes", "shared-history-note", reader.id, 100));

    expect(sharedHistory?.revisions).toHaveLength(1);
    expect(sharedHistory?.revisions[0]).toMatchObject({
      change_type: "update",
      actor: { name: "Contributor", email: "contributor@test.local" },
    });
    const detail = await runWithTeamScope({ mode: "team", teamId: team.id }, () =>
      history.readHistoryRevision("notes", "shared-history-note", reader.id, sharedHistory!.revisions[0].id));
    expect(detail).toMatchObject({ actor: { name: "Contributor", email: "contributor@test.local" } });

    await expect(runWithTeamScope({ mode: "team", teamId: otherTeam.id }, () =>
      history.listHistory("notes", "shared-history-note", reader.id, 100))).resolves.toBeNull();
  });
});
