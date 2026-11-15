import { describe, expect, it } from "vitest";
import { describeNotification, groupNotifications, normalizeNotification, notificationTarget } from "./notifications";

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: "n1",
  type: "discussion.reply",
  team_id: "team-1",
  team_name: "Anind's Workspace",
  accessible: true,
  project_id: 7,
  link: "/diagrams/file-uid?thread=thread-1",
  actor: { id: "jay", name: "Jay Test" },
  payload: { file_name: "QA ERD", project_name: "QA" },
  read_at: null,
  created_at: "2026-11-15T01:00:00.000Z",
  ...overrides,
});

describe("notification wording", () => {
  it("names the actor, the action and the file and project", () => {
    expect(describeNotification(normalizeNotification(raw()))).toEqual({ title: "Jay Test replied to a discussion", detail: "QA ERD · QA" });
  });

  it("names the commented object and falls back when the actor or the action is unknown", () => {
    const comment = normalizeNotification(raw({ type: "comment.created", payload: { anchor_label: "users", file_name: "QA ERD" } }));
    expect(describeNotification(comment)).toEqual({ title: "Jay Test commented on users", detail: "QA ERD" });
    // camelCase keys still work for a payload that skipped the API's key conversion.
    expect(describeNotification(normalizeNotification(raw({ payload: { fileName: "Raw ERD" } }))).detail).toBe("Raw ERD");
    expect(describeNotification(normalizeNotification(raw({ actor: { id: "x", name: null } }))).title).toBe("A Team member replied to a discussion");
    expect(describeNotification(normalizeNotification(raw({ type: "sync.conflict", actor: null, payload: {} })))).toEqual({ title: "Found a sync conflict", detail: "Anind's Workspace" });
  });

  it("keeps only the Team name and event type for a Team the user can no longer open", () => {
    const item = normalizeNotification(raw({ accessible: false, team_name: "Old Team", actor: null, payload: {}, link: null }));
    expect(describeNotification(item)).toEqual({ title: "Discussion reply", detail: "Old Team · no longer available" });
  });
});

describe("notification grouping", () => {
  const items = [
    normalizeNotification(raw({ id: "a" })),
    normalizeNotification(raw({ id: "b", team_id: "team-2", team_name: "Tiger Workspace", project_id: 3, payload: { project_name: "Billing" } })),
    normalizeNotification(raw({ id: "c", project_id: 9, payload: { project_name: "Other" } })),
    normalizeNotification(raw({ id: "d", team_id: null, team_name: null, project_id: null, payload: {} })),
    normalizeNotification(raw({ id: "e" })),
  ];

  it("groups every workspace, then project, in the order of the newest item", () => {
    expect(groupNotifications(items, "all", "team-1").map((group) => ({
      label: group.label,
      projects: group.projects.map((project) => [project.label, project.items.map((item) => item.id)]),
    }))).toEqual([
      { label: "Anind's Workspace", projects: [["QA", ["a", "e"]], ["Other", ["c"]]] },
      { label: "Tiger Workspace", projects: [["Billing", ["b"]]] },
      { label: "Personal", projects: [[null, ["d"]]] },
    ]);
  });

  it("filters to the active workspace, where Personal is an empty or missing Team id", () => {
    expect(groupNotifications(items, "workspace", "team-2").map((group) => group.key)).toEqual(["team-2"]);
    expect(groupNotifications(items, "workspace", "").map((group) => group.key)).toEqual(["personal"]);
    expect(groupNotifications(items, "workspace", null).map((group) => group.key)).toEqual(["personal"]);
  });
});

describe("notification click target", () => {
  it("opens the link, switching workspace first when the item belongs to another one", () => {
    const item = normalizeNotification(raw());
    expect(notificationTarget(item, "team-1")).toEqual({ link: "/diagrams/file-uid?thread=thread-1" });
    expect(notificationTarget(item, "")).toEqual({ link: "/diagrams/file-uid?thread=thread-1", switchTo: "team-1" });
    expect(notificationTarget(normalizeNotification(raw({ team_id: null })), "team-1")).toEqual({ link: "/diagrams/file-uid?thread=thread-1", switchTo: null });
  });

  it("is not clickable without a link or for a Team the user can no longer open", () => {
    expect(notificationTarget(normalizeNotification(raw({ link: null })), "team-1")).toBeNull();
    expect(notificationTarget(normalizeNotification(raw({ accessible: false })), "team-1")).toBeNull();
  });
});
