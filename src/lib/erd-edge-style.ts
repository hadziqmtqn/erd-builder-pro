import { MarkerType, type Edge } from '@xyflow/react';

export function styleErdEdges(edges: Edge[], selectedNodeIds: string[] = [], hoveredEdgeId: string | null = null): Edge[] {
  const hasSelection = selectedNodeIds.length > 0;
  // elevateEdgesOnSelect is off, so raise the selected relationship here; hover stays above it.
  const topLayer = Math.max(0, ...edges.map(edge => edge.zIndex ?? 0));
  const selectedLayer = topLayer + 1000;
  const hoverLayer = topLayer + 1001;

  return edges.map(edge => {
    const isConnectedToSelected = hasSelection && selectedNodeIds.some(
      id => edge.source === id || edge.target === id,
    );
    const edgeColor = isConnectedToSelected || edge.selected || edge.id === hoveredEdgeId
      ? 'var(--edge-selected)'
      : 'var(--edge-color)';
    const classes = [edge.className];

    if (isConnectedToSelected) classes.push('edge-animated-active');
    else if (hasSelection) classes.push('edge-dimmed');

    return {
      ...edge,
      ...(edge.selected ? { zIndex: selectedLayer } : {}),
      ...(edge.id === hoveredEdgeId ? { zIndex: hoverLayer } : {}),
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
