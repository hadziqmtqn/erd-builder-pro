import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams, useSearchParams } from 'react-router-dom';
import { Database, Columns, TableIcon } from 'lucide-react';
import { autoLayoutERD } from '@/lib/autoLayoutERD';

import { ERDView } from '@/components/views/ERDView';
import { DataViewer } from '@/components/db-connect/DataViewer';
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

  // Tab state for production DB diagrams — URL-driven so AppLayout can detect
  const [searchParams, setSearchParams] = useSearchParams();
  const diagramTab = searchParams.get('tab') || 'erd';

  const setDiagramTab = useCallback((tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'erd') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

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

  // Read snake_case fields from API response (camelToSnake middleware converts all)
  const isProductionDb = useMemo(() => {
    const show = isPublicView ? publicData : activeDiagram;
    return !isPublicView && show?.source_type === 'production_db';
  }, [isPublicView, publicData, activeDiagram]);

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
      {/* Tab bar — only for production DB diagrams */}
      {isProductionDb && !isPublicView && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/5 shrink-0">
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
        </div>
      )}

      {/* Content */}
      {diagramTab === 'data' && isProductionDb && !isPublicView && sourceConnectionId ? (
        <DataViewer connectionId={sourceConnectionId} />
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
