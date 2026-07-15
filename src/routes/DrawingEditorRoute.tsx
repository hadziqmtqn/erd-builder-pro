import React, { Suspense, useEffect, useRef } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';
import { Image } from 'lucide-react';
import { ProjectFileTabs } from '@/components/ProjectFileTabs';

const DrawingsView = React.lazy(() => import('@/components/views/DrawingsView').then(m => ({ default: m.DrawingsView })));

export function DrawingEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    activeDrawing, activeDrawingId, saveDrawing, handleDrawingChange, deleteDrawing,
    isPublicView, isLoading, isDrawingItemLoading, handleDrawingSelect,
  } = ctx;

  // Safety net: URL has id but context hasn't synced yet
  const processedUrlRef = useRef(false);
  useEffect(() => {
    if (isPublicView || !id) return;
    if (processedUrlRef.current) return;
    if (String(activeDrawingId) === id) {
      processedUrlRef.current = true;
      return;
    }
    if (!activeDrawingId) {
      processedUrlRef.current = true;
      handleDrawingSelect(id);
    }
  }, [id, activeDrawingId, isPublicView, handleDrawingSelect]);

  if (!isPublicView && !activeDrawingId) {
    if (id && !processedUrlRef.current) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading drawing...</p>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <p className="text-sm font-medium text-muted-foreground">Select a drawing to view</p>
      </div>
    );
  }

  if (!activeDrawing && !isDrawingItemLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <Image className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Drawing not found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This drawing may have been deleted or is no longer available.</p>
      </div>
    );
  }

  if (!activeDrawing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading drawing...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ProjectFileTabs currentView="drawings" />
      <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60 animate-pulse">Loading drawing...</span>
        </div>
      </div>
    }>
      <DrawingsView
        isLoading={isDrawingItemLoading}
        activeDrawingId={isPublicView ? null : activeDrawingId}
        activeDrawing={activeDrawing}
        saveDrawing={saveDrawing}
        handleDrawingChange={handleDrawingChange}
        deleteDrawing={deleteDrawing}
        isReadOnly={isPublicView}
      />
    </Suspense>
    </div>
  );
}
