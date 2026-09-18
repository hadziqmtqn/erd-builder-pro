export function isFileCreator(item: any, userId?: string | null, isGuest = false): boolean {
  if (isGuest) return true;
  const ownerId = item?.user_id ?? item?.userId;
  return Boolean(ownerId && userId && String(ownerId) === String(userId));
}
