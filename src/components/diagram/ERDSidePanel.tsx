import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Database, PanelRightClose, Pencil } from 'lucide-react';
import type { Entity } from '@/types';
import { Button } from '@/components/ui/button';
import { DBMLEditorPanel } from '@/components/diagram/DBMLEditorPanel';
import { ERDPropertiesTabs } from '@/components/diagram/ERDPropertiesTabs';
import PropertiesPanel from '@/components/PropertiesPanel';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useSettledERDCanvas } from '@/contexts/ERDCanvasContext';
import type { ERDPanel } from '@/contexts/ERDPanelContext';
import { dbmlToERD, erdToDBML } from '@/lib/dbml-converter';
import { mergeDBMLCanvas } from '@/lib/dbml-canvas-merge';
import { ERD_REPOSITORY_APPLIED_EVENT } from '@/lib/repository-preview';

function isValidDBMLSource(content: string): boolean {
  if (!content.trim()) return false;
  try {
    dbmlToERD(content);
    return true;
  } catch {
    return false;
  }
}

function entitySchemaKey(entity: Entity): string {
  return JSON.stringify({
    name: entity.name,
    columns: entity.columns.map(column => ({
      name: column.name,
      type: column.type,
      is_pk: column.is_pk,
      is_nullable: column.is_nullable,
      default_value: column.default_value || null,
      is_unique: Boolean(column.is_unique),
      comment: column.comment || '',
      max_length: column.max_length ?? null,
      numeric_precision: column.numeric_precision ?? null,
      numeric_scale: column.numeric_scale ?? null,
    })),
    comment: entity.comment || '',
    constraints: (entity.constraints || []).map(constraint => ({
      kind: constraint.kind,
      name: constraint.name || '',
      columns: (constraint.column_ids || []).map(id => entity.columns.find(column => column.id === id)?.name || id).sort(),
      expression: constraint.expression || '',
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    indexes: (entity.indexes || []).map(index => ({
      name: index.name,
      is_unique: Boolean(index.is_unique),
      algorithm: index.algorithm || '',
      columns: (index.column_ids || []).map(id => entity.columns.find(column => column.id === id)?.name || id).sort(),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

/**
 * Properties and DBML for the diagram in this pane, docked next to its canvas (BUG-042).
 * It reads the pane's own workspace and canvas, so two ERD panes side by side each keep their own panel.
 */
export function ERDSidePanel({ panel, onPanelChange, editable, diagramUid }: {
  panel: ERDPanel;
  onPanelChange: (panel: ERDPanel) => void;
  editable: boolean;
  /** The diagram UUID from the URL, stable while the workspace swaps a numeric ID for the UUID during loading. */
  diagramUid: string | undefined;
}) {
  const {
    activeDiagram, saveDiagram, viewportRef, isGuest, triggerDebouncedSync,
    setNodes, setEdges, takeSnapshot,
    selectedNodeId, setSelectedNodeId,
    handleEdgeUpdate, handleEdgeFlip, deleteEdge, handleEntityUpdate, deleteEntity,
  } = useWorkspace();
  // Settled, not live: re-rendering on every drag frame made dragging slow.
  const { nodes, edges } = useSettledERDCanvas();

  const [propertiesEntityId, setPropertiesEntityId] = useState<string | null>(null);
  const [dbmlContent, setDbmlContent] = useState('');
  const dbmlContentRef = useRef('');
  const dbmlDraftDirtyRef = useRef(false);
  const dbmlSourceKeyRef = useRef<string | null>(null);

  const setLocalDbmlContent = useCallback((content: string) => {
    dbmlContentRef.current = content;
    setDbmlContent(content);
  }, []);

  const propertiesEntity = useMemo(() => {
    const node = nodes.find(node => node.id === selectedNodeId)
      ?? nodes.find(node => node.id === propertiesEntityId);
    if (!node) return null;
    return node.data.id === node.id ? node.data : { ...node.data, id: node.id };
  }, [nodes, propertiesEntityId, selectedNodeId]);

  const dbmlStorageKey = diagramUid ? `erd-builder-dbml:${diagramUid}` : null;
  const activeDiagramDbmlSource = activeDiagram?.dbml_source ?? activeDiagram?.dbmlSource ?? '';

  // Read the persisted DBML source from the diagram first. Fall back to the
  // legacy browser cache once so older users keep standalone DBML constructs.
  useEffect(() => {
    const keyChanged = dbmlSourceKeyRef.current !== dbmlStorageKey;
    if (keyChanged) {
      dbmlSourceKeyRef.current = dbmlStorageKey;
      dbmlDraftDirtyRef.current = false;
    }

    if (!dbmlStorageKey) {
      setLocalDbmlContent('');
      return;
    }

    if (activeDiagramDbmlSource) {
      if (keyChanged || !dbmlDraftDirtyRef.current || !dbmlContentRef.current.trim()) {
        setLocalDbmlContent(activeDiagramDbmlSource);
      }
      return;
    }

    if (!keyChanged && dbmlDraftDirtyRef.current) return;

    try {
      const legacyDbml = localStorage.getItem(dbmlStorageKey) || '';
      setLocalDbmlContent(legacyDbml);
    } catch {
      setLocalDbmlContent('');
    }
  }, [dbmlStorageKey, activeDiagramDbmlSource, setLocalDbmlContent]);

  // Generate DBML from the canvas on the first open. Keep the source text afterwards:
  // it contains DBML-only constructs (Enum, Note and TableGroup) which the canvas does not model completely.
  useEffect(() => {
    if (panel === 'dbml' && nodes.length > 0 && !dbmlContent.trim()) {
      try {
        const dbml = erdToDBML(nodes, edges);
        if (dbml.trim()) setLocalDbmlContent(dbml);
      } catch { /* retried once the canvas is ready */ }
    }
  }, [panel, nodes, edges, dbmlContent, setLocalDbmlContent]);

  useEffect(() => {
    const syncRepositoryDbml = (event: Event) => {
      const detail = (event as CustomEvent<{ dbmlSource?: string; diagramUid?: string }>).detail;
      // Same workspace field as the sender (ERDView), not the URL, which can hold the numeric ID.
      if (detail?.diagramUid && detail.diagramUid !== activeDiagram?.uid) return;
      if (detail?.dbmlSource) setLocalDbmlContent(detail.dbmlSource);
    };
    window.addEventListener(ERD_REPOSITORY_APPLIED_EVENT, syncRepositoryDbml);
    return () => window.removeEventListener(ERD_REPOSITORY_APPLIED_EVENT, syncRepositoryDbml);
  }, [activeDiagram?.uid, setLocalDbmlContent]);

  // Losing edit access closes the panel, so it does not come back by itself when access returns.
  useEffect(() => {
    if (!editable && panel !== 'closed') onPanelChange('closed');
  }, [editable, panel, onPanelChange]);

  // Table properties belong to the diagram this pane shows.
  const previousDiagramUidRef = useRef(diagramUid);
  useEffect(() => {
    if (previousDiagramUidRef.current === diagramUid) return;
    previousDiagramUidRef.current = diagramUid;
    setPropertiesEntityId(null);
    if (panel === 'properties') onPanelChange('closed');
  }, [diagramUid, panel, onPanelChange]);

  useEffect(() => {
    if (panel === 'properties' && selectedNodeId) setPropertiesEntityId(selectedNodeId);
  }, [panel, selectedNodeId]);

  const handleDBMLContentChange = useCallback((content: string, persistNow = false) => {
    setLocalDbmlContent(content);
    dbmlDraftDirtyRef.current = !persistNow;
    if (!persistNow || !isValidDBMLSource(content)) return;
    void saveDiagram(nodes, edges, viewportRef.current, { dbmlSource: content }).then(() => {
      if (!isGuest) triggerDebouncedSync();
    });
  }, [saveDiagram, nodes, edges, viewportRef, isGuest, triggerDebouncedSync, setLocalDbmlContent]);

  const handleDBMLApply = useCallback((newNodes: Node<Entity>[], newEdges: Edge[], source: string) => {
    const { nodes: mergedNodes, edges: mergedEdges } = mergeDBMLCanvas(newNodes, newEdges, nodes, edges);

    // Compare by table structure + column properties (parser generates new UUIDs)
    const nodesSame = mergedNodes.length === nodes.length &&
      mergedNodes.every((n) => {
        const cur = nodes.find(node => node.id === n.id);
        if (!cur || n.data.name !== cur.data.name) return false;
        return entitySchemaKey(n.data) === entitySchemaKey(cur.data);
      });
    const edgeKey = (edge: Edge) => JSON.stringify({
      source: edge.source, target: edge.target,
      sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
      label: edge.label, data: edge.data,
    });
    const sortedNew = mergedEdges.map(edgeKey).sort();
    const sortedCur = edges.map(edgeKey).sort();
    const edgesSame = JSON.stringify(sortedNew) === JSON.stringify(sortedCur);

    if (nodesSame && edgesSame) {
      void saveDiagram(nodes, edges, viewportRef.current, { dbmlSource: source }).then(() => triggerDebouncedSync());
      dbmlDraftDirtyRef.current = false;
      return;
    }
    takeSnapshot?.(nodes, edges);
    setNodes(mergedNodes);
    setEdges(mergedEdges);
    dbmlDraftDirtyRef.current = false;
    saveDiagram?.(mergedNodes, mergedEdges, viewportRef?.current, { dbmlSource: source })
      ?.then(() => triggerDebouncedSync?.());
  }, [nodes, edges, setNodes, setEdges, takeSnapshot, saveDiagram, viewportRef, triggerDebouncedSync]);

  if (!editable || panel === 'closed') return null;

  const tab = (value: Exclude<ERDPanel, 'closed'>, icon: ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => onPanelChange(value)}
      aria-pressed={panel === value}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
        panel === value
          ? 'border-primary text-primary bg-background/50'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <aside
      aria-label="Diagram panel"
      // Docked beside the canvas; on narrow screens it covers the canvas as before instead of squeezing it.
      className="flex w-85 shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-[min(21.25rem,100%)] max-md:shadow-xl"
    >
      <div className="shrink-0 flex items-center border-b border-border bg-muted/20">
        <div className="flex-1 flex">
          {tab('properties', <Pencil className="size-3.5" />, 'Properties')}
          {tab('dbml', <Database className="size-3.5" />, 'DBML')}
        </div>
        <Button variant="ghost" size="icon" className="size-8 mr-1" onClick={() => onPanelChange('closed')} title="Close panel" aria-label="Close panel">
          <PanelRightClose className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        {panel === 'dbml' ? (
          <DBMLEditorPanel
            value={dbmlContent}
            onChange={handleDBMLContentChange}
            onApply={handleDBMLApply}
            nodes={nodes}
            edges={edges}
            onSelectTable={(name) => {
              const node = nodes.find(n => n.data.name.toLowerCase() === name.toLowerCase());
              if (node) setSelectedNodeId(node.id);
            }}
          />
        ) : (
          <ERDPropertiesTabs
            nodes={nodes}
            edges={edges}
            focusedTableId={propertiesEntity?.id ?? null}
            onUpdateEdge={handleEdgeUpdate}
            onFlipEdge={handleEdgeFlip}
            onDeleteEdge={deleteEdge}
            onEditTable={(id) => {
              setPropertiesEntityId(id);
              setSelectedNodeId(id);
            }}
            tableEditor={propertiesEntity ? (
              <PropertiesPanel
                key={propertiesEntity.id}
                selectedEntity={propertiesEntity}
                onUpdateEntity={handleEntityUpdate}
                onBackToTables={() => {
                  setSelectedNodeId(null);
                  setPropertiesEntityId(null);
                }}
                onDeleteEntity={(id) => {
                  deleteEntity(id);
                  setSelectedNodeId(null);
                  onPanelChange('closed');
                }}
              />
            ) : null}
          />
        )}
      </div>
    </aside>
  );
}
