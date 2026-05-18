import React, { Suspense } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';

const ERDView = React.lazy(() => import('@/components/views/ERDView').then(m => ({ default: m.ERDView })));
const ERDImportModal = React.lazy(() => import('@/components/modals/ERDImportModal').then(m => ({ default: m.ERDImportModal })));

export function DiagramEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    nodes, edges, isPublicView, publicData, activeDiagramId, activeDiagram,
    onNodesChange, onEdgesChange, onConnect,
    selectedNodeId, addEntity, undo, redo, canUndo, canRedo,
    takeSnapshot, onNodeDragStop, onMoveEnd,
    handleNodeClick, handleNodeDoubleClick, handleEdgeClick, handlePaneClick, handleMove,
    handleOpenImportModal, handleWorkspaceExportSQL, handleWorkspaceExportPDF, handleWorkspaceExportImage,
    isLoading, viewportRef, saveDiagram, triggerDebouncedSync, broadcastMessage,
    setIsLocalSaving, lastLoadedDiagramIdRef, setIsImportModalOpen, isImportModalOpen,
  } = ctx;

  if (!isPublicView && !activeDiagramId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <p className="text-sm font-medium text-muted-foreground">Select a diagram to view</p>
      </div>
    );
  }

  const showDiagram = isPublicView ? publicData : activeDiagram;

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
        openImportModal={handleOpenImportModal}
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
      {!isPublicView && (
        <ERDImportModal
          isOpen={isImportModalOpen}
          onOpenChange={setIsImportModalOpen}
          nodes={nodes}
          edges={edges}
          setNodes={ctx.setNodes}
          setEdges={ctx.setEdges}
          activeDiagramId={activeDiagramId}
          takeSnapshot={takeSnapshot}
          saveDiagram={saveDiagram}
          triggerDebouncedSync={triggerDebouncedSync}
          broadcastMessage={broadcastMessage}
          setIsLocalSaving={setIsLocalSaving}
          viewportRef={viewportRef}
          lastLoadedDiagramIdRef={lastLoadedDiagramIdRef}
        />
      )}
    </Suspense>
  );
}
