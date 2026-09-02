import { createElement, useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  buildRichNoteHistoryDiff,
  type NoteDiffBlock,
  type NoteMark,
  type NoteRichDiffPart,
} from '@/lib/note-history-diff';

type Props = {
  currentContent: string;
  historicalContent: string;
  version: number;
};

const BLOCK_CLASSES: Record<NoteDiffBlock['blockTag'], string> = {
  p: 'my-3 min-h-6',
  h1: 'my-6 text-3xl font-bold tracking-tight',
  h2: 'my-5 text-2xl font-bold tracking-tight',
  h3: 'my-4 text-xl font-semibold',
  h4: 'my-3 text-lg font-semibold',
  h5: 'my-3 text-base font-semibold',
  h6: 'my-3 text-sm font-semibold uppercase tracking-wide',
  blockquote: 'my-4 border-l-4 border-primary/40 pl-4 italic text-muted-foreground',
  pre: 'my-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm',
  li: 'my-1 ml-6 list-item',
  div: 'my-3 min-h-6',
  tr: 'my-2 block rounded border border-border/60 p-2',
};

const ALIGNMENT_CLASSES: Record<NoteDiffBlock['alignment'], string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
};

const MARK_TAGS: Partial<Record<NoteMark, 'strong' | 'em' | 'u' | 's' | 'code'>> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
};

function renderPart(part: NoteRichDiffPart, index: number): ReactNode {
  const key = `${index}-${part.value.slice(0, 16)}`;
  const diffClass = part.removed
    ? 'rounded-sm bg-red-500/10 text-red-700 line-through decoration-red-500 decoration-1 dark:bg-red-500/15 dark:text-red-300'
    : part.added
      ? 'rounded-sm bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300'
      : part.formatChanged
        ? 'rounded-sm border-b-2 border-dotted border-amber-500/80 bg-amber-500/10'
        : '';
  const style: CSSProperties = {
    ...(part.format.color ? { color: part.format.color } : {}),
    ...(part.format.highlightColor ? { backgroundColor: part.format.highlightColor } : {}),
  };
  let node: ReactNode = (
    <span
      key={key}
      className={diffClass || undefined}
      style={style}
      title={part.formatChanged ? `Formatting: ${part.formatLabel}` : undefined}
    >
      {part.value}
    </span>
  );
  for (const mark of part.format.marks) {
    const tag = MARK_TAGS[mark];
    if (tag) node = createElement(tag, { key: `${key}-${mark}` }, node);
    if (mark === 'link') node = <span key={`${key}-link`} className="underline decoration-primary/60 underline-offset-2">{node}</span>;
  }
  return node;
}

function renderBlock(block: NoteDiffBlock, index: number): ReactNode {
  const tag = block.blockTag === 'li' || block.blockTag === 'tr' || block.blockTag === 'div' ? 'div' : block.blockTag;
  const className = `${BLOCK_CLASSES[block.blockTag]} ${ALIGNMENT_CLASSES[block.alignment]} whitespace-pre-wrap wrap-break-word`;
  const content = block.parts.length
    ? block.parts.map((part, partIndex) => renderPart(part, partIndex))
    : <span className="text-muted-foreground">(empty)</span>;
  return (
    <div key={`${index}-${block.blockTag}`}>
      {block.formatChanged && block.formatLabel ? (
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-500" />
          Formatting changed: {block.formatLabel}
        </div>
      ) : null}
      {createElement(tag, { className }, content)}
    </div>
  );
}

export function NotesHistoryPreview({ currentContent, historicalContent, version }: Props) {
  const blocks = useMemo(
    () => buildRichNoteHistoryDiff(currentContent, historicalContent),
    [currentContent, historicalContent],
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version {version} preview</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span><i className="mr-1 inline-block size-2 rounded-sm bg-red-500/30" />Deleted</span>
            <span><i className="mr-1 inline-block size-2 rounded-sm bg-green-500/30" />Added</span>
            <span><i className="mr-1 inline-block size-2 rounded-sm border-b-2 border-dotted border-amber-500" />Formatting changed</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6 sm:px-6 md:px-24">
        <article className="mx-auto min-h-[calc(100vh-220px)] max-w-4xl rounded-xl border border-border/40 bg-card p-6 shadow-none sm:p-16">
          <div className="prose prose-sm max-w-none text-foreground dark:prose-invert sm:prose-base">
            {blocks.length ? blocks.map(renderBlock) : <p className="text-muted-foreground">No content in this version.</p>}
          </div>
        </article>
      </div>
    </div>
  );
}
