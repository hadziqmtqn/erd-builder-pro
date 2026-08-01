import {
  BorderStyle,
  Document,
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import type { Note } from '@/types';
import type { ExportOptions } from './note-exporter';

type DocxChild = Paragraph | Table;
type RunStyle = { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; color?: string; font?: string };

function styleFrom(element: Element, inherited: RunStyle): RunStyle {
  const style = element.getAttribute('style') || '';
  const color = style.match(/(?:^|;)\s*color\s*:\s*#?([\da-f]{6})/i)?.[1];
  const tag = element.tagName.toLowerCase();
  return {
    ...inherited,
    ...(color ? { color } : {}),
    ...(tag === 'strong' || tag === 'b' ? { bold: true } : {}),
    ...(tag === 'em' || tag === 'i' ? { italics: true } : {}),
    ...(tag === 'u' ? { underline: true } : {}),
    ...(tag === 's' || tag === 'del' ? { strike: true } : {}),
    ...(tag === 'code' ? { font: 'Courier New' } : {}),
  };
}

function runs(nodes: NodeListOf<ChildNode> | ChildNode[], inherited: RunStyle = {}): TextRun[] {
  return Array.from(nodes).flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ? [new TextRun({
        text: node.textContent,
        bold: inherited.bold,
        italics: inherited.italics,
        strike: inherited.strike,
        color: inherited.color,
        font: inherited.font,
        underline: inherited.underline ? { type: UnderlineType.SINGLE } : undefined,
      })] : [];
    }
    if (!(node instanceof Element)) return [];
    if (node.tagName.toLowerCase() === 'br') return [new TextRun({ break: 1 })];
    return runs(node.childNodes, styleFrom(node, inherited));
  });
}

function listItems(list: Element, depth = 0): Paragraph[] {
  return Array.from(list.children).flatMap((item, index) => {
    if (item.tagName.toLowerCase() !== 'li') return [];
    const nested = Array.from(item.children).filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase()));
    const content = Array.from(item.childNodes).filter((child) => !(child instanceof Element && ['ul', 'ol'].includes(child.tagName.toLowerCase())));
    const task = item.getAttribute('data-type') === 'taskItem';
    const checked = item.getAttribute('data-checked') === 'true';
    const prefix = task ? (checked ? '☑ ' : '☐ ') : list.tagName.toLowerCase() === 'ol' ? `${index + 1}. ` : '• ';
    return [
      new Paragraph({ children: [new TextRun({ text: prefix, color: checked ? '71717A' : undefined }), ...runs(content, checked ? { strike: true, color: '71717A' } : {})], indent: { left: 360 + depth * 360, hanging: 180 }, spacing: { after: 60 } }),
      ...nested.flatMap((child) => listItems(child, depth + 1)),
    ];
  });
}

function table(element: Element): Table {
  const rows = Array.from(element.querySelectorAll('tr'));
  const columns = Math.max(...rows.map((row) => Array.from(row.querySelectorAll(':scope > th, :scope > td')).reduce((total, cell) => total + Number(cell.getAttribute('colspan') || 1), 0)), 1);
  const columnWidth = Math.floor(9000 / columns);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array(columns).fill(columnWidth),
    layout: TableLayoutType.FIXED,
    rows: rows.map((row) => new TableRow({
    children: Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) => new TableCell({
      children: [new Paragraph({ children: runs(cell.childNodes, cell.tagName.toLowerCase() === 'th' ? { bold: true } : {}) })],
      shading: cell.tagName.toLowerCase() === 'th' ? { fill: 'F4F4F5' } : undefined,
      width: { size: columnWidth * Number(cell.getAttribute('colspan') || 1), type: WidthType.DXA },
      columnSpan: Number(cell.getAttribute('colspan') || 1),
    })),
  })),
  });
}

function contentChildren(content: string): DocxChild[] {
  const root = new DOMParser().parseFromString(content, 'text/html').body;
  return Array.from(root.childNodes).flatMap((node): DocxChild[] => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ? [new Paragraph({ text: node.textContent })] : [];
    if (!(node instanceof Element)) return [];
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
      return [new Paragraph({ heading: headings[Number(tag.slice(1)) - 1], children: runs(node.childNodes) })];
    }
    if (tag === 'p' || tag === 'div') return [new Paragraph({ children: runs(node.childNodes), spacing: { after: 120 } })];
    if (tag === 'blockquote') return [new Paragraph({ children: runs(node.childNodes, { italics: true, color: '52525B' }), border: { left: { color: 'D4D4D8', style: BorderStyle.SINGLE, size: 12, space: 8 } }, indent: { left: 240 }, spacing: { before: 120, after: 120 } })];
    if (tag === 'pre') return [new Paragraph({ children: [new TextRun({ text: node.textContent || '', font: 'Courier New', color: 'F4F4F5' })], shading: { fill: '18181B' }, spacing: { before: 120, after: 120 } })];
    if (tag === 'ul' || tag === 'ol') return listItems(node);
    if (tag === 'table') return [table(node)];
    if (tag === 'hr') return [new Paragraph({ border: { bottom: { color: 'E4E4E7', style: BorderStyle.SINGLE, size: 4 } }, spacing: { before: 120, after: 120 } })];
    return [new Paragraph({ children: runs(node.childNodes) })];
  });
}

export function createNoteDocxDocument(note: Note, options: ExportOptions, content: string, projectName?: string): Document {
  const children: DocxChild[] = [];
  if (options.includeTitle) children.push(new Paragraph({ text: note.title, heading: HeadingLevel.TITLE }));
  if (options.includeMetadata) children.push(new Paragraph({ text: `Project: ${projectName || note.projects?.name || 'Untitled'} · Updated: ${new Date(note.updated_at).toLocaleDateString()}`, style: 'Caption', spacing: { after: 240 } }));
  children.push(...contentChildren(content));
  return new Document({ creator: 'ERD Builder Pro', title: note.title, sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }] });
}
