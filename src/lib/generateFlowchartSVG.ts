import { Node, Edge } from '@xyflow/react';
import { FlowchartNodeData } from '../components/FlowchartNode';

export const NODE_W = 160;
export const NODE_H = 70;

type HandleSide = 'top' | 'bottom' | 'left' | 'right';

function computeHandlePoints(pos: { x: number; y: number }) {
  return [
    { x: pos.x + NODE_W / 2, y: pos.y },
    { x: pos.x + NODE_W / 2, y: pos.y + NODE_H },
    { x: pos.x, y: pos.y + NODE_H / 2 },
    { x: pos.x + NODE_W, y: pos.y + NODE_H / 2 },
  ];
}

function getHandlePos(pos: { x: number; y: number }, side: HandleSide) {
  return computeHandlePoints(pos)[['top', 'bottom', 'left', 'right'].indexOf(side)];
}

function pickClosestHandles(srcNode: Node, tgtNode: Node) {
  const HANDLE_SIDES: HandleSide[] = ['top', 'bottom', 'left', 'right'];
  const srcPts = computeHandlePoints(srcNode.position);
  const tgtPts = computeHandlePoints(tgtNode.position);
  let bestDist = Infinity, bestSrc = 0, bestTgt = 0;
  for (let si = 0; si < 4; si++) {
    for (let ti = 0; ti < 4; ti++) {
      const dx = srcPts[si].x - tgtPts[ti].x;
      const dy = srcPts[si].y - tgtPts[ti].y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; bestSrc = si; bestTgt = ti; }
    }
  }
  return { sourceHandle: HANDLE_SIDES[bestSrc], targetHandle: HANDLE_SIDES[bestTgt] };
}

function buildEdgePath(
  srcPos: { x: number; y: number },
  srcSide: HandleSide,
  tgtPos: { x: number; y: number },
  tgtSide: HandleSide,
) {
  const vertical = srcSide === 'bottom' || srcSide === 'top' || tgtSide === 'bottom' || tgtSide === 'top';
  if (vertical) {
    const midY = (srcPos.y + tgtPos.y) / 2;
    return `M${srcPos.x},${srcPos.y} L${srcPos.x},${midY} L${tgtPos.x},${midY} L${tgtPos.x},${tgtPos.y}`;
  }
  const midX = (srcPos.x + tgtPos.x) / 2;
  return `M${srcPos.x},${srcPos.y} L${midX},${srcPos.y} L${midX},${tgtPos.y} L${tgtPos.x},${tgtPos.y}`;
}

function shapeBodySVG(shape: string, color: string, gradId: string): string {
  const w = NODE_W;
  const h = NODE_H;
  const sw = 2;

  switch (shape) {
    case 'diamond':
      return `<polygon points="${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" filter="url(#shadow)" />`;
    case 'parallelogram':
      return `<polygon points="${w * 0.2},2 ${w - 2},2 ${w * 0.8},${h - 2} 2,${h - 2}" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" filter="url(#shadow)" />`;
    case 'oval':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" filter="url(#shadow)" />`;
    case 'circle': {
      const r = Math.min(w, h) / 2 - 2;
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" filter="url(#shadow)" />`;
    }
    case 'database':
      return `<g>
        <path d="M2,${h * 0.2} L2,${h - h * 0.2} C2,${h - 2} ${w - 2},${h - 2} ${w - 2},${h - h * 0.2} L${w - 2},${h * 0.2}" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" filter="url(#shadow)" />
        <ellipse cx="${w / 2}" cy="${h * 0.2}" rx="${w / 2 - 2}" ry="${h * 0.15}" fill="${color}30" stroke="${color}" stroke-width="${sw}" filter="url(#shadow)" />
        <path d="M2,${h * 0.5} C2,${h * 0.5 + h * 0.15} ${w - 2},${h * 0.5 + h * 0.15} ${w - 2},${h * 0.5}" fill="none" stroke="${color}" stroke-width="${sw}" opacity="0.3" />
      </g>`;
    case 'document':
      return `<g filter="url(#shadow)">
        <path d="M2,2 L${w - w * 0.3},2 L${w - 2},${h * 0.3} L${w - 2},${h - 2} L2,${h - 2} Z" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" />
        <path d="M${w - w * 0.3},2 V${h * 0.3} H${w - 2}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" />
      </g>`;
    case 'cloud':
      return `<path d="M${w * 0.25},${h - 2} Q2,${h - 4} 2,${h * 0.55} Q2,${h * 0.2} ${w * 0.45},${h * 0.25} Q${w * 0.4},2 ${w * 0.65},${h * 0.2} Q${w - 2},${h * 0.15} ${w - 2},${h * 0.45} Q${w - 2},${h * 0.75} ${w * 0.75},${h * 0.8} Q${w * 0.7},${h - 2} ${w * 0.25},${h - 2} Z" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)" />`;
    default:
      return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" ry="6" fill="url(#grad-${gradId})" stroke="${color}" stroke-width="${sw}" filter="url(#shadow)" />`;
  }
}

export function generateFlowchartSVG(nodes: Node<FlowchartNodeData>[], edges: Edge[]): string {
  if (nodes.length === 0) return '';

  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + NODE_W;
  const maxY = Math.max(...ys) + NODE_H;
  const padding = 40;
  const graphW = maxX - minX + padding * 2;
  const graphH = maxY - minY + padding * 2;
  const viewX = minX - padding;
  const viewY = minY - padding;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const edgeSvgs = edges.map(edge => {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) return '';

    const closest = (edge.sourceHandle && edge.targetHandle)
      ? { sourceHandle: edge.sourceHandle as HandleSide, targetHandle: edge.targetHandle as HandleSide }
      : pickClosestHandles(srcNode, tgtNode);

    const srcPos = getHandlePos(srcNode.position, closest.sourceHandle);
    const tgtPos = getHandlePos(tgtNode.position, closest.targetHandle);
    const d = buildEdgePath(srcPos, closest.sourceHandle, tgtPos, closest.targetHandle);
    const midX = (srcPos.x + tgtPos.x) / 2;
    const midY = (srcPos.y + tgtPos.y) / 2;

    let labelSvg = '';
    if (edge.label) {
      labelSvg = `<text x="${midX}" y="${midY - 8}" text-anchor="middle" fill="#e8e8ec" stroke="#0f0f14" stroke-width="3" paint-order="stroke" font-size="11" font-weight="600">${escapeXml(String(edge.label))}</text>`;
    }

    return `<g>
      <path d="${d}" fill="none" stroke="#6b6b73" stroke-width="2" stroke-linejoin="round" marker-end="url(#arrow)" />
      ${labelSvg}
    </g>`;
  }).join('\n');

  const usedColors = [...new Set(nodes.map(n => n.data.color || '#8b5cf6'))];

  const gradientDefs = usedColors.map(color => {
    const id = color.replace('#', '');
    return `<linearGradient id="grad-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.15" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0.06" />
    </linearGradient>`;
  }).join('\n');

  const nodeSvgs = nodes.map(node => {
    const sx = node.position.x;
    const sy = node.position.y;
    const color = node.data.color || '#8b5cf6';
    const shape = node.data.shape || 'rectangle';
    const gradId = color.replace('#', '');

    const handleDots = (['top', 'bottom', 'left', 'right'] as HandleSide[]).map(side => {
      const hp = getHandlePos({ x: sx, y: sy }, side);
      return `<circle cx="${hp.x}" cy="${hp.y}" r="2.5" fill="#888" opacity="0.5" />`;
    }).join('\n');

    const sectionBadge = node.data.section
      ? `<text x="${sx + NODE_W / 2}" y="${sy - 12}" text-anchor="middle" fill="#9ca3af" font-size="9" font-weight="500" letter-spacing="1" text-transform="uppercase">${escapeXml(node.data.section!)}</text>`
      : '';

    return `<g>
      ${handleDots}
      ${shapeBodySVG(shape, color, gradId)}
      <text x="${sx + NODE_W / 2}" y="${sy + NODE_H / 2 + 5}" text-anchor="middle" fill="#e8e8ec" font-size="13" font-weight="600">${escapeXml(node.data.label)}</text>
      ${sectionBadge}
    </g>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${graphW} ${graphH}" width="${graphW}" height="${graphH}">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,0 L10,5 L0,10 Z" fill="#6b6b73" />
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000" flood-opacity="0.3" />
    </filter>
    ${gradientDefs}
  </defs>
  <rect x="${viewX}" y="${viewY}" width="${graphW}" height="${graphH}" fill="#0f0f14" />
  ${edgeSvgs}
  ${nodeSvgs}
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function downloadSVG(svgString: string, filename: string) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
