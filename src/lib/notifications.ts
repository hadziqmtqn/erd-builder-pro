/** NOT-001.2 helpers for the notification bell: response parsing, wording, grouping and click targets. */

export type NotificationItem = {
  id: string;
  type: string;
  teamId: string | null;
  teamName: string | null;
  accessible: boolean;
  projectId: number | null;
  link: string | null;
  actorName: string | null;
  hasActor: boolean;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationScope = "workspace" | "all";
export type NotificationGroup = {
  key: string;
  label: string;
  projects: Array<{ key: string; label: string | null; items: NotificationItem[] }>;
};

type Raw = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
/** The API turns payload keys into snake_case like every other key, so `fileName` arrives as `file_name`. */
const payloadText = (payload: Raw, key: string) => text(payload[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] ?? payload[key]);

export function normalizeNotification(raw: Raw): NotificationItem {
  const actor = raw.actor && typeof raw.actor === "object" ? raw.actor as Raw : null;
  const payload = raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload as Raw : {};
  const projectId = Number(raw.project_id ?? raw.projectId);
  return {
    id: String(raw.id ?? ""),
    type: String(raw.type ?? ""),
    teamId: text(raw.team_id ?? raw.teamId),
    teamName: text(raw.team_name ?? raw.teamName),
    accessible: (raw.accessible ?? true) !== false,
    projectId: Number.isFinite(projectId) && projectId > 0 ? projectId : null,
    link: text(raw.link),
    actorName: actor ? text(actor.name) : null,
    hasActor: Boolean(actor),
    payload,
    readAt: text(raw.read_at ?? raw.readAt),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  };
}

const ACTIONS: Record<string, string> = {
  "discussion.reply": "replied to a discussion",
  "comment.created": "commented",
  "file.deleted": "deleted a file",
  "file.restored": "restored a file",
  "file.moved": "moved a file",
  "project.role_changed": "changed your role",
  "project.access_granted": "gave you access",
  "project.access_revoked": "removed your access",
  "team.member_added": "added you to a Team",
  "team.member_removed": "removed you from a Team",
  "sync.conflict": "found a sync conflict",
};
const LABELS: Record<string, string> = {
  "discussion.reply": "Discussion reply",
  "comment.created": "New comment",
  "file.deleted": "File deleted",
  "file.restored": "File restored",
  "file.moved": "File moved",
  "project.role_changed": "Role changed",
  "project.access_granted": "Access granted",
  "project.access_revoked": "Access removed",
  "team.member_added": "Added to a Team",
  "team.member_removed": "Removed from a Team",
  "sync.conflict": "Sync conflict",
};

/** One line for who did what, one for where; a Team the user left shows only its name and the event type. */
export function describeNotification(item: NotificationItem): { title: string; detail: string | null } {
  if (!item.accessible) {
    return { title: LABELS[item.type] ?? "Activity", detail: `${item.teamName ?? "A Team"} · no longer available` };
  }
  const anchor = payloadText(item.payload, "anchorLabel");
  const action = item.type === "comment.created" && anchor ? `commented on ${anchor}` : ACTIONS[item.type] ?? "had new activity";
  const actor = item.actorName ?? (item.hasActor ? "A Team member" : null);
  const title = actor ? `${actor} ${action}` : action.charAt(0).toUpperCase() + action.slice(1);
  const where = [payloadText(item.payload, "fileName"), payloadText(item.payload, "projectName")].filter(Boolean).join(" · ");
  return { title, detail: where || item.teamName };
}

/** Personal Workspace is null in items and "" or null as the active Team id. */
const sameWorkspace = (teamId: string | null, activeTeamId: string | null | undefined) => (teamId ?? null) === (activeTeamId || null);

export function groupNotifications(items: NotificationItem[], scope: NotificationScope, activeTeamId: string | null | undefined): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const item of items) {
    if (scope === "workspace" && !sameWorkspace(item.teamId, activeTeamId)) continue;
    const key = item.teamId ?? "personal";
    let group = groups.get(key);
    if (!group) {
      group = { key, label: item.teamId ? item.teamName ?? "Team" : "Personal", projects: [] };
      groups.set(key, group);
    }
    const projectKey = item.projectId === null ? "none" : String(item.projectId);
    let project = group.projects.find((entry) => entry.key === projectKey);
    if (!project) {
      project = { key: projectKey, label: item.accessible ? payloadText(item.payload, "projectName") : null, items: [] };
      group.projects.push(project);
    }
    project.items.push(item);
  }
  return [...groups.values()];
}

/** Where a click goes: nothing for an item without a usable link, else the link, switching workspace first if needed. */
export function notificationTarget(item: NotificationItem, activeTeamId: string | null | undefined):
  { link: string; switchTo?: string | null } | null {
  if (!item.accessible || !item.link) return null;
  return sameWorkspace(item.teamId, activeTeamId) ? { link: item.link } : { link: item.link, switchTo: item.teamId };
}
