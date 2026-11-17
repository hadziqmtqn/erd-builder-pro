/** NOT-001.2 helpers for the notification bell: response parsing, wording, grouping and click targets. */

export type NotificationItem = {
  id: string;
  type: string;
  teamId: string | null;
  teamName: string | null;
  accessible: boolean;
  projectId: number | null;
  link: string | null;
  /** Replies in one thread share a key; the bell shows them as one item (BUG-081). */
  groupKey: string | null;
  /** How many notifications this item stands for once grouped. */
  groupCount?: number;
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
    groupKey: text(raw.group_key ?? raw.groupKey),
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
  "file.deleted": "moved a file to Trash",
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
  "file.deleted": "File moved to Trash",
  "file.restored": "File restored",
  "file.moved": "File moved",
  "project.role_changed": "Role changed",
  "project.access_granted": "Access granted",
  "project.access_revoked": "Access removed",
  "team.member_added": "Added to a Team",
  "team.member_removed": "Removed from a Team",
  "sync.conflict": "Sync conflict",
};

const ROLE_LABELS: Record<string, string> = { editor: "Editor", commenter: "Commenter", viewer: "Viewer" };

/** NOT-001.8: the member reads about their own role; the Project creator also gets the member's name. */
function projectAccessAction(item: NotificationItem): string | null {
  if (item.type !== "project.access_granted" && item.type !== "project.role_changed") return null;
  const role = payloadText(item.payload, "role");
  const label = role ? ROLE_LABELS[role] ?? role : null;
  const member = payloadText(item.payload, "memberName");
  const whose = member ? `${member}'s` : "your";
  if (!label) return item.type === "project.role_changed" ? `reset ${whose} role to the default` : null;
  return item.type === "project.access_granted" ? `gave ${member ?? "you"} ${label} access` : `changed ${whose} role to ${label}`;
}

/** NOT-001.9: Managers read the member's name; the member reads the default "added you to a Team". */
function teamMemberAction(item: NotificationItem): string | null {
  const member = payloadText(item.payload, "memberName");
  if (!member) return null;
  if (item.type === "team.member_added") return `added ${member} to the Team`;
  return item.type === "team.member_removed" ? `removed ${member} from the Team` : null;
}

/** One line for who did what, one for where; a Team the user left shows only its name and the event type. */
export function describeNotification(item: NotificationItem): { title: string; detail: string | null } {
  if (!item.accessible) {
    return { title: LABELS[item.type] ?? "Activity", detail: `${item.teamName ?? "A Team"} · no longer available` };
  }
  const anchor = payloadText(item.payload, "anchorLabel");
  const action = projectAccessAction(item) ?? teamMemberAction(item)
    ?? (item.type === "comment.created" && anchor ? `commented on ${anchor}` : ACTIONS[item.type] ?? "had new activity");
  const actor = item.actorName ?? (item.hasActor ? "A Team member" : null);
  const count = item.groupCount && item.groupCount > 1 ? ` (${item.groupCount})` : "";
  const title = (actor ? `${actor} ${action}` : action.charAt(0).toUpperCase() + action.slice(1)) + count;
  const project = payloadText(item.payload, "projectName");
  const from = item.type === "file.moved" ? payloadText(item.payload, "fromProjectName") : null;
  const where = [payloadText(item.payload, "fileName"), from && project ? `${from} → ${project}` : project].filter(Boolean).join(" · ");
  return { title, detail: where || item.teamName };
}

/** Personal Workspace is null in items and "" or null as the active Team id. */
const sameWorkspace = (teamId: string | null, activeTeamId: string | null | undefined) => (teamId ?? null) === (activeTeamId || null);

/**
 * BUG-081: one bell item per thread across the whole list, as the server counts unread items. The newest notification
 * stands for the rest and stays unread while any of them is.
 */
function collapseGroups(items: NotificationItem[]): NotificationItem[] {
  const shown: NotificationItem[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of items) {
    const index = item.groupKey ? indexByKey.get(item.groupKey) : undefined;
    if (index === undefined) {
      if (item.groupKey) indexByKey.set(item.groupKey, shown.length);
      shown.push(item);
      continue;
    }
    const first = shown[index];
    shown[index] = { ...first, groupCount: (first.groupCount ?? 1) + 1, readAt: first.readAt && item.readAt ? first.readAt : null };
  }
  return shown;
}

export function groupNotifications(items: NotificationItem[], scope: NotificationScope, activeTeamId: string | null | undefined): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const item of collapseGroups(items)) {
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
