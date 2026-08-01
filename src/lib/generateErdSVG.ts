import { Edge, getSmoothStepPath, Node, Position } from '@xyflow/react';
import type { Column, Entity } from '@/types';
import { supportsColumnLength } from './column-metadata';

const PADDING = 48;
const FALLBACK_WIDTH = 220;
const HEADER_HEIGHT = 42;
const FALLBACK_ROW_HEIGHT = 40;

type Theme = 'light' | 'dark';

interface TableBox {
  node: Node<Entity>;
  width: number;
  height: number;
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function safeColor(color: string | undefined) {
  return /^#[0-9a-f]{3,8}$/i.test(color || '') ? color! : '#6366f1';
}

function columnType(column: Column) {
  const length = column.max_length && supportsColumnLength(column.type) ? `(${column.max_length})` : '';
  const precision = column.numeric_precision ? `(${column.numeric_precision}${column.numeric_scale == null ? '' : `,${column.numeric_scale}`})` : '';
  return `${column.type.toLowerCase()}${length || precision}`;
}

function columnId(handle?: string | null) {
  return handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
}

function side(handle: string | null | undefined, source: boolean) {
  if (source) return handle?.endsWith('-source-l') ? Position.Left : Position.Right;
  return handle?.endsWith('-target-r') ? Position.Right : Position.Left;
}

function point(table: TableBox, handle: string | null | undefined, source: boolean) {
  const columns = [...table.node.data.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const row = columns.findIndex((column) => column.id === columnId(handle));
  const rowHeight = columns.length ? (table.height - HEADER_HEIGHT) / columns.length : FALLBACK_ROW_HEIGHT;
  const y = table.node.position.y + (row < 0 ? table.height / 2 : HEADER_HEIGHT + (row + 0.5) * rowHeight);
  const handleSide = side(handle, source);
  return {
    x: table.node.position.x + (handleSide === Position.Left ? 0 : table.width),
    y,
    position: handleSide,
  };
}

export function generateErdSVG(nodes: Node<Entity>[], edges: Edge[], theme: Theme): string {
  if (!nodes.length) return '';

  const palette = theme === 'dark'
    ? { background: '#09090b', card: '#18181b', text: '#f4f4f5', muted: '#a1a1aa', row: '#27272a', edge: '#e4e4e7' }
    : { background: '#ffffff', card: '#ffffff', text: '#18181b', muted: '#71717a', row: '#e4e4e7', edge: '#52525b' };
  const tables = new Map(nodes.map((node) => {
    const width = node.measured?.width || FALLBACK_WIDTH;
    const height = node.measured?.height || HEADER_HEIGHT + Math.max(node.data.columns.length, 1) * FALLBACK_ROW_HEIGHT;
    return [node.id, { node, width, height } satisfies TableBox];
  }));
  const boxes = [...tables.values()];
  const minX = Math.min(...boxes.map(({ node }) => node.position.x)) - PADDING;
  const minY = Math.min(...boxes.map(({ node }) => node.position.y)) - PADDING;
  const maxX = Math.max(...boxes.map(({ node, width }) => node.position.x + width)) + PADDING;
  const maxY = Math.max(...boxes.map(({ node, height }) => node.position.y + height)) + PADDING;

  const edgeSvg = edges.map((edge) => {
    const source = tables.get(edge.source);
    const target = tables.get(edge.target);
    if (!source || !target) return '';
    const sourcePoint = point(source, edge.sourceHandle, true);
    const targetPoint = point(target, edge.targetHandle, false);
    const [path] = getSmoothStepPath({ sourceX: sourcePoint.x, sourceY: sourcePoint.y, sourcePosition: sourcePoint.position, targetX: targetPoint.x, targetY: targetPoint.y, targetPosition: targetPoint.position });
    return `<path d="${path}" fill="none" stroke="${palette.edge}" stroke-width="2" marker-end="url(#arrow)"/>`;
  }).join('');

  const tableSvg = boxes.map(({ node, width, height }) => {
    const color = safeColor(node.data.color);
    const columns = [...node.data.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const rowHeight = columns.length ? (height - HEADER_HEIGHT) / columns.length : FALLBACK_ROW_HEIGHT;
    const rows = columns.map((column, index) => {
      const y = HEADER_HEIGHT + index * rowHeight;
      const flags = `${column.is_pk ? 'PK' : ''}${column._is_fk ? `${column.is_pk ? ' · ' : ''}FK` : ''}`;
      const enumValue = column.type.toUpperCase() === 'ENUM' && column.enum_values ? ` (${column.enum_values})` : '';
      return `<g><line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${palette.row}"/><text x="12" y="${y + rowHeight / 2 + 5}" fill="${palette.text}" font-size="14" font-weight="${column.is_pk ? '600' : '500'}">${escapeXml(column.name)}</text><text x="${width - 12}" y="${y + rowHeight / 2 + 5}" fill="${color}" font-family="monospace" font-size="11" font-weight="600" text-anchor="end">${escapeXml(`${columnType(column)}${enumValue}`)}</text>${flags ? `<text x="${width - 12}" y="${y + rowHeight / 2 + 18}" fill="${palette.muted}" font-size="9" font-weight="700" text-anchor="end">${flags}</text>` : ''}</g>`;
    }).join('');
    return `<g transform="translate(${node.position.x} ${node.position.y})"><rect width="${width}" height="${height}" rx="8" fill="${palette.card}" stroke="${color}" stroke-width="2"/><path d="M8 0H${width - 8}Q${width} 0 ${width} 8V${HEADER_HEIGHT}H0V8Q0 0 8 0" fill="${color}" fill-opacity="0.13"/><line x1="0" y1="${HEADER_HEIGHT}" x2="${width}" y2="${HEADER_HEIGHT}" stroke="${color}" stroke-width="2"/><text x="12" y="27" fill="${palette.text}" font-size="14" font-weight="700">${escapeXml(node.data.name)}</text>${rows}</g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}" font-family="Inter, Helvetica, Arial, sans-serif"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${palette.edge}"/></marker></defs><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${palette.background}"/>${edgeSvg}${tableSvg}</svg>`;
}
