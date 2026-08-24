import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEdgesState, useNodesState, useReactFlow, type Node } from '@xyflow/react';
import { Database } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { autoLayoutERD } from '@/lib/autoLayoutERD';
import { canvasLayout, dbSchemaToCanvas } from '@/lib/db-client-schema';
import { getDbClientCache, getSchemaCache, setDbClientCache, setSchemaCache } from '@/hooks/useDataViewerHelpers';
import { useImageExporter } from '@/hooks/useImageExporter';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { ERDView } from '@/components/views/ERDView';
import { ProjectFileTabs } from '@/components/ProjectFileTabs';
import { DataViewer } from '@/components/db-connect/DataViewer';
import { DataQueryView } from '@/components/db-connect/DataQueryView';
import { DataViewerModeToolbar, type DataViewerMode } from '@/components/db-connect/DataViewerModeToolbar';
import type { Entity } from '@/types';

export function DbClientEditorRoute() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dbType, setDbType] = useState<string | null>(null);
  const [queryInitialTable, setQueryInitialTable] = useState<string | null>(null);
  const [queryOpenNonce, setQueryOpenNonce] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const { setViewport, getNodes } = useReactFlow<Node<Entity>>();
  const { handleExportImage } = useImageExporter();
  const { setBreadcrumbLabel } = useWorkspace();
  const mode = (params.get('tab') || 'data') as DataViewerMode;
  const catalogId = Number(client?.catalog_id);

  const setMode = useCallback((tab: DataViewerMode) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setParams]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      let nextClient = getDbClientCache(id);
      if (!nextClient) {
        const clientResponse = await apiFetch(`/api/db-clients/${encodeURIComponent(id)}`);
        nextClient = await clientResponse.json();
        if (!clientResponse.ok) throw new Error(nextClient.error || 'Failed to load DB Client');
        setDbClientCache(nextClient);
      }
      setClient(nextClient);
      setBreadcrumbLabel(nextClient.name);
      const nextCatalogId = Number(nextClient.catalog_id);
      if (!nextCatalogId) {
        setNodes([]);
        setEdges([]);
        return;
      }
      let schema = getSchemaCache(nextCatalogId);
      if (!schema) {
        const schemaResponse = await apiFetch(`/api/catalogs/${nextCatalogId}/schema`, { method: 'POST' });
        schema = await schemaResponse.json();
        if (!schemaResponse.ok) throw new Error(schema.error || 'Failed to load database schema');
        setSchemaCache(nextCatalogId, schema);
      }
      const canvas = dbSchemaToCanvas(schema.schema || [], nextClient.data);
      setNodes(canvas.nodes);
      setEdges(canvas.edges);
      setDbType(schema.dbType || null);
      const viewport = nextClient.data?.viewport;
      if (viewport) {
        viewportRef.current = viewport;
        requestAnimationFrame(() => setViewport(viewport, { duration: 0 }));
      }
    } finally {
      setLoading(false);
    }
  }, [id, setBreadcrumbLabel, setEdges, setNodes, setViewport]);

  useEffect(() => {
    void load().catch(() => setClient(null));
    return () => setBreadcrumbLabel(null);
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

  const saveLayout = useCallback(async (viewport = viewportRef.current, layoutNodes = getNodes()) => {
    if (!client) return;
    const data = canvasLayout(layoutNodes, viewport, client.data);
    setClient((current: any) => current ? { ...current, data } : current);
    setDbClientCache({ ...client, data });
    await apiFetch(`/api/db-clients/${encodeURIComponent(client.uid || client.id)}/layout`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
    });
  }, [client, getNodes]);

  const handleAutoLayout = useCallback(() => {
    const nextNodes = autoLayoutERD(nodes, edges);
    setNodes(nextNodes);
    void saveLayout(viewportRef.current, nextNodes);
  }, [edges, nodes, saveLayout, setNodes]);

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
      {mode === 'data' && catalogId ? (
        <DataViewer connectionId={catalogId} stateKey={`${client.uid}:${catalogId}`} onDbTypeChange={setDbType} />
      ) : mode === 'query' && catalogId ? (
        <DataQueryView connectionId={catalogId} dbClientId={Number(client.id)} initialTable={queryInitialTable} openNonce={queryOpenNonce} />
      ) : (
        <ERDView
          nodes={nodes} edges={edges} setNodes={setNodes} setEdges={setEdges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={() => {}}
          onNodeClick={() => {}} onPaneClick={() => {}} onMove={(_, viewport) => { viewportRef.current = viewport; }}
          addEntity={() => {}} handleExportSQL={() => {}} handleExportImage={() => handleExportImage(client.name)}
          onAutoLayout={handleAutoLayout}
          isReadOnly isDbClient sourceConnectionId={catalogId}
          onNodeDragStop={() => { void saveLayout(); }}
          onMoveEnd={(_, viewport) => { viewportRef.current = viewport; void saveLayout(viewport); }}
          isLoading={loading}
        />
      )}
    </div>
  );
}
