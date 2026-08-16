import type { Column } from '@/types';

export function reorderColumns(
  columns: Column[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after',
) {
  if (sourceId === targetId) return null;

  const sorted = [...columns].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const source = sorted.find(column => column.id === sourceId);
  if (!source) return null;

  const reordered = sorted.filter(column => column.id !== sourceId);
  const targetIndex = reordered.findIndex(column => column.id === targetId);
  if (targetIndex === -1) return null;

  reordered.splice(targetIndex + (position === 'after' ? 1 : 0), 0, source);
  return reordered.map((column, index) => ({ ...column, sort_order: index }));
}
