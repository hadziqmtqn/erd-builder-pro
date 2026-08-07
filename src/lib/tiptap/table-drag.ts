import { Fragment, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { CellSelection, selectedRect, TableMap } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';

export type TableDragKind = 'row' | 'column';
export type TableMoveDirection = 'up' | 'down' | 'left' | 'right';

export interface TableDocumentContext {
  tablePos: number;
  tableNode: ProseMirrorNode;
  cellPos: number;
  map: TableMap;
}

export interface TableCellContext extends TableDocumentContext {
  tableElement: HTMLTableElement;
  cellElement: HTMLTableCellElement;
  rowElement: HTMLTableRowElement;
  rowIndex: number;
  columnIndex: number;
  map: TableMap;
}

export interface TableDragRange {
  start: number;
  end: number;
}

function tablePositionAt(
  view: EditorView,
  resolved: ReturnType<EditorView['state']['doc']['resolve']>,
): TableDocumentContext | null {
  let cellPos = -1;
  let tablePos = -1;
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const nodeName = resolved.node(depth).type.name;
    if (nodeName === 'tableCell' || nodeName === 'tableHeader') cellPos = resolved.before(depth);
    if (nodeName === 'table') {
      tablePos = resolved.before(depth);
      break;
    }
  }

  if (cellPos < 0 || tablePos < 0) return null;
  const tableNode = view.state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return null;

  return {
    tablePos,
    tableNode,
    cellPos,
    map: TableMap.get(tableNode),
  };
}

export function findTableCellContext(view: EditorView, target: EventTarget | null): TableCellContext | null {
  if (!(target instanceof Element)) return null;
  const cellElement = target.closest<HTMLTableCellElement>('td, th');
  if (!cellElement || !view.dom.contains(cellElement)) return null;

  const rowElement = cellElement.parentElement;
  const tableElement = cellElement.closest<HTMLTableElement>('table');
  if (!(rowElement instanceof HTMLTableRowElement) || !tableElement) return null;

  const domPos = view.posAtDOM(cellElement, 0);
  const context = tablePositionAt(view, view.state.doc.resolve(domPos));
  if (!context) return null;
  const rect = context.map.findCell(context.cellPos - context.tablePos - 1);

  return {
    ...context,
    tableElement,
    cellElement,
    rowElement,
    rowIndex: rect.top,
    columnIndex: rect.left,
  };
}

function selectionTablePos(view: EditorView): number {
  const { selection } = view.state;
  if (!(selection instanceof CellSelection)) return -1;
  return tablePositionAt(view, selection.$anchorCell)?.tablePos ?? -1;
}

export function getSelectedTableRange(view: EditorView, context: TableDocumentContext, kind: TableDragKind): TableDragRange {
  const { selection } = view.state;
  if (selection instanceof CellSelection && selectionTablePos(view) === context.tablePos) {
    const rect = selectedRect(view.state);
    return kind === 'row'
      ? { start: rect.top, end: rect.bottom }
      : { start: rect.left, end: rect.right };
  }

  const rect = context.map.findCell(context.cellPos - context.tablePos - 1);
  return kind === 'row'
    ? { start: rect.top, end: rect.bottom }
    : { start: rect.left, end: rect.right };
}

export function selectedTableContext(view: EditorView): TableDocumentContext | null {
  const { selection } = view.state;
  const resolved = selection instanceof CellSelection ? selection.$anchorCell : selection.$from;
  return tablePositionAt(view, resolved);
}

export function moveSelectedTableRows(view: EditorView, direction: 'up' | 'down'): boolean {
  const context = selectedTableContext(view);
  if (!context) return false;
  const range = getSelectedTableRange(view, context, 'row');
  const target = direction === 'up' ? range.start - 1 : range.end + 1;
  return moveTableRows(view, context, range, target);
}

export function moveSelectedTableColumns(view: EditorView, direction: 'left' | 'right'): boolean {
  const context = selectedTableContext(view);
  if (!context) return false;
  const range = getSelectedTableRange(view, context, 'column');
  const target = direction === 'left' ? range.start - 1 : range.end + 1;
  return moveTableColumns(view, context, range, target);
}

export function tableHasSpans(tableNode: ProseMirrorNode): boolean {
  let hasSpans = false;
  tableNode.descendants(node => {
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader')
      && (Number(node.attrs.colspan) > 1 || Number(node.attrs.rowspan) > 1)) {
      hasSpans = true;
    }
    return !hasSpans;
  });
  return hasSpans;
}

function cellPosAt(tablePos: number, tableNode: ProseMirrorNode, rowIndex: number, columnIndex: number): number {
  let rowPos = tablePos + 1;
  for (let index = 0; index < rowIndex; index += 1) {
    rowPos += tableNode.child(index).nodeSize;
  }

  let cellPos = rowPos + 1;
  const row = tableNode.child(rowIndex);
  for (let index = 0; index < columnIndex; index += 1) {
    cellPos += row.child(index).nodeSize;
  }
  return cellPos;
}

function setMovedSelection(
  tr: Parameters<EditorView['dispatch']>[0],
  tablePos: number,
  tableNode: ProseMirrorNode,
  rows: TableDragRange,
  columns: TableDragRange,
): void {
  const firstCellPos = cellPosAt(tablePos, tableNode, rows.start, columns.start);
  const lastCellPos = cellPosAt(tablePos, tableNode, rows.end - 1, columns.end - 1);
  tr.setSelection(CellSelection.create(tr.doc, firstCellPos, lastCellPos));
}

function insertIndexAfterMove(source: TableDragRange, targetBoundary: number): number {
  return targetBoundary > source.end ? targetBoundary - (source.end - source.start) : targetBoundary;
}

function isInsideSource(source: TableDragRange, targetBoundary: number): boolean {
  return targetBoundary >= source.start && targetBoundary <= source.end;
}

export function reorderTableItems<T>(
  items: readonly T[],
  source: TableDragRange,
  targetBoundary: number,
): T[] | null {
  if (
    source.start < 0
    || source.end > items.length
    || source.start >= source.end
    || targetBoundary < 0
    || targetBoundary > items.length
    || isInsideSource(source, targetBoundary)
  ) return null;

  const moving = items.slice(source.start, source.end);
  const remaining = items.slice(0, source.start).concat(items.slice(source.end));
  const insertAt = insertIndexAfterMove(source, targetBoundary);
  return remaining.slice(0, insertAt).concat(moving, remaining.slice(insertAt));
}

export function moveTableRows(view: EditorView, context: TableDocumentContext, source: TableDragRange, targetBoundary: number): boolean {
  const { tableNode } = context;
  if (tableHasSpans(tableNode)) return false;

  const rows = Array.from({ length: tableNode.childCount }, (_, index) => tableNode.child(index));
  const reordered = reorderTableItems(rows, source, targetBoundary);
  if (!reordered) return false;
  const nextTable = tableNode.copy(Fragment.from(reordered));
  const tr = view.state.tr.replaceWith(context.tablePos, context.tablePos + tableNode.nodeSize, nextTable);
  const movingLength = source.end - source.start;
  const movedStart = targetBoundary > source.end ? targetBoundary - (source.end - source.start) : targetBoundary;

  setMovedSelection(tr, context.tablePos, nextTable, {
    start: movedStart,
    end: movedStart + movingLength,
  }, { start: 0, end: context.map.width });
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function moveTableColumns(view: EditorView, context: TableDocumentContext, source: TableDragRange, targetBoundary: number): boolean {
  const { tableNode } = context;
  if (tableHasSpans(tableNode)) return false;

  const movingLength = source.end - source.start;
  const rows = Array.from({ length: tableNode.childCount }, (_, rowIndex) => {
    const row = tableNode.child(rowIndex);
    if (row.childCount !== context.map.width) return null;
    const cells = Array.from({ length: row.childCount }, (_, index) => row.child(index));
    const reordered = reorderTableItems(cells, source, targetBoundary);
    return reordered ? row.copy(Fragment.from(reordered)) : null;
  });

  if (rows.some(row => row === null)) return false;
  const nextTable = tableNode.copy(Fragment.from(rows as ProseMirrorNode[]));
  const tr = view.state.tr.replaceWith(context.tablePos, context.tablePos + tableNode.nodeSize, nextTable);
  const movedStart = targetBoundary > source.end ? targetBoundary - movingLength : targetBoundary;

  setMovedSelection(tr, context.tablePos, nextTable, {
    start: 0,
    end: nextTable.childCount,
  }, {
    start: movedStart,
    end: movedStart + movingLength,
  });
  view.dispatch(tr.scrollIntoView());
  return true;
}
