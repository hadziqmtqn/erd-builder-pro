import { createContext, useContext, useMemo } from 'react';
import { BaseEdge, Position, useReactFlow, type EdgeProps, type Node } from '@xyflow/react';
import { edgeRoutingObstacles, roundedRoutePath, routeErdEdge, type RouteObstacle } from '@/lib/erd-routing';
import { tableSize } from '@/lib/erd-geometry';
import type { Entity } from '@/types';
import { ERDEdgeLabelsContext } from './ERDEdgeLabels';
import { labelPoint, showErdLabel } from '@/lib/erd-edge-labels';

export const ERDRoutingContext = createContext<RouteObstacle[]>([]);

export function ERDRoutedEdge(props: EdgeProps) {
  const tables = useContext(ERDRoutingContext);
  const labels = useContext(ERDEdgeLabelsContext);
  const { getInternalNode } = useReactFlow<Node<Entity>>();
  const routed = useMemo(() => {
    const endpoints = [getInternalNode(props.source), getInternalNode(props.target)].flatMap(node => node
      ? [{ id: node.id, ...node.internals.positionAbsolute, ...tableSize(node) }] : []);
    // Endpoint coordinates and their table bounds must come from the same live frame.
    const obstacles = edgeRoutingObstacles(tables, endpoints);
    const points = routeErdEdge(
      { x: props.sourceX, y: props.sourceY }, { x: props.targetX, y: props.targetY },
      props.sourcePosition === Position.Right, props.targetPosition === Position.Right, obstacles,
    );
    return { points, obstacles };
  }, [props.source, props.target, props.sourceX, props.sourceY, props.targetX, props.targetY, props.sourcePosition, props.targetPosition, tables, getInternalNode]);
  const { points, obstacles } = routed;
  const path = roundedRoutePath(points);
  const anchor = labels.anchors.get(props.id);
  const position = anchor ? labelPoint(points, anchor, obstacles) : null;
  const visible = position && showErdLabel(props.id, labels.anchors, labels.activeId);
  const active = labels.activeId === props.id || props.selected;
  return <g className={active ? 'erd-edge-active' : undefined}>
    {props.label != null && <title>{String(props.label)}</title>}
    <BaseEdge id={props.id} path={path} markerStart={props.markerStart} markerEnd={props.markerEnd}
      style={props.style}
      interactionWidth={props.interactionWidth} label={visible ? props.label : undefined} labelX={position?.x} labelY={position?.y}
      labelStyle={active ? { ...props.labelStyle, fill: 'var(--edge-selected)', fontWeight: 600 } : props.labelStyle}
      labelShowBg={props.labelShowBg} labelBgStyle={props.labelBgStyle} />
  </g>;
}
