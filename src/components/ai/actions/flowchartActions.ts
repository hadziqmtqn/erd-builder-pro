import { Node, Edge, MarkerType } from '@xyflow/react';
import { FlowchartNodeData } from '../../FlowchartNode';

export interface FlowchartApplyResult {
  nodes: Node<FlowchartNodeData>[];
  edges: Edge[];
}

function extractJSONFromMarkdown(text: string): string {
  const jsonBlockRegex = /```(?:json)?\n?([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    if (content.length > 0) blocks.push(content);
  }
  if (blocks.length > 0) return blocks.join('\n');
  return text.trim();
}

/**
 * Applies AI response to flowchart.
 * 
 * Expected JSON format:
 * {
 *   "nodes": [ { "label": "Start", "shape": "oval", "color": "#..." }, ... ],
 *   "edges": [ { "sourceLabel": "Start", "targetLabel": "Process", "label": "Yes" }, ... ]
 * }
 */
export function applyToFlowchartContent(
  currentNodes: Node<FlowchartNodeData>[],
  currentEdges: Edge[],
  aiResponse: string
): FlowchartApplyResult | null {
  const jsonStr = extractJSONFromMarkdown(aiResponse);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try { parsed = JSON.parse(objMatch[0]); } catch { return null; }
  }

  if (!parsed || !Array.isArray(parsed.nodes)) return null;

  const newNodes: Node<FlowchartNodeData>[] = [];
  const newEdges: Edge[] = [];

  // 1. Calculate offset for new nodes to avoid overlapping (Multi-case support)
  // We'll place the new case below the existing ones
  const maxY = currentNodes.reduce((max, n) => Math.max(max, n.position.y + 150), 50);
  const startX = 50;

  // Map to track label -> node ID for edge creation
  const labelToId = new Map<string, string>();
  
  // 2. Process Nodes
  parsed.nodes.forEach((nodeData: any, index: number) => {
    const id = `ai_node_${Date.now()}_${index}`;
    labelToId.set(nodeData.label.toLowerCase(), id);

    // Basic grid layout for new nodes if they don't have positions
    // Usually AI won't give positions, so we layout them vertically or horizontally
    // Let's do a simple vertical stack for simplicity, users can move them
    const col = index % 3;
    const row = Math.floor(index / 3);

    newNodes.push({
      id,
      type: 'custom',
      position: { 
        x: startX + (col * 250), 
        y: maxY + (row * 150) 
      },
      data: {
        label: nodeData.label || 'New Step',
        shape: nodeData.shape || 'rectangle',
        color: nodeData.color || '#8b5cf6',
      },
    });
  });

  // 3. Process Edges
  if (Array.isArray(parsed.edges)) {
    parsed.edges.forEach((edgeData: any, index: number) => {
      const sourceId = labelToId.get(edgeData.sourceLabel?.toLowerCase());
      const targetId = labelToId.get(edgeData.targetLabel?.toLowerCase());

      if (sourceId && targetId) {
        newEdges.push({
          id: `ai_edge_${Date.now()}_${index}`,
          source: sourceId,
          target: targetId,
          label: edgeData.label,
          type: 'smoothstep',
          style: { stroke: '#b1b1b7' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
          labelBgStyle: { fill: '#1e1e24' },
          labelStyle: { fill: '#fff' },
        });
      }
    });
  }

  return {
    nodes: [...currentNodes, ...newNodes],
    edges: [...currentEdges, ...newEdges],
  };
}
