import { describe, it, expect } from 'vitest';
import { autoLayoutFlowchart } from '../autoLayoutFlowchart';
import { Node, Edge } from '@xyflow/react';
import { FlowchartNodeData } from '@/components/FlowchartNode';

function makeNode(
  id: string,
  label: string,
  shape: string = 'rectangle',
  section?: string,
): Node<FlowchartNodeData> {
  return {
    id,
    type: 'flowchart',
    position: { x: 0, y: 0 },
    data: {
      label,
      shape,
      color: '#8b5cf6',
      ...(section ? { section } : {}),
    },
  };
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: 'smoothstep',
    ...(label ? { label } : {}),
  };
}

describe('autoLayoutFlowchart', () => {
  it('returns empty result when no nodes given', () => {
    const result = autoLayoutFlowchart([], []);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('positions a single node at start coordinates', () => {
    const nodes = [makeNode('n1', 'Start')];
    const result = autoLayoutFlowchart(nodes, []);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].position.x).toBeGreaterThanOrEqual(80);
    expect(result.nodes[0].position.y).toBeGreaterThanOrEqual(80);
  });

  it('positions Start node first even when not first in array', () => {
    const nodes = [
      makeNode('n2', 'End'),
      makeNode('n1', 'Start', 'oval'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = autoLayoutFlowchart(nodes, edges);

    const startNode = result.nodes.find(n => n.id === 'n1')!;
    const endNode = result.nodes.find(n => n.id === 'n2')!;
    expect(startNode.position.y).toBeLessThan(endNode.position.y);
  });

  it('lays out linear Start → Process → End chain vertically', () => {
    const nodes = [
      makeNode('n1', 'Start', 'oval'),
      makeNode('n2', 'Process', 'rectangle'),
      makeNode('n3', 'End', 'oval'),
    ];
    const edges = [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3'),
    ];

    const result = autoLayoutFlowchart(nodes, edges);
    const n1 = result.nodes.find(n => n.id === 'n1')!;
    const n2 = result.nodes.find(n => n.id === 'n2')!;
    const n3 = result.nodes.find(n => n.id === 'n3')!;

    expect(n1.position.y).toBeLessThan(n2.position.y);
    expect(n2.position.y).toBeLessThan(n3.position.y);
  });

  it('assigns handles for linear chain edges', () => {
    const nodes = [
      makeNode('n1', 'Start', 'oval'),
      makeNode('n2', 'Process', 'rectangle'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = autoLayoutFlowchart(nodes, edges);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].sourceHandle).toBeDefined();
    expect(result.edges[0].targetHandle).toBeDefined();
  });

  it('places Yes branch to the right of diamond and No to the left', () => {
    const nodes = [
      makeNode('n1', 'Start', 'oval'),
      makeNode('n2', 'Decision', 'diamond'),
      makeNode('n3', 'Yes Action', 'rectangle'),
      makeNode('n4', 'No Action', 'rectangle'),
      makeNode('n5', 'End', 'oval'),
    ];
    const edges = [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3', 'Yes'),
      makeEdge('n2', 'n4', 'No'),
      makeEdge('n3', 'n5'),
      makeEdge('n4', 'n5'),
    ];

    const result = autoLayoutFlowchart(nodes, edges);
    const yesNode = result.nodes.find(n => n.id === 'n3')!;
    const noNode = result.nodes.find(n => n.id === 'n4')!;
    const decisionNode = result.nodes.find(n => n.id === 'n2')!;

    // Yes goes right (higher x), No goes left (lower x)
    expect(yesNode.position.x).toBeGreaterThan(decisionNode.position.x);
    expect(noNode.position.x).toBeLessThan(decisionNode.position.x);
  });

  it('handles nodes not connected to any root', () => {
    const nodes = [
      makeNode('n1', 'Start', 'oval'),
      makeNode('n2', 'Orphan', 'rectangle'),
    ];

    const result = autoLayoutFlowchart(nodes, []);
    expect(result.nodes).toHaveLength(2);
    // Both should have valid positions
    for (const node of result.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('assigns section badges for Start nodes with section', () => {
    const nodes = [
      makeNode('n1', 'Start Login', 'oval', 'Login Flow'),
      makeNode('n2', 'Validate', 'rectangle'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = autoLayoutFlowchart(nodes, edges);
    expect(result.nodes).toHaveLength(2);
  });

  it('assigns each node a width and height via style', () => {
    const nodes = [
      makeNode('n1', 'Start', 'oval'),
      makeNode('n2', 'Process', 'rectangle'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = autoLayoutFlowchart(nodes, edges);

    for (const node of result.nodes) {
      expect(node.style).toBeDefined();
      expect(typeof (node.style as any)?.width).toBe('number');
      expect(typeof (node.style as any)?.height).toBe('number');
    }
  });

  it('converges branches back to same End node', () => {
    const nodes = [
      makeNode('n1', 'Start', 'oval'),
      makeNode('n2', 'Decision', 'diamond'),
      makeNode('n3', 'Yes Path', 'rectangle'),
      makeNode('n4', 'No Path', 'rectangle'),
      makeNode('n5', 'End', 'oval'),
    ];
    const edges = [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3', 'Yes'),
      makeEdge('n2', 'n4', 'No'),
      makeEdge('n3', 'n5'),
      makeEdge('n4', 'n5'),
    ];

    const result = autoLayoutFlowchart(nodes, edges);
    const endNode = result.nodes.find(n => n.id === 'n5')!;
    expect(Number.isFinite(endNode.position.x)).toBe(true);
    expect(Number.isFinite(endNode.position.y)).toBe(true);
  });

  it('handles diamond with only Yes branch (no No)', () => {
    const nodes = [
      makeNode('n1', 'Start', 'oval'),
      makeNode('n2', 'Check', 'diamond'),
      makeNode('n3', 'Proceed', 'rectangle'),
    ];
    const edges = [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3', 'Yes'),
    ];

    const result = autoLayoutFlowchart(nodes, edges);
    const checkNode = result.nodes.find(n => n.id === 'n2')!;
    const proceedNode = result.nodes.find(n => n.id === 'n3')!;
    expect(proceedNode.position.x).toBeGreaterThan(checkNode.position.x);
  });

  it('does not crash with 50+ nodes', () => {
    const nodes = [
      makeNode('start', 'Start', 'oval'),
      ...Array.from({ length: 49 }, (_, i) =>
        makeNode(`n${i}`, `Node ${i}`, 'rectangle'),
      ),
    ];
    const edges = nodes.slice(0, -1).map((n, i) =>
      makeEdge(n.id, nodes[i + 1].id),
    );

    const result = autoLayoutFlowchart(nodes, edges);
    expect(result.nodes).toHaveLength(50);
    for (const node of result.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });
});
