import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { Database } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, getAuthToken } from '@/lib/api';
import { autoLayoutERD } from '@/lib/autoLayoutERD';
import { alignErdHandles } from '@/lib/erd-geometry';
import { canvasLayout, dbSchemaToCanvas } from '@/lib/db-client-schema';
import { saveDbClientLayout } from '@/lib/db-client-layout';
import { getSchemaCache, setSchemaCache } from '@/hooks/useDataViewerHelpers';
import { useImageExporter } from '@/hooks/useImageExporter';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { ERDView } from '@/components/views/ERDView';
import { RelationshipPropertiesModal } from '@/components/modals/RelationshipPropertiesModal';
import { ProjectFileTabs } from '@/components/ProjectFileTabs';
import { DataViewer } from '@/components/db-connect/DataViewer';
import { DataQueryView } from '@/components/db-connect/DataQueryView';
import { DataViewerModeToolbar, type DataViewerMode } from '@/components/db-connect/DataViewerModeToolbar';
import type { Entity } from '@/types';

export function DbClientEditorRoute() {
  const { id } = useParams<{ id: string }>();
  return <ReactFlowProvider key={id}><DbClientEditor id={id} /></ReactFlowProvider>;
}

function DbClientEditor({ id }: { id?: string }) {
  const [params, setParams] = useSearchParams();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [dbType, setDbType] = useState<string | null>(null);
  const [queryInitialTable, setQueryInitialTable] = useState<string | null>(null);
  const [queryOpenNonce, setQueryOpenNonce] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const clientRef = useRef<any>(null);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadIdRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const canvasSchemaRef = useRef<any[] | null>(null);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const { setViewport, getViewport, getNodes, fitView } = useReactFlow<Node<Entity>>();
  const { handleExportImage } = useImageExporter();
  const { setBreadcrumbLabel, user } = useWorkspace();
  const requestedMode = params.get('tab');
  const mode: DataViewerMode = requestedMode === 'erd' || requestedMode === 'query' ? requestedMode : 'data';
  const modeRef = useRef(mode);
  const aliveRef = useRef(true);
  modeRef.current = mode;
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  const mountedModesRef = useRef(new Set<DataViewerMode>(['data']));
  mountedModesRef.current.add(mode);
  const catalogId = Number(client?.catalog_id);
  clientRef.current = client;

  const setMode = useCallback((tab: DataViewerMode) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setParams]);

  const load = useCallback(async () => {
    if (!id) return;
    // A newer load (another file) supersedes this one; its late responses must not touch state.
    const loadId = ++loadIdRef.current;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    const token = getAuthToken();
    loadAbortRef.current = controller;
    const stale = () => loadIdRef.current !== loadId || controller.signal.aborted || getAuthToken() !== token;
    setLoading(true);
    try {
      // Cached document data is not an authorization decision, including after a logout/login.
      const clientResponse = await apiFetch(`/api/db-clients/${encodeURIComponent(id)}`, { signal: controller.signal });
      const nextClient = await clientResponse.json();
      if (stale()) return;
      if (!clientResponse.ok) throw new Error(nextClient.error || 'Failed to load DB Client');
      setClient(nextClient);
      setBreadcrumbLabel(nextClient.name);
      const nextCatalogId = Number(nextClient.catalog_id);
      if (!nextCatalogId) {
        setNodes([]);
        setEdges([]);
        return;
      }
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [id, user?.id, setBreadcrumbLabel, setEdges, setNodes, setViewport]);

  useEffect(() => {
    if (loading || mode !== 'erd' || !catalogId) return;
    const controller = new AbortController();
    const token = getAuthToken();
    let frame: number | null = null;
    const stale = () => controller.signal.aborted || getAuthToken() !== token;
    setSchemaLoading(true);
    void (async () => {
      try {
        let schema = getSchemaCache(catalogId);
        if (!schema) {
          const response = await apiFetch(`/api/catalogs/${catalogId}/schema`, { method: 'POST', signal: controller.signal });
          schema = await response.json();
          if (stale()) return;
          if (!response.ok) throw new Error(schema.error || 'Failed to load database schema');
          setSchemaCache(catalogId, schema);
        }
        if (stale()) return;
        if (canvasSchemaRef.current === schema.schema) return;
        const layout = clientRef.current?.data;
        const canvas = dbSchemaToCanvas(schema.schema || [], layout);
        canvasSchemaRef.current = schema.schema;
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
        setDbType(schema.dbType || null);
        if (layout?.viewport) {
          viewportRef.current = layout.viewport;
          frame = requestAnimationFrame(() => setViewport(layout.viewport, { duration: 0 }));
        }
      } catch (error) {
        if (!stale()) toast.error(error instanceof Error ? error.message : 'Failed to load database schema');
      } finally {
        if (!stale()) setSchemaLoading(false);
      }
    })();
    return () => { controller.abort(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [loading, mode, catalogId, user?.id, setEdges, setNodes, setViewport]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const loadId = loadIdRef.current + 1;
      void load().catch(() => { if (loadIdRef.current === loadId) setClient(null); });
    });
    return () => { clearTimeout(timer); loadAbortRef.current?.abort(); loadIdRef.current += 1; setBreadcrumbLabel(null); };
  }, [load, setBreadcrumbLabel]);

  useEffect(() => {
    const openQuery = (event: Event) => {
      setQueryInitialTable((event as CustomEvent).detail?.table || null);
      setQueryOpenNonce(value => value + 1);
      setMode('query');
    };
    window.addEventListener('db-connect-open-query', openQuery);
    return () => window.removeEventListener('db-connect-open-query', openQuery);
  }, [setMode]);

  const saveLayout = useCallback(async (viewport = viewportRef.current, layoutNodes = getNodes(), layoutEdges: Edge[] = edgesRef.current) => {
    const currentClient = clientRef.current;
    if (!currentClient) return;
    const data = canvasLayout(layoutNodes, viewport, currentClient.data, layoutEdges);
    clientRef.current = { ...currentClient, data };
    setClient((current: any) => current ? { ...current, data } : current);
    await saveDbClientLayout(String(currentClient.uid || currentClient.id), data).catch(error => {
      toast.error(`ERD layout was not saved: ${error instanceof Error ? error.message : 'network error'}. Move a table to retry.`);
    });
  }, [getNodes]);

  const scheduleLayoutSave = useCallback(() => {
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = setTimeout(() => {
      layoutTimerRef.current = null;
      void saveLayout();
    }, 300);
  }, [saveLayout]);

  const handleCanvasMove = useCallback((_: any, viewport: any) => { viewportRef.current = viewport; }, []);
  const handleCanvasMoveEnd = useCallback((event: any, viewport: any) => {
    viewportRef.current = viewport;
    if (event) scheduleLayoutSave();
  }, [scheduleLayoutSave]);

  useEffect(() => () => {
    if (!layoutTimerRef.current) return;
    clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = null;
    void saveLayout();
  }, [id, saveLayout]);

  const handleAutoLayout = useCallback(() => {
    const nextNodes = autoLayoutERD(getNodes(), edgesRef.current);
    const nextEdges = alignErdHandles(nextNodes, edgesRef.current);
    setNodes(nextNodes);
    setEdges(nextEdges);
    void saveLayout(viewportRef.current, nextNodes, nextEdges);
    requestAnimationFrame(() => {
      if (!aliveRef.current || modeRef.current !== 'erd') return;
      void fitView({ padding: 0.2, duration: 0 }).then(() => {
        if (aliveRef.current && modeRef.current === 'erd') return saveLayout(getViewport(), nextNodes, nextEdges);
      });
    });
  }, [getNodes, getViewport, fitView, saveLayout, setNodes, setEdges]);

  const handleSchemaApplied = useCallback((nextNodes: Node<Entity>[], nextEdges: Edge[], schema: any) => {
    // The merged canvas already reflects this schema; revisiting ERD must not rebuild it from the cache.
    if (Array.isArray(schema?.schema)) canvasSchemaRef.current = schema.schema;
    void saveLayout(viewportRef.current, nextNodes, nextEdges);
  }, [saveLayout]);

  const handleEdgeFlip = useCallback((edgeId: string) => {
    const toggleSide = (handle?: string | null) => {
      if (!handle) return handle;
      if (handle.endsWith('-source')) return handle.replace(/-source$/, '-source-l');
      if (handle.endsWith('-source-l')) return handle.replace(/-source-l$/, '-source');
      if (handle.endsWith('-target')) return handle.replace(/-target$/, '-target-r');
      return handle.endsWith('-target-r') ? handle.replace(/-target-r$/, '-target') : handle;
    };
    const nextEdges = edges.map(edge => edge.id === edgeId ? {
      ...edge,
      sourceHandle: toggleSide(edge.sourceHandle),
      targetHandle: toggleSide(edge.targetHandle),
    } : edge);
    setEdges(nextEdges);
    void saveLayout(viewportRef.current, getNodes(), nextEdges);
  }, [edges, getNodes, saveLayout, setEdges]);

  if (loading) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading DB Client…</div>;
  if (!client) return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <Database className="mb-3 size-10 opacity-40" />DB Client not found
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ProjectFileTabs currentView="db-client" currentFile={client} />
      <DataViewerModeToolbar activeMode={mode} dbType={dbType} onModeChange={setMode} />
      {catalogId ? (
        <div className={mode === 'data' ? 'contents' : 'hidden'}>
          <DataViewer connectionId={catalogId} stateKey={`${client.uid}:${catalogId}`} onDbTypeChange={setDbType} active={mode === 'data'} />
        </div>
      ) : null}
      {mountedModesRef.current.has('query') && catalogId ? (
        <div className={mode === 'query' ? 'contents' : 'hidden'}>
          <DataQueryView connectionId={catalogId} dbClientId={Number(client.id)} initialTable={queryInitialTable} openNonce={queryOpenNonce} />
        </div>
      ) : null}
      {mountedModesRef.current.has('erd') ? (
        <div className={mode === 'erd' ? 'contents' : 'hidden'}>
          <ERDView
            nodes={nodes} edges={edges} setNodes={setNodes} setEdges={setEdges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={() => {}}
            onNodeClick={() => {}} onPaneClick={() => {}} onMove={handleCanvasMove}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            addEntity={() => {}} handleExportSQL={() => {}} handleExportImage={() => handleExportImage(client.name)}
            onAutoLayout={handleAutoLayout}
            onDatabaseSchemaApplied={handleSchemaApplied}
            isReadOnly isDbClient sourceConnectionId={catalogId}
            isActive={mode === 'erd'}
            onEdgeReconnect={nextEdges => { void saveLayout(viewportRef.current, getNodes(), nextEdges); }}
            onNodeDragStop={scheduleLayoutSave}
            onMoveEnd={handleCanvasMoveEnd}
            isLoading={schemaLoading}
          />
          <RelationshipPropertiesModal
            isOpen={!!selectedEdgeId}
            onOpenChange={open => { if (!open) setSelectedEdgeId(null); }}
            selectedEdge={edges.find(edge => edge.id === selectedEdgeId) || null}
            nodes={nodes}
            handleEdgeUpdate={() => {}}
            handleEdgeFlip={handleEdgeFlip}
            deleteEdge={() => {}}
            moveOnly
          />
        </div>
      ) : null}
    </div>
  );
}
