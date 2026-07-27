import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams, useSearchParams } from 'react-router-dom';
import { Database, Columns, PanelRightOpen, RefreshCw, TableIcon, TerminalSquare } from 'lucide-react';
import { autoLayoutERD } from '@/lib/autoLayoutERD';

import { ERDView } from '@/components/views/ERDView';
import { DataViewer } from '@/components/db-connect/DataViewer';
import { DataQueryView } from '@/components/db-connect/DataQueryView';
import { ProjectFileTabs } from '@/components/ProjectFileTabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function DiagramEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    nodes, edges, setNodes, isPublicView, publicData, activeDiagramId, activeDiagram,
    onNodesChange, onEdgesChange, onConnect,
    selectedNodeId, addEntity, undo, redo, canUndo, canRedo,
    takeSnapshot, onNodeDragStop, onMoveEnd,
    handleNodeClick, handleNodeDoubleClick, handleEdgeClick, handlePaneClick, handleMove,
    handleWorkspaceExportSQL, handleWorkspaceExportPDF, handleWorkspaceExportImage,
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

  // Read snake_case fields from API response (camelToSnake middleware converts all)
  const isProductionDb = useMemo(() => {
    const show = isPublicView ? publicData : activeDiagram;
    return !isPublicView && show?.source_type === 'production_db';
  }, [isPublicView, publicData, activeDiagram]);

  // Tab default: Data for production DB (browse records first), ERD for normal diagrams
  const diagramTab = searchParams.get('tab') || (isProductionDb ? 'data' : 'erd');

  const setDiagramTab = useCallback((tab: string) => {
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
  }, [nodes, edges, setNodes, takeSnapshot]);
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

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ProjectFileTabs currentView="erd" />
      {/* Tab bar — only for production DB diagrams */}
      {isProductionDb && !isPublicView && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b bg-muted/5 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDiagramTab('data')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                diagramTab === 'data'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Data
            </button>
            <button
              onClick={() => setDiagramTab('erd')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                diagramTab === 'erd'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <Columns className="w-3.5 h-3.5" />
              ERD
            </button>
            <button
              onClick={() => setDiagramTab('query')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                diagramTab === 'query'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <TerminalSquare className="w-3.5 h-3.5" />
              Query
            </button>
          </div>
          {diagramTab === 'data' && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => window.dispatchEvent(new Event('db-connect-refresh-records'))} title="Refresh records">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => window.dispatchEvent(new Event('db-connect-toggle-details'))} title="Open table information">
                <PanelRightOpen className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {diagramTab === 'data' && isProductionDb && !isPublicView && sourceConnectionId ? (
        <DataViewer
          connectionId={sourceConnectionId}
          stateKey={`${show?.uid || show?.id}:${sourceConnectionId}`}
        />
      ) : diagramTab === 'query' && isProductionDb && !isPublicView && sourceConnectionId && show?.id ? (
        <DataQueryView
          connectionId={sourceConnectionId}
          diagramId={Number(show.id)}
          initialTable={queryInitialTable}
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
          handleExportPDF={handleWorkspaceExportPDF}
          handleExportImage={handleWorkspaceExportImage}
          isReadOnly={effectiveReadOnly}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          takeSnapshot={takeSnapshot}
          selectedNodeId={selectedNodeId}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
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
