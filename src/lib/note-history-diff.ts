import { diffWordsWithSpace } from 'diff';

export const NOTE_HISTORY_PREVIEW_EVENT = 'note-history-preview';

export type NoteDiffPart = {
  value: string;
  added?: boolean;
  removed?: boolean;
};

export type NoteBlockTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote' | 'pre' | 'li' | 'div' | 'tr';
export type NoteAlignment = 'left' | 'center' | 'right' | 'justify';
export type NoteMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link' | 'highlight';

export type NoteTextFormat = {
  blockTag: NoteBlockTag;
  alignment: NoteAlignment;
  marks: NoteMark[];
  color?: string;
  highlightColor?: string;
};

export type NoteRichDiffPart = NoteDiffPart & {
  format: NoteTextFormat;
  formatChanged?: boolean;
  formatLabel?: string;
};

export type NoteDiffBlock = {
  blockTag: NoteBlockTag;
  alignment: NoteAlignment;
  parts: NoteRichDiffPart[];
  formatChanged?: boolean;
  formatLabel?: string;
};

type NoteRun = {
  text: string;
  marks: NoteMark[];
  color?: string;
  highlightColor?: string;
};

type ParsedNoteBlock = {
  blockTag: NoteBlockTag;
  alignment: NoteAlignment;
  runs: NoteRun[];
};

const BLOCK_TAGS = new Set<NoteBlockTag>([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li', 'div', 'tr',
]);
const MARK_ORDER: NoteMark[] = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'highlight'];
const BLOCK_LABELS: Record<NoteBlockTag, string> = {
  p: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  blockquote: 'Quote',
  pre: 'Code block',
  li: 'List item',
  div: 'Block',
  tr: 'Table row',
};
const MARK_LABELS: Record<NoteMark, string> = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  code: 'Code',
  link: 'Link',
  highlight: 'Highlight',
};
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^)]{1,80}\)|hsla?\([^)]{1,80}\)|[a-z]{1,30})$/i;

function isBlockTag(value: string): value is NoteBlockTag {
  return BLOCK_TAGS.has(value as NoteBlockTag);
}

function safeColor(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && SAFE_COLOR.test(normalized) ? normalized : undefined;
}

function readStyleValue(style: string | undefined, property: string): string | undefined {
  const inlineStyle = style?.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] || style;
  const match = inlineStyle?.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match?.[1]?.trim();
}

function readAlignment(attributes: string | undefined): NoteAlignment {
  const value = (readStyleValue(attributes, 'text-align') || attributes?.match(/\balign\s*=\s*["']?([^\s"'>]+)/i)?.[1] || '').toLowerCase();
  return value === 'center' || value === 'right' || value === 'justify' ? value : 'left';
}

function readColor(attributes: string | undefined, property: 'color' | 'background-color'): string | undefined {
  const styleColor = safeColor(readStyleValue(attributes, property));
  if (styleColor) return styleColor;
  if (property === 'color') return safeColor(attributes?.match(/\bdata-color\s*=\s*["']([^"']+)/i)?.[1]);
  return safeColor(attributes?.match(/\bdata-highlight-color\s*=\s*["']([^"']+)/i)?.[1]);
}

function sortMarks(marks: Iterable<NoteMark>): NoteMark[] {
  const set = new Set(marks);
  return MARK_ORDER.filter(mark => set.has(mark));
}

function sameRunFormat(left: NoteRun, right: NoteRun): boolean {
  return left.color === right.color
    && left.highlightColor === right.highlightColor
    && left.marks.join('|') === right.marks.join('|');
}

function mergeRuns(runs: NoteRun[]): NoteRun[] {
  return runs.reduce<NoteRun[]>((merged, run) => {
    if (!run.text) return merged;
    const previous = merged[merged.length - 1];
    if (previous && sameRunFormat(previous, run)) previous.text += run.text;
    else merged.push({ ...run, marks: sortMarks(run.marks) });
    return merged;
  }, []);
}

function elementRunFormat(element: Element, inherited: NoteRun): NoteRun {
  const tag = element.tagName.toLowerCase();
  const style = element.getAttribute('style') || '';
  const marks = new Set(inherited.marks);
  if (tag === 'strong' || tag === 'b' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) marks.add('bold');
  if (tag === 'em' || tag === 'i' || /font-style\s*:\s*italic/i.test(style)) marks.add('italic');
  if (tag === 'u' || /text-decoration[^:]*:\s*[^;]*underline/i.test(style)) marks.add('underline');
  if (tag === 's' || tag === 'del' || /text-decoration[^:]*:\s*[^;]*line-through/i.test(style)) marks.add('strike');
  if (tag === 'code') marks.add('code');
  if (tag === 'a') marks.add('link');
  if (tag === 'mark') marks.add('highlight');
  const color = readColor(style, 'color') || safeColor(element.getAttribute('color') || undefined) || inherited.color;
  const highlightColor = readColor(style, 'background-color') || inherited.highlightColor;
  if (highlightColor) marks.add('highlight');
  return { text: '', marks: sortMarks(marks), color, highlightColor };
}

function collectElementRuns(block: Element): NoteRun[] {
  const runs: NoteRun[] = [];
  const visit = (node: Node, inherited: NoteRun) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue || '';
      if (text) runs.push({ ...inherited, text });
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.tagName.toLowerCase() === 'br') {
      runs.push({ ...inherited, text: '\n' });
      return;
    }
    const next = elementRunFormat(element, inherited);
    Array.from(element.childNodes).forEach(child => visit(child, next));
  };
  const emptyFormat: NoteRun = { text: '', marks: [] };
  Array.from(block.childNodes).forEach(child => visit(child, emptyFormat));
  return mergeRuns(runs);
}

function parseWithDomParser(html: string): ParsedNoteBlock[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const elements: Element[] = [];
  const visit = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    if (isBlockTag(tag)) {
      elements.push(element);
      return;
    }
    Array.from(element.children).forEach(child => visit(child));
  };
  Array.from(body.children).forEach(child => visit(child));
  if (!elements.length && body.textContent) {
    return [{ blockTag: 'p', alignment: 'left', runs: [{ text: body.textContent, marks: [] }] }];
  }
  return elements.map(element => ({
    blockTag: element.tagName.toLowerCase() as NoteBlockTag,
    alignment: readAlignment(element.getAttribute('style') || element.getAttribute('align') || undefined),
    runs: collectElementRuns(element),
  }));
}

function decodeFallbackText(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function fallbackRunFormat(tag: string, attributes: string, inherited: NoteRun): NoteRun {
  const marks = new Set(inherited.marks);
  if (tag === 'strong' || tag === 'b' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(attributes)) marks.add('bold');
  if (tag === 'em' || tag === 'i' || /font-style\s*:\s*italic/i.test(attributes)) marks.add('italic');
  if (tag === 'u' || /text-decoration[^:]*:\s*[^;]*underline/i.test(attributes)) marks.add('underline');
  if (tag === 's' || tag === 'del' || /text-decoration[^:]*:\s*[^;]*line-through/i.test(attributes)) marks.add('strike');
  if (tag === 'code') marks.add('code');
  if (tag === 'a') marks.add('link');
  if (tag === 'mark') marks.add('highlight');
  const highlightColor = readColor(attributes, 'background-color') || inherited.highlightColor;
  if (highlightColor) marks.add('highlight');
  return {
    text: '',
    marks: sortMarks(marks),
    color: readColor(attributes, 'color') || inherited.color,
    highlightColor,
  };
}

function parseFallback(html: string): ParsedNoteBlock[] {
  const blocks: ParsedNoteBlock[] = [];
  const tokenPattern = /<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
  const stack: Array<{ tag: string; format: NoteRun }> = [];
  let current: ParsedNoteBlock | null = null;
  const emptyFormat: NoteRun = { text: '', marks: [] };
  let format = emptyFormat;
  const flush = () => {
    if (current) {
      current.runs = mergeRuns(current.runs);
      blocks.push(current);
      current = null;
    }
  };
  const ensureBlock = () => {
    if (!current) current = { blockTag: 'p', alignment: 'left', runs: [] };
    return current;
  };
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(html))) {
    const token = match[0];
    if (!token.startsWith('<')) {
      if (token) ensureBlock().runs.push({ ...format, text: decodeFallbackText(token) });
      continue;
    }
    const closing = /^<\s*\/\s*([a-z0-9]+)/i.exec(token);
    if (closing) {
      const tag = closing[1].toLowerCase();
      const index = [...stack].reverse().findIndex(item => item.tag === tag);
      if (index >= 0) {
        const stackIndex = stack.length - 1 - index;
        format = stack[stackIndex].format;
        stack.splice(stackIndex, 1);
      }
      if (isBlockTag(tag)) flush();
      continue;
    }
    const opening = /^<\s*([a-z0-9]+)([^>]*)>/i.exec(token);
    if (!opening) continue;
    const tag = opening[1].toLowerCase();
    const attributes = opening[2] || '';
    if (tag === 'br') {
      ensureBlock().runs.push({ ...format, text: '\n' });
      continue;
    }
    if (isBlockTag(tag)) {
      flush();
      current = { blockTag: tag, alignment: readAlignment(attributes), runs: [] };
    }
    stack.push({ tag, format });
    format = fallbackRunFormat(tag, attributes, format);
    if (/\/\s*>$/.test(token)) {
      format = stack.pop()?.format || emptyFormat;
      if (isBlockTag(tag)) flush();
    }
  }
  flush();
  return blocks;
}

function parseNoteHtml(html: string): ParsedNoteBlock[] {
  const source = String(html || '');
  if (!source.trim()) return [];
  return typeof DOMParser === 'undefined' ? parseFallback(source) : parseWithDomParser(source);
}

function blockText(block: ParsedNoteBlock | undefined): string {
  return block ? block.runs.map(run => run.text).join('') : '';
}

export function noteHtmlToText(html: string): string {
  return parseNoteHtml(html).map(blockText).join('\n');
}

export function buildNoteHistoryDiff(currentHtml: string, historicalHtml: string): NoteDiffPart[] {
  return diffWordsWithSpace(noteHtmlToText(currentHtml), noteHtmlToText(historicalHtml)).map(part => ({
    value: part.value,
    ...(part.added ? { added: true } : {}),
    ...(part.removed ? { removed: true } : {}),
  }));
}

function formatAt(runs: NoteRun[], offset: number): NoteRun {
  let cursor = 0;
  for (const run of runs) {
    if (offset < cursor + run.text.length || (run.text.length === 0 && offset === cursor)) return run;
    cursor += run.text.length;
  }
  return runs[runs.length - 1] || { text: '', marks: [] };
}

function nextRunBoundary(runs: NoteRun[], offset: number, fallback: number): number {
  let cursor = 0;
  for (const run of runs) {
    const end = cursor + run.text.length;
    if (offset < end) return end;
    cursor = end;
  }
  return fallback;
}

function textFormat(block: ParsedNoteBlock | undefined, run: NoteRun): NoteTextFormat {
  return {
    blockTag: block?.blockTag || 'p',
    alignment: block?.alignment || 'left',
    marks: run.marks,
    ...(run.color ? { color: run.color } : {}),
    ...(run.highlightColor ? { highlightColor: run.highlightColor } : {}),
  };
}

function inlineFormatChanged(left: NoteTextFormat, right: NoteTextFormat): boolean {
  return left.color !== right.color
    || left.highlightColor !== right.highlightColor
    || left.marks.join('|') !== right.marks.join('|');
}

function formatSummary(format: NoteTextFormat, includeBlock = true): string {
  const marks = format.marks.filter(mark => mark !== 'highlight').map(mark => MARK_LABELS[mark]);
  if (format.color) marks.push('Text color');
  if (format.highlightColor) marks.push('Highlight');
  const markSummary = marks.length ? marks.join(' + ') : 'Regular';
  const alignment = format.alignment === 'left' ? '' : ` · ${format.alignment[0].toUpperCase()}${format.alignment.slice(1)}`;
  return includeBlock ? `${BLOCK_LABELS[format.blockTag]} · ${markSummary}${alignment}` : `${markSummary}${alignment}`;
}

function formatChangeLabel(before: NoteTextFormat, after: NoteTextFormat): string {
  const blockChanged = before.blockTag !== after.blockTag || before.alignment !== after.alignment;
  const beforeSummary = formatSummary(before, blockChanged);
  const afterSummary = formatSummary(after, blockChanged);
  return `${beforeSummary} → ${afterSummary}`;
}

function buildBlockDiff(current: ParsedNoteBlock | undefined, historical: ParsedNoteBlock | undefined): NoteDiffBlock {
  const currentText = blockText(current);
  const historicalText = blockText(historical);
  const blockChanged = Boolean(current && historical && (current.blockTag !== historical.blockTag || current.alignment !== historical.alignment));
  const blockLabel = blockChanged
    ? formatChangeLabel(textFormat(current, formatAt(current?.runs || [], 0)), textFormat(historical, formatAt(historical?.runs || [], 0)))
    : undefined;
  const parts: NoteRichDiffPart[] = [];
  let currentOffset = 0;
  let historicalOffset = 0;
  const chunks = diffWordsWithSpace(currentText, historicalText);
  for (const chunk of chunks) {
    let remaining = chunk.value.length;
    while (remaining > 0) {
      const currentRun = formatAt(current?.runs || [], currentOffset);
      const historicalRun = formatAt(historical?.runs || [], historicalOffset);
      const currentBoundary = chunk.added ? currentOffset + remaining : nextRunBoundary(current?.runs || [], currentOffset, currentOffset + remaining);
      const historicalBoundary = chunk.removed ? historicalOffset + remaining : nextRunBoundary(historical?.runs || [], historicalOffset, historicalOffset + remaining);
      const length = Math.max(1, Math.min(remaining, currentBoundary - currentOffset, historicalBoundary - historicalOffset));
      const removed = Boolean(chunk.removed);
      const added = Boolean(chunk.added);
      const beforeFormat = textFormat(current, currentRun);
      const afterFormat = textFormat(historical, historicalRun);
      const formatChanged = !removed && !added && (blockChanged || inlineFormatChanged(beforeFormat, afterFormat));
      const format = removed ? beforeFormat : afterFormat;
      parts.push({
        value: chunk.value.slice(chunk.value.length - remaining, chunk.value.length - remaining + length),
        ...(added ? { added: true } : {}),
        ...(removed ? { removed: true } : {}),
        format,
        ...(formatChanged ? { formatChanged: true, formatLabel: formatChangeLabel(beforeFormat, afterFormat) } : {}),
      });
      if (!added) currentOffset += length;
      if (!removed) historicalOffset += length;
      remaining -= length;
    }
  }
  return {
    blockTag: historical?.blockTag || current?.blockTag || 'p',
    alignment: historical?.alignment || current?.alignment || 'left',
    parts,
    ...(blockChanged ? { formatChanged: true, formatLabel: blockLabel } : {}),
  };
}

export function buildRichNoteHistoryDiff(currentHtml: string, historicalHtml: string): NoteDiffBlock[] {
  const current = parseNoteHtml(currentHtml);
  const historical = parseNoteHtml(historicalHtml);
  const blockCount = Math.max(current.length, historical.length);
  return Array.from({ length: blockCount }, (_, index) => buildBlockDiff(current[index], historical[index]));
}
