import { useEffect, useRef, useCallback } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';
import { Database } from 'lucide-react';
import { autoLayoutERD } from '@/lib/autoLayoutERD';

import { ERDView } from '@/components/views/ERDView';

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
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading diagram...</p>
      </div>
    );
  }

  return (
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
        isReadOnly={isPublicView}
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
  );
}
