const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function replaceColumnIdInHandle(
  handle: string | null,
  fromId: string,
  toId: string,
): string | null {
  const match = handle?.match(/^col-(.+)-((?:source|target)(?:-[lr])?)$/);
  if (!match || match[1] !== fromId) return handle ?? null;
  return `col-${toId}-${match[2]}`;
}
