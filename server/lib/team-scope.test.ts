import { describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({ isLocalPostgres: () => true }));

import { fileIdentifierWhere, fileScopeWhere, projectScopeWhere, runWithTeamScope } from "./team-scope.js";

describe("Team scope", () => {
  it("keeps Personal private and Team data constrained to the selected Team", () => {
    runWithTeamScope({ mode: "personal", teamId: null }, () => {
      expect(projectScopeWhere("user-1")).toEqual({ userId: "user-1", teamId: null });
      expect(fileScopeWhere("user-1")).toEqual({
        userId: "user-1",
        OR: [{ projectId: null }, { project: { teamId: null } }],
      });
    });

    runWithTeamScope({ mode: "team", teamId: "team-1" }, () => {
      expect(projectScopeWhere("user-1")).toEqual({ teamId: "team-1" });
      expect(fileIdentifierWhere("file-1", "user-1")).toEqual({
        AND: [{ uid: "file-1" }, { project: { teamId: "team-1" } }],
      });
    });
  });
});
