import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { apiFetch } from '@/lib/api';
import { localPersistence } from '@/lib/localPersistence';
import { type Entity } from '@/types';
import EntityNode, { NOTES_COMPANION_ENTITY_EDIT_EVENT } from '@/components/diagram/EntityNode';
import { edgeToRelationship } from '@/lib/diagram-payload';
import { erdToDBML } from '@/lib/dbml-converter';
import PropertiesPanel from '@/components/PropertiesPanel';
import { RelationshipPropertiesModal } from '@/components/modals/RelationshipPropertiesModal';
import { Button } from '@/components/ui/button';
import type { CompanionPane } from './NotesCompanionWorkspace';

const erdNodeTypes = { entity: EntityNode };
const FlowchartView = lazy(() => import('@/components/views/FlowchartView').then(module => ({ default: module.FlowchartView })));
const ExcalidrawEditor = lazy(() => import('@/components/ExcalidrawEditor'));

function parseData(value: unknown) {
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}

function normalizeColumn(column: any) {
  return {
    ...column,
    id: String(column.id),
    is_pk: column.is_pk ?? column.isPk ?? false,
    is_nullable: column.is_nullable ?? column.isNullable ?? true,
    is_unique: column.is_unique ?? column.isUnique ?? false,
    default_value: column.default_value ?? column.defaultValue ?? null,
    enum_values: column.enum_values ?? column.enumValues ?? '',
    max_length: column.max_length ?? column.maxLength ?? null,
    numeric_precision: column.numeric_precision ?? column.numericPrecision ?? null,
    numeric_scale: column.numeric_scale ?? column.numericScale ?? null,
    sort_order: column.sort_order ?? column.sortOrder ?? 0,
  };
}

function normalizeEntity(entity: any) {
  const data = entity.data ?? entity;
  const id = String(entity.id ?? data.id);
  const x = entity.position?.x ?? entity.x ?? data.x ?? 0;
  const y = entity.position?.y ?? entity.y ?? data.y ?? 0;
  return {
    id,
    type: 'entity' as const,
    position: { x, y },
    data: {
      ...data,
      _notesCompanion: true,
      id,
      name: data.name ?? entity.name ?? 'Untitled',
      x,
      y,
      color: data.color ?? entity.color ?? '#6366f1',
      columns: (data.columns ?? entity.columns ?? []).map(normalizeColumn),
    },
  };
}

async function readDocument(type: CompanionPane['type'], uid: string, isGuest: boolean) {
  if (isGuest) {
    const resourceType = type === 'erd' ? 'erd' : type === 'flowchart' ? 'flowchart' : 'drawings';
    const direct = await localPersistence.getResource(uid);
    if (direct) return direct;
    const items = await localPersistence.getAllResources(resourceType);
    return items.find((item: any) => String(item.uid ?? item.id) === uid) ?? null;
  }
  const endpoint = type === 'erd' ? 'diagrams' : type === 'flowchart' ? 'flowcharts' : 'drawings';
  const response = await apiFetch(`/api/${endpoint}/${uid}`);
  return response.ok ? response.json() : null;
}

function diagramState(document: any) {
  const legacy = parseData(document.data) as any;
  const entities = Array.isArray(document.entities) && document.entities.length
    ? document.entities
    : Array.isArray(legacy?.nodes) ? legacy.nodes : [];
  const relationships = Array.isArray(document.relationships) && document.relationships.length
    ? document.relationships
    : Array.isArray(legacy?.edges) ? legacy.edges : [];
  const nodes = entities.map(normalizeEntity) as Node<Entity>[];
  const nodeById = new Map<string, Node<Entity>>(nodes.map(node => [node.id, node]));
  return {
    nodes,
    edges: relationships.map((relationship: any) => {
      const source = String(relationship.source ?? relationship.source_entity_id ?? relationship.sourceEntityId ?? '');
      const target = String(relationship.target ?? relationship.target_entity_id ?? relationship.targetEntityId ?? '');
      const sourceColumn = relationship.sourceHandle ?? relationship.source_handle ?? relationship.sourceColumnId ?? relationship.source_column_id;
      const targetColumn = relationship.targetHandle ?? relationship.target_handle ?? relationship.targetColumnId ?? relationship.target_column_id;
      const sourceNode = nodeById.get(source);
      const targetNode = nodeById.get(target);
      const sourceOnLeft = (sourceNode?.position.x ?? 0) < (targetNode?.position.x ?? 0);
      const sourceHandle = String(sourceColumn || '').startsWith('col-')
        ? sourceColumn
        : sourceColumn ? `col-${sourceColumn}-${sourceOnLeft ? 'source' : 'source-l'}` : undefined;
      const targetHandle = String(targetColumn || '').startsWith('col-')
        ? targetColumn
        : targetColumn ? `col-${targetColumn}-${sourceOnLeft ? 'target' : 'target-r'}` : undefined;
      return {
        ...relationship,
        id: String(relationship.id),
        source,
        target,
        sourceHandle,
        targetHandle,
        label: relationship.label,
        type: relationship.type ?? 'smoothstep',
        data: {
          ...(relationship.data || {}),
          on_delete: relationship.on_delete ?? relationship.onDelete,
          on_update: relationship.on_update ?? relationship.onUpdate,
          constraint_name: relationship.constraint_name ?? relationship.constraintName,
        },
      };
    }),
  } as { nodes: Node<Entity>[]; edges: Edge[] };
}

export function styleCompanionEdges(edges: Edge[], selectedNodeId: string | null) {
  const hasSelection = Boolean(selectedNodeId);
  return edges.map(edge => {
    const connected = hasSelection && (edge.source === selectedNodeId || edge.target === selectedNodeId);
    const color = connected || edge.selected ? 'var(--edge-selected)' : 'var(--edge-color)';
    const classes = [edge.className, connected ? 'edge-animated-active' : hasSelection ? 'edge-dimmed' : ''].filter(Boolean).join(' ');
    return {
      ...edge,
      type: 'smoothstep',
      style: { ...edge.style, stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.Arrow, color, width: 10, height: 10 },
      className: classes,
    };
  });
}

function DiagramCanvas({ document }: { document: any }) {
  const initial = useMemo(() => diagramState(document), [document]);
  const { isGuest, resolvedTheme } = useWorkspace();
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const persist = useCallback((nextNodes: Node<Entity>[], nextEdges: Edge[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const entities = nextNodes.map(node => ({ ...node.data, x: node.position.x, y: node.position.y }));
      const relationships = nextEdges.map(edgeToRelationship);
      const dbmlSource = erdToDBML(nextNodes, nextEdges);
      try {
        if (isGuest) {
          const item = await localPersistence.getResource(document.uid ?? document.id);
          if (item) await localPersistence.saveResource({ ...item, entities, relationships, data: null, dbml_source: dbmlSource, updated_at: new Date().toISOString() });
        } else {
          const response = await apiFetch(`/api/diagrams/save/${document.uid ?? document.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entities, relationships, viewport: { x: 0, y: 0, zoom: 1 }, data: null, dbmlSource }),
          });
          if (!response.ok) throw new Error();
        }
      } catch {
        toast.error('Could not save ERD changes');
      }
    }, 350);
  }, [document.id, document.uid, isGuest]);

  const updateNodes = useCallback((changes: NodeChange<Node<Entity>>[]) => {
    const next = applyNodeChanges(changes, nodesRef.current);
    setNodes(next);
    if (changes.some(change => change.type !== 'select' && change.type !== 'dimensions')) persist(next, edgesRef.current);
  }, [persist]);

  const updateEdges = useCallback((changes: EdgeChange<Edge>[]) => {
    const next = applyEdgeChanges(changes, edgesRef.current);
    setEdges(next);
    if (changes.some(change => change.type !== 'select')) persist(nodesRef.current, next);
  }, [persist]);

  const connect = useCallback((connection: Connection) => {
    const next = addEdge({ ...connection, id: crypto.randomUUID(), type: 'smoothstep', label: '1:N' }, edgesRef.current);
    setEdges(next);
    persist(nodesRef.current, next);
  }, [persist]);

  const updateEdge = useCallback((edgeId: string, update: string | { label?: string; data?: Record<string, any> }) => {
    const patch = typeof update === 'string' ? { label: update } : update;
    const next = edgesRef.current.map(edge => edge.id === edgeId
      ? { ...edge, ...patch, data: { ...(edge.data || {}), ...(patch.data || {}) } }
      : edge);
    setEdges(next);
    persist(nodesRef.current, next);
  }, [persist]);

  const flipEdge = useCallback((edgeId: string) => {
    const toggle = (handle?: string | null) => {
      if (!handle) return handle;
      if (handle.endsWith('-source')) return handle.replace(/-source$/, '-source-l');
      if (handle.endsWith('-source-l')) return handle.replace(/-source-l$/, '-source');
      if (handle.endsWith('-target')) return handle.replace(/-target$/, '-target-r');
      if (handle.endsWith('-target-r')) return handle.replace(/-target-r$/, '-target');
      return handle;
    };
    const next = edgesRef.current.map(edge => edge.id === edgeId
      ? { ...edge, sourceHandle: toggle(edge.sourceHandle), targetHandle: toggle(edge.targetHandle) }
      : edge);
    setEdges(next);
    persist(nodesRef.current, next);
  }, [persist]);

  const deleteEdge = useCallback((id: string) => {
    const next = edgesRef.current.filter(edge => edge.id !== id);
    setEdges(next);
    setSelectedEdgeId(null);
    persist(nodesRef.current, next);
  }, [persist]);

  const reconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    const columnId = (handle?: string | null) => handle
      ?.replace(/^col-/, '')
      .replace(/-(source|target)(-(l|r))?$/, '');
    if (!connection.sourceHandle || !connection.targetHandle) return;
    if (
      String(connection.source) !== String(oldEdge.source) ||
      String(connection.target) !== String(oldEdge.target) ||
      columnId(connection.sourceHandle) !== columnId(oldEdge.sourceHandle) ||
      columnId(connection.targetHandle) !== columnId(oldEdge.targetHandle)
    ) {
      toast.info('Only the connector position can be changed');
      return;
    }
    const column = (nodeId: string, handle?: string | null) => {
      const id = columnId(handle);
      return nodesRef.current.find(node => String(node.id) === String(nodeId))?.data.columns.find(item => String(item.id) === String(id));
    };
    const source = column(connection.source, connection.sourceHandle);
    const target = column(connection.target, connection.targetHandle);
    if (source && target && source.type !== target.type) {
      toast.error('Type Mismatch', { description: `Cannot reconnect ${source.type} to ${target.type}` });
      return;
    }
    const next = reconnectEdge(oldEdge, connection, edgesRef.current);
    setEdges(next);
    persist(nodesRef.current, next);
  }, [persist]);

  const updateEntity = useCallback((entity: Entity) => {
    const next = nodesRef.current.map(node => node.id === entity.id ? { ...node, data: entity } : node);
    setNodes(next);
    persist(next, edgesRef.current);
  }, [persist]);

  const deleteEntity = useCallback((id: string) => {
    const nextNodes = nodesRef.current.filter(node => node.id !== id);
    const nextEdges = edgesRef.current.filter(edge => edge.source !== id && edge.target !== id);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(null);
    persist(nextNodes, nextEdges);
  }, [persist]);

  const addEntity = useCallback(() => {
    const id = crypto.randomUUID();
    const entity: Entity = { id, name: 'new_table', x: 80, y: 80, color: '#6366f1', columns: [] };
    const next = [...nodesRef.current, { id, type: 'entity', position: { x: 80, y: 80 }, data: entity }];
    setNodes(next);
    setSelectedNodeId(id);
    persist(next, edgesRef.current);
  }, [persist]);

  useEffect(() => {
    const edit = (event: Event) => setSelectedNodeId((event as CustomEvent<{ id: string }>).detail?.id ?? null);
    window.addEventListener(NOTES_COMPANION_ENTITY_EDIT_EVENT, edit);
    return () => window.removeEventListener(NOTES_COMPANION_ENTITY_EDIT_EVENT, edit);
  }, []);

  const selectedEntity = nodes.find(node => node.id === selectedNodeId)?.data ?? null;
  const selectedEdge = edges.find(edge => edge.id === selectedEdgeId) ?? null;
  const bgColor = resolvedTheme === 'dark' ? '#222' : '#ccc';
  const defaultEdgeOptions = useMemo(() => ({
    type: 'smoothstep' as const,
    animated: false,
    reconnectable: true,
    style: { stroke: 'var(--edge-color)', strokeWidth: 2 },
    markerEnd: { type: MarkerType.Arrow, color: 'var(--edge-color)', width: 10, height: 10 },
  }), []);
  const displayNodes = useMemo(() => nodes.map(node => {
    const selected = node.id === selectedNodeId;
    return !!node.selected === selected ? node : { ...node, selected };
  }), [nodes, selectedNodeId]);
  const displayEdges = useMemo(() => styleCompanionEdges(edges, selectedNodeId), [edges, selectedNodeId]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={erdNodeTypes}
        onNodesChange={updateNodes}
        onEdgesChange={updateEdges}
        onConnect={connect}
        onReconnect={reconnect}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        edgesReconnectable
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={(_, node) => { setSelectedEdgeId(null); setSelectedNodeId(node.id); }}
        onNodeDoubleClick={(_, node) => { setSelectedEdgeId(null); setSelectedNodeId(node.id); }}
        onEdgeClick={(_, edge) => { setSelectedNodeId(null); setSelectedEdgeId(edge.id); }}
        onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
        colorMode={resolvedTheme}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={defaultEdgeOptions.style}
        onlyRenderVisibleElements
        fitView
      >
        <Background variant={BackgroundVariant.Lines} gap={50} size={1} color={bgColor} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <Button className="absolute left-3 top-3 z-10" size="sm" onClick={addEntity}><Plus /> Table</Button>
      {selectedEntity && (
        <aside className="absolute inset-y-0 right-0 z-20 w-[min(22rem,82%)] border-l bg-background shadow-xl">
          <PropertiesPanel
            selectedEntity={selectedEntity}
            onUpdateEntity={updateEntity}
            onDeleteEntity={deleteEntity}
            onBackToTables={() => setSelectedNodeId(null)}
            propertiesOnly
          />
        </aside>
      )}
      <RelationshipPropertiesModal
        isOpen={!!selectedEdgeId}
        onOpenChange={open => { if (!open) setSelectedEdgeId(null); }}
        selectedEdge={selectedEdge}
        nodes={nodes}
        handleEdgeUpdate={updateEdge}
        handleEdgeFlip={flipEdge}
        deleteEdge={deleteEdge}
      />
    </div>
  );
}

function Content({ pane, document }: { pane: CompanionPane; document: any }) {
  const { saveFlowchart, saveDrawing, triggerDebouncedSync } = useWorkspace();
  if (pane.type === 'erd') return <ReactFlowProvider><DiagramCanvas key={document.uid ?? document.id} document={document} /></ReactFlowProvider>;
  if (pane.type === 'flowchart') return (
    <FlowchartView
      companionMode
      activeFlowchartId={document.uid ?? document.id}
      activeFlowchart={document}
      handleFlowchartChange={(nodes, edges) => void saveFlowchart({ ...document, data: JSON.stringify({ nodes, edges }) }).then(() => triggerDebouncedSync())}
      saveFlowchart={saveFlowchart}
      triggerDebouncedSync={triggerDebouncedSync}
    />
  );
  return <ExcalidrawEditor compact drawing={document} onSave={saveDrawing} onChange={data => void saveDrawing({ ...document, data }).then(() => triggerDebouncedSync())} onDelete={() => {}} />;
}

export function NotesCompanionPane({ pane }: { pane: CompanionPane }) {
  const { isGuest } = useWorkspace();
  const [document, setDocument] = useState<any>();
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready'>('loading');
  useEffect(() => {
    let current = true;
    setStatus('loading');
    setDocument(undefined);
    void readDocument(pane.type, pane.uid, isGuest).then(value => {
      if (!current) return;
      setDocument(value);
      setStatus(value ? 'ready' : 'missing');
    }).catch(() => { if (current) setStatus('missing'); });
    return () => { current = false; };
  }, [isGuest, pane.type, pane.uid]);
  if (status === 'loading') return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>;
  if (status === 'missing') return <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground"><TriangleAlert className="size-5" />File unavailable</div>;
  return <Content pane={pane} document={document} />;
}
