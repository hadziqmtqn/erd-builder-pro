import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow, type Edge, type Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { INITIAL_EXPLORER_STATE, type ERDExplorerState } from '@/components/diagram/ERDExplorer';
import { useEditorActive } from '@/contexts/FileSessionContext';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { useERDCanvasFocus } from '@/hooks/useERDCanvasFocus';
import { useIsMobile } from '@/hooks/use-mobile';
import { useJumpToTableShortcut } from '@/hooks/useJumpToTableShortcut';
import { getERDTableNeighbourIds } from '@/lib/erd-canvas-focus';
import { DOCK_MIN_WIDTH, EXPLORER_COVERED, EXPLORER_LEFT, POPOVER_GAP, POPOVER_WIDTH } from '@/lib/erd-panel-geometry';

type Target = { type: 'table' | 'relationship'; id: string };
type Inspector = { id: string; floating: { left: number; top: number; side: 'left' | 'right' } | null };

/**
 * The Explorer, table editor and DBML drawer of one ERD pane (ERD-004). Kept out of ERDView so that component
 * stays the canvas; ERDView forwards its node, edge and pane clicks here and renders what this returns.
 */
export function useERDPanels({ nodes, edges, canEdit, isActive, shortcutEnabled, diffPending }: {
  nodes: Node<Entity>[];
  edges: Edge[];
  canEdit: boolean;
  isActive: boolean;
  shortcutEnabled: boolean;
  /** A diff review blocks editing; these panels would edit the canvas under it (BUG-042). */
  diffPending: boolean;
}) {
  const editorActive = useEditorActive();
  const { getEdges } = useReactFlow();
  const { setSelectedNodeId } = useWorkspace();
  const { reveal, placePopover } = useERDCanvasFocus();
  const isMobile = useIsMobile();
  const layoutRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorer, setExplorer] = useState<ERDExplorerState>(INITIAL_EXPLORER_STATE);
  const patchExplorer = useCallback((patch: Partial<ERDExplorerState>) => setExplorer(state => ({ ...state, ...patch })), []);
  const [highlight, setHighlight] = useState<Target | null>(null);
  const [inspector, setInspector] = useState<Inspector | null>(null);
  const [dbmlOpen, setDbmlOpen] = useState(false);
  // null = auto: docked beside the canvas when the pane is wide, floating otherwise. On phones the docked
  // editor covers the canvas (its max-md styles), which fits better than a popover beside a table.
  const pinnedRef = useRef<boolean | null>(null);
  // Every open or close bumps this, so an open that finishes its camera move after a newer request is dropped.
  const requestRef = useRef(0);
  const latest = useRef({ canEdit, diffPending, isMobile, inspector, explorerOpen });
  latest.current = { canEdit, diffPending, isMobile, inspector, explorerOpen };
  const popoverFloating = Boolean(inspector?.floating);

  const closeFloating = useCallback(() => {
    requestRef.current++;
    setInspector(current => current?.floating ? null : current);
  }, []);
  const closeInspector = useCallback(() => { requestRef.current++; setInspector(null); }, []);

  const openExplorer = useCallback(() => {
    if (latest.current.diffPending) return;
    setExplorerOpen(true);
    setDbmlOpen(false);
    closeFloating();
    requestAnimationFrame(() => explorerRef.current?.querySelector<HTMLInputElement>('input')?.focus());
  }, [closeFloating]);
  const closeExplorer = useCallback(() => { setExplorerOpen(false); setHighlight(null); }, []);
  const explorerShortcut = useJumpToTableShortcut(isActive && shortcutEnabled, openExplorer);

  const highlightTarget = useCallback((target: Target) => {
    setHighlight(target);
    const edge = target.type === 'relationship' ? getEdges().find(item => item.id === target.id) : undefined;
    // On phones the Explorer spans the canvas below the toolbar, so no side of it stays free.
    void reveal(edge ? [edge.source, edge.target] : [target.id], latest.current.isMobile ? 0 : EXPLORER_COVERED);
  }, [getEdges, reveal]);

  const editTable = useCallback(async (id: string, docked?: boolean) => {
    if (!latest.current.canEdit || latest.current.diffPending) return;
    const request = ++requestRef.current;
    const dock = docked ?? pinnedRef.current ?? (latest.current.isMobile || (layoutRef.current?.clientWidth ?? 0) >= DOCK_MIN_WIDTH);
    setDbmlOpen(false);
    if (dock) {
      setInspector({ id, floating: null });
      setSelectedNodeId(id);
      // The docked editor sits beside the canvas, so only bring an off-screen table into view.
      void reveal([id], latest.current.explorerOpen && !latest.current.isMobile ? EXPLORER_COVERED : EXPLORER_LEFT);
      return;
    }
    const { side, anchor, top } = await placePopover(id, getERDTableNeighbourIds(id, getEdges()));
    if (request !== requestRef.current || latest.current.diffPending) return;
    setInspector({ id, floating: {
      side,
      left: side === 'right' ? anchor.x + anchor.width + POPOVER_GAP : anchor.x - POPOVER_GAP - POPOVER_WIDTH,
      top,
    } });
    // Selected after the camera move: the re-render it causes would cut the glide short.
    setSelectedNodeId(id);
  }, [getEdges, placePopover, reveal, setSelectedNodeId]);

  // Stable for EntityNode, so opening the editor from a table does not re-render every table node.
  const editTableRef = useRef(editTable);
  editTableRef.current = editTable;
  const openTableEditor = useCallback((id: string) => void editTableRef.current(id), []);

  const togglePin = useCallback(() => {
    const current = latest.current.inspector;
    if (!current) return;
    const docked = current.floating !== null;
    pinnedRef.current = docked;
    void editTable(current.id, docked);
  }, [editTable]);
  const backToExplorer = useCallback(() => {
    closeInspector();
    setExplorerOpen(true);
    patchExplorer({ tab: 'tables' });
  }, [closeInspector, patchExplorer]);
  const toggleDBML = useCallback(() => {
    if (latest.current.diffPending) return;
    setDbmlOpen(open => !open);
    closeInspector();
    setExplorerOpen(false);
    setHighlight(null);
  }, [closeInspector]);
  const closeDBML = useCallback(() => setDbmlOpen(false), []);

  // With the editor open, clicking another table moves the editor to it.
  const onNodeClick = useCallback((id: string) => {
    const current = latest.current.inspector;
    if (current && current.id !== id) void editTable(id, current.floating === null);
  }, [editTable]);
  const onNodeDoubleClick = useCallback((id: string, target: EventTarget) => {
    if (!(target instanceof Element && target.closest('.nodrag'))) void editTable(id);
  }, [editTable]);
  // An empty-area click clears the highlight and closes the floating editor; a docked one stays.
  const onPaneClick = useCallback(() => { setHighlight(null); closeFloating(); }, [closeFloating]);
  // A relationship line opens its editor in the Explorer, with its row active, instead of a modal.
  const onEdgeClick = useCallback((id: string) => {
    if (!latest.current.canEdit || latest.current.diffPending) return;
    setExplorerOpen(true);
    setDbmlOpen(false);
    closeFloating();
    patchExplorer({ tab: 'relationships', activeRelationshipId: id, editingEdgeId: id });
    setHighlight({ type: 'relationship', id });
  }, [closeFloating, patchExplorer]);

  useEffect(() => {
    if (!diffPending) return;
    requestRef.current++;
    setInspector(null);
    setDbmlOpen(false);
    setExplorerOpen(false);
    setHighlight(null);
  }, [diffPending]);

  // Esc closes the table editor; inside a field it only leaves the field.
  useEffect(() => {
    if (!inspector) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !editorActive()) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) return;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable || target.closest('.cm-editor'))) {
        target.blur();
        return;
      }
      closeInspector();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspector, editorActive, closeInspector]);

  // The edited table was deleted, or editing is no longer allowed.
  useEffect(() => {
    if (inspector && (!canEdit || !nodes.some(node => node.id === inspector.id))) closeInspector();
    if (!canEdit) setDbmlOpen(false);
  }, [inspector, nodes, canEdit, closeInspector]);

  // What the Explorer or the table editor points at: that table (or relationship) and its related tables stay
  // bright, the rest is dimmed with opacity only (ERD-004; no blur, see BUG-040).
  const focus = useMemo(() => {
    const around = (id: string) => nodes.some(node => node.id === id) ? {
      primary: id as string | null,
      tables: new Set([id, ...getERDTableNeighbourIds(id, edges)]),
      edges: new Set(edges.filter(edge => edge.source === id || edge.target === id).map(edge => edge.id)),
    } : null;
    if (inspector) return around(inspector.id);
    if (!explorerOpen || !highlight) return null;
    if (highlight.type === 'table') return around(highlight.id);
    const edge = edges.find(item => item.id === highlight.id);
    return edge ? { primary: null, tables: new Set([edge.source, edge.target]), edges: new Set([edge.id]) } : null;
  }, [inspector, explorerOpen, highlight, nodes, edges]);

  const inspectorNode = inspector ? nodes.find(node => node.id === inspector.id) : undefined;
  const inspectorEntity = useMemo(() => inspectorNode
    ? inspectorNode.data.id === inspectorNode.id ? inspectorNode.data : { ...inspectorNode.data, id: inspectorNode.id }
    : null, [inspectorNode?.data, inspectorNode?.id]);

  return {
    layoutRef, explorerRef, explorerOpen, explorer, patchExplorer, explorerShortcut, openExplorer, closeExplorer, highlightTarget,
    inspector, inspectorEntity, popoverFloating, editTable, openTableEditor, togglePin, closeInspector, backToExplorer,
    dbmlOpen, toggleDBML, closeDBML, focus, onNodeClick, onNodeDoubleClick, onPaneClick, onEdgeClick,
  };
}
