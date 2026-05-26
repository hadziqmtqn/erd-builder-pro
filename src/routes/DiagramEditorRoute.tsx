import React, { Suspense, useEffect, useRef } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';
import { Database } from 'lucide-react';

const ERDView = React.lazy(() => import('@/components/views/ERDView').then(m => ({ default: m.ERDView })));

export function DiagramEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    nodes, edges, isPublicView, publicData, activeDiagramId, activeDiagram,
    onNodesChange, onEdgesChange, onConnect,
    selectedNodeId, addEntity, undo, redo, canUndo, canRedo,
    takeSnapshot, onNodeDragStop, onMoveEnd,
    handleNodeClick, handleNodeDoubleClick, handleEdgeClick, handlePaneClick, handleMove,
    handleWorkspaceExportSQL, handleWorkspaceExportPDF, handleWorkspaceExportImage,
    isLoading, viewportRef, saveDiagram, triggerDebouncedSync, broadcastMessage,
    setIsLocalSaving, lastLoadedDiagramIdRef,
    isERDItemLoading, handleDiagramSelect,
  } = ctx;

  // Safety net: URL has id but context hasn't synced yet
  const processedUrlRef = useRef(false);
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

  if (!isPublicView && !activeDiagramId) {
    if (id && !processedUrlRef.current) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
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

  const showDiagram = isPublicView ? publicData : activeDiagram;

  if (!showDiagram && !isPublicView && !isERDItemLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <Database className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Diagram not found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This diagram may have been deleted or is no longer available.</p>
      </div>
    );
  }

  if (!showDiagram && !isPublicView) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading diagram...</p>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60 animate-pulse">Loading diagram...</span>
        </div>
      </div>
    }>
      <ERDView
        key={isPublicView ? publicData?.id : activeDiagramId}
        isLoading={isLoading}
        nodes={nodes} edges={edges} setNodes={ctx.setNodes} setEdges={ctx.setEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onMove={handleMove}
        addEntity={addEntity}
        handleExportSQL={handleWorkspaceExportSQL}
        handleExportPDF={handleWorkspaceExportPDF}
        handleExportImage={handleWorkspaceExportImage}
        isReadOnly={isPublicView}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        takeSnapshot={takeSnapshot}
        selectedNodeId={selectedNodeId}
        onNodeDragStop={onNodeDragStop}
        onMoveEnd={onMoveEnd}
      />
    </Suspense>
  );
}
