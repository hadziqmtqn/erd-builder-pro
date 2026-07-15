import { useEffect, useRef } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';
import { GitBranch } from 'lucide-react';
import { ProjectFileTabs } from '@/components/ProjectFileTabs';

import { FlowchartView } from '@/components/views/FlowchartView';

export function FlowchartEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    activeFlowchart, activeFlowchartId, handleFlowchartChange,
    isPublicView, isLoading, isFlowchartItemLoading, handleFlowchartSelect,
    saveFlowchart, triggerDebouncedSync,
  } = ctx;

  // Safety net: URL has id but context hasn't synced yet
  const processedUrlRef = useRef(false);
  useEffect(() => {
    if (isPublicView || !id) return;
    if (processedUrlRef.current) return;
    if (String(activeFlowchartId) === id) {
      processedUrlRef.current = true;
      return;
    }
    if (!activeFlowchartId) {
      processedUrlRef.current = true;
      handleFlowchartSelect(id);
    }
  }, [id, activeFlowchartId, isPublicView, handleFlowchartSelect]);

  if (!isPublicView && !activeFlowchartId) {
    if (id && !processedUrlRef.current) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading flowchart...</p>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <p className="text-sm font-medium text-muted-foreground">Select a flowchart to view</p>
      </div>
    );
  }

  if (!activeFlowchart && !isFlowchartItemLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <GitBranch className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Flowchart not found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This flowchart may have been deleted or is no longer available.</p>
      </div>
    );
  }

  if (!activeFlowchart) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading flowchart...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ProjectFileTabs currentView="flowchart" />
      <FlowchartView
        isLoading={isFlowchartItemLoading}
        activeFlowchartId={activeFlowchartId}
        activeFlowchart={activeFlowchart}
        handleFlowchartChange={handleFlowchartChange}
        isReadOnly={isPublicView}
        saveFlowchart={saveFlowchart}
        triggerDebouncedSync={triggerDebouncedSync}
      />
    </div>
  );
}
