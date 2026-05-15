import React, { Suspense } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';

const DrawingsView = React.lazy(() => import('@/components/views/DrawingsView').then(m => ({ default: m.DrawingsView })));

export function DrawingEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    activeDrawing, activeDrawingId, saveDrawing, handleDrawingChange, deleteDrawing,
    isPublicView, isLoading,
  } = ctx;

  if (!isPublicView && !activeDrawingId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <p className="text-sm font-medium text-muted-foreground">Select a drawing to view</p>
      </div>
    );
  }

  if (!activeDrawing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading drawing...</p>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60 animate-pulse">Loading drawing...</span>
        </div>
      </div>
    }>
      <DrawingsView
        isLoading={isLoading}
        activeDrawingId={isPublicView ? null : activeDrawingId}
        activeDrawing={activeDrawing}
        saveDrawing={saveDrawing}
        handleDrawingChange={handleDrawingChange}
        deleteDrawing={deleteDrawing}
        isReadOnly={isPublicView}
      />
    </Suspense>
  );
}
