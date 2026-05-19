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
  lines.push(`[Context — ${currentLabel}]:`);
  lines.push(entity.summary);

  if (siblings.length > 0) {
    const iconMap: Record<string, string> = {
      note: '📄',
      diagram: '🗃️',
      flowchart: '📊',
      drawing: '🖼️',
    };
    lines.push(`\n[Related files in same project (${siblings.length})]:`);
    for (const sib of siblings) {
      const icon = iconMap[sib.type] || '📎';
      lines.push(`  ${icon} ${sib.title} (${sib.type})`);
    }
  }

  return lines.join('\n');
}
