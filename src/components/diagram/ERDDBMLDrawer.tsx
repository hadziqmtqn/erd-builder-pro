import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { Node, Edge } from '@xyflow/react';
import { X } from 'lucide-react';
import type { Entity } from '@/types';
import { Button } from '@/components/ui/button';
import { DBMLEditorPanel } from '@/components/diagram/DBMLEditorPanel';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useSettledERDCanvas } from '@/contexts/ERDCanvasContext';
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

const MIN_HEIGHT = 20;
const MAX_HEIGHT = 85;

/**
 * The full, editable DBML of this pane's diagram, in a drawer at the bottom of its canvas (ERD-004).
 * It stays mounted while closed so an unapplied draft survives closing and opening it again.
 */
// Memoized: ERDView re-renders on every drag frame and this drawer stays mounted while closed.
export const ERDDBMLDrawer = memo(function ERDDBMLDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The URL UUID stays the same while the workspace swaps a numeric diagram ID for the UUID during loading.
  const { id: diagramUid } = useParams<{ id: string }>();
  const { activeDiagram, saveDiagram, viewportRef, isGuest, triggerDebouncedSync, setNodes, setEdges, takeSnapshot, setSelectedNodeId } = useWorkspace();
  // Settled, not live: re-rendering on every drag frame made dragging slow.
  const { nodes, edges } = useSettledERDCanvas();
  const [height, setHeight] = useState(48);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [dbmlContent, setDbmlContent] = useState('');
  const dbmlContentRef = useRef('');
  const dbmlDraftDirtyRef = useRef(false);
  const dbmlSourceKeyRef = useRef<string | null>(null);

  const setLocalDbmlContent = useCallback((content: string) => {
    dbmlContentRef.current = content;
    setDbmlContent(content);
  }, []);

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
    if (open && nodes.length > 0 && !dbmlContent.trim()) {
      try {
        const dbml = erdToDBML(nodes, edges);
        if (dbml.trim()) setLocalDbmlContent(dbml);
      } catch { /* retried once the canvas is ready */ }
    }
  }, [open, nodes, edges, dbmlContent, setLocalDbmlContent]);

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

  // Drag the top edge to resize; the height is a share of the canvas so it fits any pane. Pointer capture
  // sends the moves to the handle and ends with it (up, cancel or lost capture), so nothing is left listening.
  const dragRef = useRef<DOMRect | null>(null);
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    const canvas = drawerRef.current?.parentElement;
    if (!canvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = canvas.getBoundingClientRect();
  };
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const rect = dragRef.current;
    if (!rect) return;
    const share = (rect.bottom - event.clientY) / rect.height * 100;
    setHeight(Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, share))));
  };
  const stopResize = () => { dragRef.current = null; };

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-label="DBML drawer"
      aria-hidden={!open || undefined}
      style={{ height: `${height}%` }}
      className={cn('nowheel nodrag absolute inset-x-2 bottom-2 z-30 flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl', !open && 'hidden')}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize DBML drawer"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={MAX_HEIGHT}
        aria-valuenow={height}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={resize}
        onLostPointerCapture={stopResize}
        onKeyDown={event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          setHeight(value => Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, value + (event.key === 'ArrowUp' ? 5 : -5))));
        }}
        className="flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center focus-visible:bg-accent"
      >
        <span aria-hidden="true" className="h-1 w-10 rounded-full bg-border" />
      </div>
      <div className="min-h-0 flex-1">
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
          headerActions={
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close DBML drawer" title="Close">
              <X className="size-3.5" />
            </Button>
          }
        />
      </div>
    </div>
  );
});
