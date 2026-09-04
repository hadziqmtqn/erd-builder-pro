import { MarkerType, type Edge } from '@xyflow/react';

export function styleErdEdges(edges: Edge[], selectedNodeIds: string[] = []): Edge[] {
  const hasSelection = selectedNodeIds.length > 0;

  return edges.map(edge => {
    const isConnectedToSelected = hasSelection && selectedNodeIds.some(
      id => edge.source === id || edge.target === id,
    );
    const edgeColor = isConnectedToSelected || edge.selected
      ? 'var(--edge-selected)'
      : 'var(--edge-color)';
    const classes = [edge.className];

    if (isConnectedToSelected) classes.push('edge-animated-active');
    else if (hasSelection) classes.push('edge-dimmed');

    return {
      ...edge,
      type: 'smoothstep' as const,
      style: {
        ...edge.style,
        stroke: edgeColor,
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.Arrow,
        color: edgeColor,
        width: 10,
        height: 10,
      },
      className: classes.filter(Boolean).join(' '),
    };
  });
}
