import React from 'react';
import { useLocation } from 'react-router-dom';

const TrashView = React.lazy(() => import('@/components/views/TrashView').then(m => ({ default: m.TrashView })));

import { useWorkspace } from '@/providers/WorkspaceProvider';

export function AdminRoute() {
  const { pathname } = useLocation();

  if (pathname === '/trash') return <TrashRoute />;
  return null;
}

function TrashRoute() {
  const {
    trashData, isTrashLoading,
    handleTrashRestoreProject, handleTrashRestoreDiagram, handleTrashRestoreNote,
    handleTrashRestoreDrawing, handleTrashRestoreFlowchart,
    handleTrashRestoreDbClient,
    handleTrashProjectPermanentDelete, handleTrashDiagramPermanentDelete,
    handleTrashNotePermanentDelete, handleTrashDrawingPermanentDelete,
    handleTrashFlowchartPermanentDelete, fetchTrash,
    handleTrashDbClientPermanentDelete,
  } = useWorkspace();

  return (
    <React.Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60 animate-pulse">Loading trash...</span>
        </div>
      </div>
    }>
      <TrashView
        trashData={trashData}
        restoreProject={handleTrashRestoreProject}
        restoreDiagram={handleTrashRestoreDiagram}
        restoreNote={handleTrashRestoreNote}
        restoreDrawing={handleTrashRestoreDrawing}
        restoreFlowchart={handleTrashRestoreFlowchart}
        restoreDbClient={handleTrashRestoreDbClient}
        fetchTrash={fetchTrash}
        handleProjectPermanentDelete={handleTrashProjectPermanentDelete}
        handleDiagramPermanentDelete={handleTrashDiagramPermanentDelete}
        handleNotePermanentDelete={handleTrashNotePermanentDelete}
        handleDrawingPermanentDelete={handleTrashDrawingPermanentDelete}
        handleFlowchartPermanentDelete={handleTrashFlowchartPermanentDelete}
        handleDbClientPermanentDelete={handleTrashDbClientPermanentDelete}
        isLoading={isTrashLoading}
      />
    </React.Suspense>
  );
}
