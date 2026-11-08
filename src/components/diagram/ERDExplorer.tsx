import { useEffect, useMemo } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { ArrowLeft, X } from 'lucide-react';
import type { Entity } from '@/types';
import { buildERDRelationshipRows } from '@/lib/erd-relationship-list';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RelationshipPropertiesPanel from './RelationshipPropertiesPanel';
import { ERDRelationshipListPanel, relationshipLabel } from './ERDRelationshipListPanel';
import { ERDTableListPanel } from './ERDTableListPanel';

/** Kept by the pane's ERDView, so reopening the Explorer (e.g. from `‹ Tables`) keeps the tab, searches and active rows. */
export interface ERDExplorerState {
  tab: 'tables' | 'relationships';
  tableSearch: string;
  relationshipSearch: string;
  activeTableId: string | null;
  activeRelationshipId: string | null;
  editingEdgeId: string | null;
}

export const INITIAL_EXPLORER_STATE: ERDExplorerState = {
  tab: 'tables', tableSearch: '', relationshipSearch: '', activeTableId: null, activeRelationshipId: null, editingEdgeId: null,
};

interface ERDExplorerProps {
  nodes: Node<Entity>[];
  edges: Edge[];
  state: ERDExplorerState;
  onChange: (patch: Partial<ERDExplorerState>) => void;
  /** Left out when the diagram is read-only: the Explorer then only finds and highlights. */
  editing?: {
    onEditTable: (id: string) => void;
    onUpdateEdge: (edgeId: string, update: string | { label?: string; data?: Record<string, any> }) => void;
    onFlipEdge: (edgeId: string) => void;
    onDeleteEdge: (edgeId: string) => void;
  };
  onHighlight: (target: { type: 'table' | 'relationship'; id: string }) => void;
  onClose: () => void;
  shortcutLabel: string;
}

/** Floating Tables/Relationships panel on the left of an ERD canvas (ERD-004). */
export function ERDExplorer({ nodes, edges, state, onChange, editing, onHighlight, onClose, shortcutLabel }: ERDExplorerProps) {
  const rows = useMemo(() => buildERDRelationshipRows(nodes, edges), [nodes, edges]);
  const editingEdge = editing && state.editingEdgeId ? edges.find(edge => edge.id === state.editingEdgeId) ?? null : null;
  const editingRow = editingEdge ? rows.find(row => row.id === editingEdge.id) : undefined;

  // Deleted here, by undo, or by another member: drop the row and go back to the list.
  useEffect(() => {
    const patch: Partial<ERDExplorerState> = {};
    if (state.editingEdgeId && !edges.some(edge => edge.id === state.editingEdgeId)) patch.editingEdgeId = null;
    if (state.activeRelationshipId && !edges.some(edge => edge.id === state.activeRelationshipId)) patch.activeRelationshipId = null;
    if (state.activeTableId && !nodes.some(node => node.id === state.activeTableId)) patch.activeTableId = null;
    if (Object.keys(patch).length) onChange(patch);
  }, [state.editingEdgeId, state.activeRelationshipId, state.activeTableId, nodes, edges, onChange]);

  return (
    <aside
      aria-label="Explorer"
      className={cn(
        'nowheel absolute left-[4.5rem] top-3 bottom-3 z-20 flex w-[300px] max-w-[calc(100%-5.5rem)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl',
        // Phones: the toolbar runs along the top, so the Explorer sits below it across the canvas.
        'max-md:left-2 max-md:right-2 max-md:top-20 max-md:w-auto max-md:max-w-none',
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Explorer</span>
          <Kbd>{shortcutLabel}</Kbd>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close Explorer" title="Close Explorer">
          <X className="size-4" />
        </Button>
      </div>
      <div className="shrink-0 border-b px-3 pt-2 pb-2">
        <Tabs value={state.tab} onValueChange={value => onChange({ tab: value as ERDExplorerState['tab'] })} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="tables">Tables ({nodes.length})</TabsTrigger>
            <TabsTrigger value="relationships">Relationships ({rows.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1">
        {state.tab === 'tables' ? (
          <ERDTableListPanel nodes={nodes} search={state.tableSearch} onSearchChange={tableSearch => onChange({ tableSearch })}
            activeId={state.activeTableId}
            onSelect={id => { onChange({ activeTableId: id }); onHighlight({ type: 'table', id }); }}
            onEdit={editing ? id => { onChange({ activeTableId: id }); editing.onEditTable(id); } : undefined} />
        ) : editing && editingEdge ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <button type="button" onClick={() => onChange({ editingEdgeId: null })} className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-3.5" /> Relationships
                </button>
                <span className="text-muted-foreground/50">/</span>
                <span className="truncate font-mono font-medium text-foreground" title={editingRow ? relationshipLabel(editingRow) : undefined}>
                  {editingRow ? relationshipLabel(editingRow) : 'Relationship'}
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
              <RelationshipPropertiesPanel
                selectedEdge={editingEdge}
                nodes={nodes}
                onUpdateEdge={editing.onUpdateEdge}
                onFlipEdge={editing.onFlipEdge}
                onDeleteEdge={editing.onDeleteEdge}
              />
            </div>
          </div>
        ) : (
          <ERDRelationshipListPanel rows={rows} search={state.relationshipSearch} onSearchChange={relationshipSearch => onChange({ relationshipSearch })}
            activeId={state.activeRelationshipId}
            onSelect={id => { onChange({ activeRelationshipId: id }); onHighlight({ type: 'relationship', id }); }}
            onEdit={editing ? id => { onChange({ activeRelationshipId: id, editingEdgeId: id }); onHighlight({ type: 'relationship', id }); } : undefined} />
        )}
      </div>
      <p className="shrink-0 border-t px-3 py-2 text-[11px] text-muted-foreground">
        {editing ? 'Click a row to highlight it on the canvas · ✎ to edit' : 'Click a row to highlight it on the canvas'}
      </p>
    </aside>
  );
}
