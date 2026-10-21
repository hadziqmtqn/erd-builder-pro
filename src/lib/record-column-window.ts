export type ColumnWindow = { start: number; end: number };

export function recordColumnWindow(widths: number[], scrollLeft: number, viewportWidth: number, selectionWidth = 0, overscan = 200): ColumnWindow {
  if (viewportWidth <= 0) return { start: 0, end: Math.min(12, widths.length) };
  const left = Math.max(0, scrollLeft - selectionWidth - overscan);
  const right = Math.max(left + 1, scrollLeft + viewportWidth - selectionWidth + overscan);
  let start = 0, end = 0, offset = 0;
  while (start < widths.length && offset + widths[start] <= left) offset += widths[start++];
  end = start;
  while (end < widths.length && offset < right) offset += widths[end++];
  return { start, end };
}

export function pinRecordColumns(window: ColumnWindow, columns: string[], pinned: Array<string | null>): ColumnWindow {
  let start = Math.min(window.start, columns.length), end = Math.min(window.end, columns.length);
  for (const column of pinned) {
    const index = column === null ? -1 : columns.indexOf(column);
    if (index < 0) continue;
    start = Math.min(start, index); end = Math.max(end, index + 1);
  }
  return { start, end };
}
