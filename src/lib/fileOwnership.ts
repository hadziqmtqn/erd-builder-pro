/** Project-level role of the signed-in user on a Team file (COL-004). */
export type FileAccessRole = 'owner' | 'manager' | 'editor' | 'commenter' | 'viewer';

const FILE_ROLES: ReadonlySet<string> = new Set(['owner', 'manager', 'editor', 'commenter', 'viewer']);

export function isFileCreator(item: any, userId?: string | null, isGuest = false): boolean {
  if (isGuest) return true;
  const ownerId = item?.user_id ?? item?.userId;
  return Boolean(ownerId && userId && String(ownerId) === String(userId));
}

/**
 * The server's role for this file wins, because it also limits a Project creator a Manager restricted on their own
 * files (COL-007); without it the creator owns the file and anyone else gets the Project's role.
 * Null means the role is not known yet (for example a list row that has not been opened).
 */
export function fileAccessRole(item: any, userId?: string | null, isGuest = false, projectRole?: string | null): FileAccessRole | null {
  if (isGuest) return 'owner';
  const serverRole = item?.accessRole ?? item?.access_role;
  if (typeof serverRole === 'string' && FILE_ROLES.has(serverRole)) return serverRole as FileAccessRole;
  if (isFileCreator(item, userId, isGuest)) return 'owner';
  return typeof projectRole === 'string' && FILE_ROLES.has(projectRole) ? projectRole as FileAccessRole : null;
}

/** True when the file opens read-only: a Commenter or Viewer, or someone else's file whose role is not known yet (DATA-004). */
export function isFileViewer(item: any, userId?: string | null, isGuest = false, projectRole?: string | null): boolean {
  if (isGuest) return false;
  const role = fileAccessRole(item, userId, isGuest, projectRole);
  if (role) return role === 'commenter' || role === 'viewer';
  const ownerId = item?.user_id ?? item?.userId;
  return Boolean(ownerId && userId && String(ownerId) !== String(userId));
}

/** Everyone with access may comment except an explicit Viewer. */
export function canCommentOnFile(item: any, userId?: string | null, isGuest = false, projectRole?: string | null): boolean {
  return fileAccessRole(item, userId, isGuest, projectRole) !== 'viewer';
}

/** Describes why a file is read-only, for the notice above its content. Null when the user may edit it. */
export function readOnlyNotice(role: FileAccessRole | null, ownerName: string, ownFile = false): string | null {
  // Only a Project creator a Manager limited reads their own file this way (COL-007).
  if (ownFile && (role === 'viewer' || role === 'commenter')) {
    return `${role === 'viewer' ? 'View only' : 'Comment only'} · A Team Manager limited your access to this Project, including the files you created.`;
  }
  if (role === 'viewer') return `View only · ${ownerName} owns this file. You can read it, but not comment or edit.`;
  if (role === 'commenter' || role === null) return `Comment only · ${ownerName} owns this file. Ask them or a Manager for edit access.`;
  return null;
}
