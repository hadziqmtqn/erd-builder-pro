import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Database } from 'lucide-react';
import { autoLayoutERD } from '@/lib/autoLayoutERD';

import { ERDView } from '@/components/views/ERDView';
import { DataViewer } from '@/components/db-connect/DataViewer';
import { DataViewerModeToolbar, type DataViewerMode } from '@/components/db-connect/DataViewerModeToolbar';
import { DataQueryView } from '@/components/db-connect/DataQueryView';
import { ProjectFileTabs } from '@/components/ProjectFileTabs';

export function DiagramEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    nodes, edges, setNodes, isPublicView, publicData, activeDiagramId, activeDiagram,
    onNodesChange, onEdgesChange, onConnect,
    selectedNodeId, addEntity, undo, redo, canUndo, canRedo,
    takeSnapshot, onNodeDragStop, onMoveEnd,
    handleNodeClick, handleNodeDoubleClick, handleEdgeClick, handlePaneClick, handleMove,
    handleWorkspaceExportSQL, handleWorkspaceExportImage,
    handleOpenImportModal,
    viewportRef, saveDiagram, triggerDebouncedSync,
    isERDItemLoading, handleDiagramSelect,
    pendingErdDiffTrigger,
    extractColumnIdFromHandle, getRelationKey, dedupeEdgesByRelation,
  } = ctx;

  // Safety net: URL has id but context hasn't synced yet
  const processedUrlRef = useRef(false);

  // URL search params for tab state — AppLayout uses this to hide AI Chat on Data tab
  const [searchParams, setSearchParams] = useSearchParams();
  const [queryInitialTable, setQueryInitialTable] = useState<string | null>(null);
  const [queryOpenNonce, setQueryOpenNonce] = useState(0);
  const [dbType, setDbType] = useState<string | null>(null);

  // Read snake_case fields from API response (camelToSnake middleware converts all)
  const isProductionDb = useMemo(() => {
    const show = isPublicView ? publicData : activeDiagram;
    return !isPublicView && show?.source_type === 'production_db';
  }, [isPublicView, publicData, activeDiagram]);

  useEffect(() => {
    if (!isProductionDb || !activeDiagram) return;
    navigate(`/db-client/${activeDiagram.uid || activeDiagram.id}`, { replace: true });
  }, [activeDiagram, isProductionDb, navigate]);

  // Tab default: Data for production DB (browse records first), ERD for normal diagrams
  const diagramTab = (searchParams.get('tab') || (isProductionDb ? 'data' : 'erd')) as DataViewerMode;

  const setDiagramTab = useCallback((tab: DataViewerMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Sync default tab to URL param so AppLayout can detect Data mode (hide AI Chat)
  useEffect(() => {
    if (isProductionDb && !searchParams.get('tab')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'data');
        return next;
      }, { replace: true });
    }
  }, [isProductionDb, setSearchParams]);

  useEffect(() => {
    const openQuery = (event: Event) => {
      setQueryInitialTable((event as CustomEvent).detail?.table || null);
      setQueryOpenNonce((n) => n + 1);
      setDiagramTab('query');
    };
    window.addEventListener('db-connect-open-query', openQuery);
    return () => window.removeEventListener('db-connect-open-query', openQuery);
  }, [setDiagramTab]);

  const handleAutoLayout = useCallback(() => {
    if (!nodes || nodes.length === 0) return;
    const repositions = autoLayoutERD(nodes, edges);
    takeSnapshot?.(nodes, edges);
    setNodes(repositions);
    void saveDiagram(repositions, edges, viewportRef.current)
      .then(() => triggerDebouncedSync())
      .catch(error => console.error('Error saving ERD auto-layout:', error));
  }, [nodes, edges, setNodes, takeSnapshot, saveDiagram, triggerDebouncedSync, viewportRef]);
  useEffect(() => {
    if (isPublicView || !id) return;
    if (processedUrlRef.current) return;
    if (String(activeDiagramId) === id) {
      processedUrlRef.current = true;
      return;
    }
    if (!activeDiagramId) {
      processedUrlRef.current = true;
      handleDiagramSelect(id);
    }
  }, [id, activeDiagramId, isPublicView, handleDiagramSelect]);

  const sourceConnectionId = useMemo<number | undefined>(() => {
    const show = isPublicView ? publicData : activeDiagram;
    const raw = show?.source_connection_id;
    return raw != null ? Number(raw) : undefined;
  }, [isPublicView, publicData, activeDiagram]);

  if (!isPublicView && !activeDiagramId) {
    if (id && !processedUrlRef.current) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading diagram...</p>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <p className="text-sm font-medium text-muted-foreground">Select a diagram to view</p>
      </div>
    );
  }

  const show = isPublicView ? publicData : activeDiagram;
  const effectiveReadOnly = isPublicView || isProductionDb;
  const dataViewerStateKey = `${show?.uid || show?.id || ''}:${sourceConnectionId || ''}`;

  if (!show && !isPublicView && !isERDItemLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <Database className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Diagram not found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This diagram may have been deleted or is no longer available.</p>
      </div>
    );
  }

  if (!show && !isPublicView) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading diagram...</p>
      </div>
    );
  }

  if (isProductionDb) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Opening DB Client…</div>;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ProjectFileTabs currentView={isProductionDb ? 'db-client' : 'erd'} />
      {/* Tab bar — only for production DB diagrams */}
      {isProductionDb && !isPublicView && (
        <DataViewerModeToolbar activeMode={diagramTab} dbType={dbType} onModeChange={setDiagramTab} />
      )}

      {/* Content */}
      {diagramTab === 'data' && isProductionDb && !isPublicView && sourceConnectionId ? (
        <DataViewer
          key={dataViewerStateKey}
          connectionId={sourceConnectionId}
          stateKey={dataViewerStateKey}
          onDbTypeChange={setDbType}
        />
      ) : diagramTab === 'query' && isProductionDb && !isPublicView && sourceConnectionId && show?.id ? (
        <DataQueryView
          connectionId={sourceConnectionId}
          dbClientId={Number(show.id)}
          initialTable={queryInitialTable}
          openNonce={queryOpenNonce}
        />
      ) : (
        <ERDView
          key={isPublicView ? publicData?.id : activeDiagramId}
          isLoading={isERDItemLoading}
          nodes={nodes} edges={edges} setNodes={ctx.setNodes} setEdges={ctx.setEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          onMove={handleMove}
          addEntity={addEntity}
          onImportSQL={handleOpenImportModal}
          onAutoLayout={handleAutoLayout}
          handleExportSQL={handleWorkspaceExportSQL}
          handleExportImage={handleWorkspaceExportImage}
          isReadOnly={effectiveReadOnly}
          isDbClient={isProductionDb}
          sourceConnectionId={sourceConnectionId}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          takeSnapshot={takeSnapshot}
          selectedNodeId={selectedNodeId}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
          initialViewport={viewportRef.current}
          saveDiagram={saveDiagram}
          triggerDebouncedSync={triggerDebouncedSync}
          pendingErdDiffTrigger={pendingErdDiffTrigger}
          extractColumnIdFromHandle={extractColumnIdFromHandle}
          getRelationKey={getRelationKey}
          dedupeEdgesByRelation={dedupeEdgesByRelation}
        />
      )}
    </div>
  );
}
