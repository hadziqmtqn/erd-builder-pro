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
import { LayoutGrid, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { apiFetch } from '@/lib/api';
import { localPersistence } from '@/lib/localPersistence';
import { type Entity } from '@/types';
import EntityNode, { NOTES_COMPANION_ENTITY_EDIT_EVENT } from '@/components/diagram/EntityNode';
import { edgeToRelationship } from '@/lib/diagram-payload';
import { autoLayoutERD } from '@/lib/autoLayoutERD';
import { readSavedViewport } from '@/lib/erd-viewport';
import { erdToDBML } from '@/lib/dbml-converter';
import { applyToErdContent } from '@/components/ai/actions/erdActions';
import { computeSchemaDiff, type DiffResult } from '@/lib/schema-diff';
import { mergeSchemaChanges } from '@/lib/schema-merge';
import { SchemaDiffOverlay } from '@/components/diagram/SchemaDiffOverlay';
import PropertiesPanel from '@/components/PropertiesPanel';
import { RelationshipPropertiesModal } from '@/components/modals/RelationshipPropertiesModal';
import { Button } from '@/components/ui/button';
import type { CompanionPane } from './NotesCompanionWorkspace';
import { diagramState, styleCompanionEdges } from './notes-companion-erd-state';

export { styleCompanionEdges } from './notes-companion-erd-state';
const erdNodeTypes = { entity: EntityNode };
const FlowchartView = lazy(() => import('@/components/views/FlowchartView').then(module => ({ default: module.FlowchartView })));
const ExcalidrawEditor = lazy(() => import('@/components/ExcalidrawEditor'));

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

function DiagramCanvas({ document, previewSchema, previewKey }: {
  document: any;
  previewSchema?: string;
  previewKey?: string;
}) {
  const initial = useMemo(() => diagramState(document), [document]);
  const { isGuest, resolvedTheme } = useWorkspace();
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingDiff, setPendingDiff] = useState<{
    originalNodes: Node<Entity>[];
    originalEdges: Edge[];
    proposedNodes: Node<Entity>[];
    proposedEdges: Edge[];
    result: DiffResult;
  } | null>(null);
  const [approvedChangeIds, setApprovedChangeIds] = useState<string[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedViewport = useMemo(() => readSavedViewport(document), [document]);
  const savedViewport = persistedViewport ?? { x: 0, y: 0, zoom: 1 };
  const viewportRef = useRef(savedViewport);
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
          if (item) await localPersistence.saveResource({
            ...item,
            entities,
            relationships,
            data: null,
            dbml_source: dbmlSource,
            viewport_x: viewportRef.current.x,
            viewport_y: viewportRef.current.y,
            viewport_zoom: viewportRef.current.zoom,
            updated_at: new Date().toISOString(),
          });
        } else {
          const response = await apiFetch(`/api/diagrams/save/${document.uid ?? document.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entities, relationships, viewport: viewportRef.current, data: null, dbmlSource }),
          });
          if (!response.ok) throw new Error();
        }
      } catch {
        toast.error('Could not save ERD changes');
      }
    }, 350);
  }, [document.id, document.uid, isGuest]);

  useEffect(() => {
    if (!previewSchema || !previewKey) return;
    try {
      const proposal = applyToErdContent(nodesRef.current, edgesRef.current, 'erd-generate-sql', previewSchema);
      if (!proposal) throw new Error();
      const result = computeSchemaDiff(nodesRef.current, edgesRef.current, proposal.nodes, proposal.edges);
      if (result.changes.length === 0) {
        setPendingDiff(null);
        toast.success('No schema changes found');
        return;
      }
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setApprovedChangeIds(result.changes.map(change => change.id));
      setShowChecklist(false);
      setPendingDiff({
        originalNodes: nodesRef.current,
        originalEdges: edgesRef.current,
        proposedNodes: proposal.nodes,
        proposedEdges: proposal.edges,
        result,
      });
    } catch {
      toast.error('Could not parse the schema for diff');
    }
  }, [previewKey, previewSchema]);

  const mergeDiff = useCallback(() => {
    if (!pendingDiff) return;
    const next = mergeSchemaChanges(
      pendingDiff.originalNodes,
      pendingDiff.originalEdges,
      pendingDiff.proposedNodes,
      pendingDiff.proposedEdges,
      pendingDiff.result,
      approvedChangeIds,
    );
    setNodes(next.nodes);
    setEdges(next.edges);
    setPendingDiff(null);
    persist(next.nodes, next.edges);
    toast.success('Schema changes merged successfully');
  }, [approvedChangeIds, pendingDiff, persist]);

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

  const autoLayout = useCallback(() => {
    if (nodesRef.current.length === 0) return;
    const next = autoLayoutERD(nodesRef.current, edgesRef.current);
    setNodes(next);
    persist(next, edgesRef.current);
  }, [persist]);

  const handleMove = useCallback((_: unknown, viewport: typeof savedViewport) => {
    viewportRef.current = viewport;
  }, []);

  const handleMoveEnd = useCallback((event: unknown, viewport: typeof savedViewport) => {
    viewportRef.current = viewport;
    if (event) persist(nodesRef.current, edgesRef.current);
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
  const diffEdges = useMemo(
    () => pendingDiff ? styleCompanionEdges(pendingDiff.result.edges, null) : [],
    [pendingDiff],
  );
  const diffNodes = useMemo(() => pendingDiff?.result.nodes.map(node => ({
    ...node,
    data: { ...node.data, isDiffMode: true },
  })) ?? [], [pendingDiff]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background">
      <ReactFlow
        nodes={pendingDiff ? diffNodes : displayNodes}
        edges={pendingDiff ? diffEdges : displayEdges}
        nodeTypes={erdNodeTypes}
        onNodesChange={updateNodes}
        onEdgesChange={updateEdges}
        onConnect={connect}
        onReconnect={reconnect}
        nodesDraggable={!pendingDiff}
        nodesConnectable={!pendingDiff}
        elementsSelectable={!pendingDiff}
        edgesReconnectable={!pendingDiff}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={(_, node) => { setSelectedEdgeId(null); setSelectedNodeId(node.id); }}
        onNodeDoubleClick={(_, node) => { setSelectedEdgeId(null); setSelectedNodeId(node.id); }}
        onEdgeClick={(_, edge) => { setSelectedNodeId(null); setSelectedEdgeId(edge.id); }}
        onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        colorMode={resolvedTheme}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={defaultEdgeOptions.style}
        onlyRenderVisibleElements
        defaultViewport={savedViewport}
        fitView={!persistedViewport}
      >
        <Background variant={BackgroundVariant.Lines} gap={50} size={1} color={bgColor} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      {!pendingDiff && <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
          <Button size="sm" onClick={addEntity}><Plus /> Table</Button>
          <Button variant="outline" size="sm" onClick={autoLayout} disabled={nodes.length === 0} title="Automatically arrange tables"><LayoutGrid /> Auto Layout</Button>
        </div>
      </div>}
      {!pendingDiff && selectedEntity && (
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
        isOpen={!pendingDiff && !!selectedEdgeId}
        onOpenChange={open => { if (!open) setSelectedEdgeId(null); }}
        selectedEdge={selectedEdge}
        nodes={nodes}
        handleEdgeUpdate={updateEdge}
        handleEdgeFlip={flipEdge}
        deleteEdge={deleteEdge}
      />
      {pendingDiff && <SchemaDiffOverlay
        diff={pendingDiff.result}
        approvedIds={approvedChangeIds}
        showChecklist={showChecklist}
        onApprovedIdsChange={setApprovedChangeIds}
        onShowChecklistChange={setShowChecklist}
        onReject={() => {
          setPendingDiff(null);
          toast.info('Schema update rejected');
        }}
        onMerge={mergeDiff}
      />}
    </div>
  );
}

function Content({ pane, document }: { pane: CompanionPane; document: any }) {
  const { saveFlowchart, saveDrawing, triggerDebouncedSync } = useWorkspace();
  if (pane.type === 'erd') return <ReactFlowProvider><DiagramCanvas
    key={document.uid ?? document.id}
    document={document}
    previewSchema={pane.previewSchema}
    previewKey={pane.previewKey}
  /></ReactFlowProvider>;
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
