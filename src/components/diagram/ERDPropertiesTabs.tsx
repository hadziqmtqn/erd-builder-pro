import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { ArrowLeft } from 'lucide-react';
import type { Entity } from '@/types';
import { buildERDRelationshipRows } from '@/lib/erd-relationship-list';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RelationshipPropertiesPanel from './RelationshipPropertiesPanel';
import { ERDRelationshipListPanel, relationshipLabel } from './ERDRelationshipListPanel';
import { ERDTableListPanel } from './ERDTableListPanel';

type PropertiesTab = 'tables' | 'relationships';

interface ERDPropertiesTabsProps {
  nodes: Node<Entity>[];
  edges: Edge[];
  /** The table shown in the table editor; selecting one on the canvas brings the Tables tab back. */
  focusedTableId: string | null;
  /** Editor for `focusedTableId`; the table list is shown while it is null. */
  tableEditor: ReactNode;
  onEditTable: (id: string) => void;
  onUpdateEdge: (edgeId: string, update: string | { label?: string; data?: Record<string, any> }) => void;
  onFlipEdge: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export function ERDPropertiesTabs({ nodes, edges, focusedTableId, tableEditor, onEditTable, onUpdateEdge, onFlipEdge, onDeleteEdge }: ERDPropertiesTabsProps) {
  const [tab, setTab] = useState<PropertiesTab>('tables');
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  // Kept here, not in the lists, so going back from an editor keeps the search and the last clicked row.
  const [tableSearch, setTableSearch] = useState('');
  const [relationshipSearch, setRelationshipSearch] = useState('');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [activeRelationshipId, setActiveRelationshipId] = useState<string | null>(null);
  const rows = useMemo(() => buildERDRelationshipRows(nodes, edges), [nodes, edges]);
  const editingEdge = editingEdgeId ? edges.find(edge => edge.id === editingEdgeId) ?? null : null;
  const editingRow = editingEdge ? rows.find(row => row.id === editingEdge.id) : undefined;

  useEffect(() => {
    if (focusedTableId) setTab('tables');
  }, [focusedTableId]);

  // Deleted here, by undo, or by another member: go back to the list instead of an empty editor.
  useEffect(() => {
    if (editingEdgeId && !editingEdge) setEditingEdgeId(null);
  }, [editingEdgeId, editingEdge]);

  useEffect(() => {
    if (activeTableId && !nodes.some(node => node.id === activeTableId)) setActiveTableId(null);
  }, [activeTableId, nodes]);

  useEffect(() => {
    if (activeRelationshipId && !edges.some(edge => edge.id === activeRelationshipId)) setActiveRelationshipId(null);
  }, [activeRelationshipId, edges]);

  const tables = tableEditor ?? (
    <ERDTableListPanel nodes={nodes} search={tableSearch} onSearchChange={setTableSearch}
      activeId={activeTableId} onSelect={setActiveTableId} onEdit={onEditTable} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-4 pt-3 pb-2">
        <Tabs value={tab} onValueChange={value => setTab(value as PropertiesTab)} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="tables">Tables ({nodes.length})</TabsTrigger>
            <TabsTrigger value="relationships">Relationships ({rows.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'tables' ? tables : editingEdge ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <button type="button" onClick={() => setEditingEdgeId(null)} className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
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
                onUpdateEdge={onUpdateEdge}
                onFlipEdge={onFlipEdge}
                onDeleteEdge={onDeleteEdge}
              />
            </div>
          </div>
        ) : (
          <ERDRelationshipListPanel rows={rows} search={relationshipSearch} onSearchChange={setRelationshipSearch}
            activeId={activeRelationshipId} onSelect={setActiveRelationshipId} onEdit={setEditingEdgeId} />
        )}
      </div>
    </div>
  );
}
