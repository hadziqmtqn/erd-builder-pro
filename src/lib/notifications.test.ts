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

  it("names only the shape of a Flowchart comment, since the detail line names the file (BUG-095)", () => {
    const comment = (anchor: string, fileName = "QA rc3 NOT-001 Flowchart") => describeNotification(normalizeNotification(raw({
      type: "comment.created",
      payload: { anchor_label: anchor, file_name: fileName, project_name: "QA Claude" },
    })));
    expect(comment("QA rc3 NOT-001 Flowchart · Fetch Data")).toEqual({ title: "Jay Test commented on Fetch Data", detail: "QA rc3 NOT-001 Flowchart · QA Claude" });
    // A Note block reads the same way; a shape label with its own separator stays whole.
    expect(comment("Spec · Block", "Spec").title).toBe("Jay Test commented on Block");
    expect(comment("Flow · Validate · retry", "Flow").title).toBe("Jay Test commented on Validate · retry");
    // A label stored before the file was renamed no longer starts with its name and stays as it is.
    expect(comment("Old name · Fetch Data", "New name").title).toBe("Jay Test commented on Old name · Fetch Data");
    // An ERD table that merely starts like the file name keeps its whole name.
    expect(comment("QA ERD audit", "QA ERD").title).toBe("Jay Test commented on QA ERD audit");
  });

  it("names the new Project role, and whose it is when the creator reads about a member (NOT-001.8)", () => {
    const granted = normalizeNotification(raw({ type: "project.access_granted", payload: { project_name: "Billing", role: "editor", previous_role: null } }));
    expect(describeNotification(granted)).toEqual({ title: "Jay Test gave you Editor access", detail: "Billing" });
    const changed = normalizeNotification(raw({ type: "project.role_changed", payload: { project_name: "Billing", role: "viewer", previous_role: "editor", member_name: "Ed" } }));
    expect(describeNotification(changed).title).toBe("Jay Test changed Ed's role to Viewer");
    const reset = normalizeNotification(raw({ type: "project.role_changed", payload: { project_name: "Billing", role: null, previous_role: "editor" } }));
    expect(describeNotification(reset).title).toBe("Jay Test reset your role to the default");
  });

  it("names the member for Managers and speaks to the member otherwise (NOT-001.9)", () => {
    const managers = normalizeNotification(raw({ type: "team.member_added", payload: { member_name: "Ed" } }));
    expect(describeNotification(managers).title).toBe("Jay Test added Ed to the Team");
    const removed = normalizeNotification(raw({ type: "team.member_removed", payload: { member_name: "Ed" } }));
    expect(describeNotification(removed).title).toBe("Jay Test removed Ed from the Team");
    const member = normalizeNotification(raw({ type: "team.member_added", payload: {} }));
    expect(describeNotification(member)).toEqual({ title: "Jay Test added you to a Team", detail: "Anind's Workspace" });
  });

  it("shows where a moved file came from and went to (NOT-001.7), and that a deleted one is in the Trash (NOT-001.6)", () => {
    const moved = normalizeNotification(raw({ type: "file.moved", payload: { file_name: "Spec", project_name: "Ops", from_project_name: "Billing" } }));
    expect(describeNotification(moved)).toEqual({ title: "Jay Test moved a file", detail: "Spec · Billing → Ops" });
    const trashed = normalizeNotification(raw({ type: "file.deleted", payload: { file_name: "Spec", project_name: "Ops" } }));
    expect(describeNotification(trashed)).toEqual({ title: "Jay Test moved a file to Trash", detail: "Spec · Ops" });
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

  it("shows the replies of one thread as one item, unread while any reply is (BUG-081)", () => {
    const items = [
      raw({ id: "n3", group_key: "discussion:thread-1", read_at: "2026-11-15T03:00:00.000Z", created_at: "2026-11-15T03:00:00.000Z" }),
      raw({ id: "n2", group_key: "discussion:thread-1", created_at: "2026-11-15T02:00:00.000Z" }),
      raw({ id: "n1", group_key: "discussion:thread-2", created_at: "2026-11-15T01:00:00.000Z" }),
      raw({ id: "n0", type: "file.deleted", group_key: null }),
    ].map(normalizeNotification);
    const shown = groupNotifications(items, "all", "team-1")[0].projects[0].items;
    expect(shown.map((item) => [item.id, item.groupCount ?? 1, item.readAt])).toEqual([["n3", 2, null], ["n1", 1, null], ["n0", 1, null]]);
    expect(describeNotification(shown[0]).title).toBe("Jay Test replied to a discussion (2)");
    expect(describeNotification(shown[1]).title).toBe("Jay Test replied to a discussion");
  });

  it("keeps one item per thread even after its file moved to another Project, as the unread count does", () => {
    const items = [
      raw({ id: "n2", group_key: "comment:thread-9", project_id: 8, created_at: "2026-11-15T02:00:00.000Z" }),
      raw({ id: "n1", group_key: "comment:thread-9", project_id: 7, created_at: "2026-11-15T01:00:00.000Z" }),
    ].map(normalizeNotification);
    const projects = groupNotifications(items, "all", "team-1")[0].projects;
    expect(projects.map((project) => [project.key, project.items.map((item) => [item.id, item.groupCount])])).toEqual([["8", [["n2", 2]]]]);
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
