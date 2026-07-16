const typeLabels: Record<string, string> = {
  note: 'Note',
  diagram: 'ERD Diagram',
  flowchart: 'Flowchart',
  drawing: 'Drawing',
};

export function formatContextText(
  entityType: string,
  entity: { title: string; summary: string },
  siblings: { type: string; title: string; uid: string }[],
): string {
  const currentLabel = typeLabels[entityType] || entityType;

  const lines: string[] = [];
  lines.push(`[Current ${currentLabel}]:`);
  lines.push(entity.summary);

  if (siblings.length > 0) {
    lines.push(`\n[Related files in this project (${siblings.length})]:`);
    for (const sib of siblings) {
      lines.push(`  - ${sib.title} (${sib.type})`);
    }
  }

  return lines.join('\n');
}
