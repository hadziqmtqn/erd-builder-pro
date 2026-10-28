import { describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({ isLocalPostgres: () => true }));

import { commentableFileIdentifierWhere, creatorFileIdentifierWhere, editableFileIdentifierWhere, fileIdentifierWhere, fileScopeWhere, projectScopeWhere, runWithTeamScope } from "./team-scope.js";

describe("Team scope", () => {
  it("keeps Personal private and Team data constrained to the selected Team", () => {
    runWithTeamScope({ mode: "personal", teamId: null }, () => {
      expect(projectScopeWhere("user-1")).toEqual({ userId: "user-1", teamId: null });
      expect(fileScopeWhere("user-1")).toEqual({
        userId: "user-1",
        OR: [{ projectId: null }, { project: { userId: "user-1", teamId: null } }],
      });
    });

    runWithTeamScope({ mode: "team", teamId: "team-1" }, () => {
      expect(projectScopeWhere("user-1")).toEqual({ teamId: "team-1" });
      expect(fileIdentifierWhere("file-1", "user-1")).toEqual({
        AND: [{ uid: "file-1" }, { project: { teamId: "team-1" } }],
      });
      expect(creatorFileIdentifierWhere("file-1", "user-1")).toEqual({
        AND: [
          { AND: [{ uid: "file-1" }, { project: { teamId: "team-1" } }] },
          { userId: "user-1" },
        ],
      });
    });
  });

  it("lets the creator, Project creator, Team Manager and Project Editor change a Team file (COL-004)", () => {
    runWithTeamScope({ mode: "team", teamId: "team-1" }, () => {
      expect(editableFileIdentifierWhere("file-1", "user-1")).toEqual({
        AND: [
          { AND: [{ uid: "file-1" }, { project: { teamId: "team-1" } }] },
          {
            OR: [
              { userId: "user-1" },
              { project: { userId: "user-1", accessGrants: { none: { userId: "user-1" } } } },
              { project: { team: { members: { some: { userId: "user-1", role: "manager", status: "active" } } } } },
              { project: { accessGrants: { some: { userId: "user-1", role: "editor" } } } },
            ],
          },
        ],
      });
    });
  });

  it("lets everyone except an explicit Viewer comment on a Team file (COL-004)", () => {
    runWithTeamScope({ mode: "team", teamId: "team-1" }, () => {
      expect(commentableFileIdentifierWhere("file-1", "user-1")).toEqual({
        AND: [
          { AND: [{ uid: "file-1" }, { project: { teamId: "team-1" } }] },
          {
            OR: [
              { userId: "user-1" },
              { project: { userId: "user-1", accessGrants: { none: { userId: "user-1" } } } },
              { project: { team: { members: { some: { userId: "user-1", role: "manager", status: "active" } } } } },
              { NOT: { project: { accessGrants: { some: { userId: "user-1", role: "viewer" } } } } },
            ],
          },
        ],
      });
    });
  });

  it("keeps Personal files writable by their owner only and never consults grants", () => {
    runWithTeamScope({ mode: "personal", teamId: null }, () => {
      expect(editableFileIdentifierWhere("file-1", "user-1")).toEqual(creatorFileIdentifierWhere("file-1", "user-1"));
      expect(commentableFileIdentifierWhere("file-1", "user-1")).toEqual(fileIdentifierWhere("file-1", "user-1"));
    });
  });
});
