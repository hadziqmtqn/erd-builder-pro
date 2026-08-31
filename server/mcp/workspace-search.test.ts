import { describe, expect, it } from "vitest";
import { repositoryContainsPath, searchWorkspaceFiles } from "./workspace-search.js";

describe("MCP workspace search", () => {
  it("resolves a semantic project, feature, and document path", () => {
    const index = {
      projects: [{ id: 1, uid: "project-test", name: "Test" }],
      notes: [
        { id: 2, uid: "note-other", title: "Other", projectId: 1 },
        { id: 3, uid: "note-test", title: "Test saja", projectId: 1, updatedAt: new Date("2026-08-31T00:00:00Z") },
      ],
    };

    expect(searchWorkspaceFiles(index, "Notes > Test > Test saja")).toEqual([{
      type: "notes",
      uid: "note-test",
      name: "Test saja",
      path: "Notes > Test > Test saja",
      project_uid: "project-test",
      updated_at: new Date("2026-08-31T00:00:00Z"),
    }]);
  });

  it("matches a repository root or one of its nested working directories", () => {
    expect(repositoryContainsPath("/work/app", "/work/app/src/routes")).toBe(true);
    expect(repositoryContainsPath("/work/app", "/work/application")).toBe(false);
  });
});
