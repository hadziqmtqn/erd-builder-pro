import { useEffect, useMemo, useRef } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useOutletContext, useParams } from 'react-router-dom';
import { GitBranch } from 'lucide-react';
import { ProjectFileTabs } from '@/components/ProjectFileTabs';
import { FileCommentMarkersProvider, type FileCommentMarkerConfig } from '@/components/diagram/FileCommentMarkers';
import type { TeamsState } from '@/hooks/useTeams';

import { FlowchartView } from '@/components/views/FlowchartView';

export function FlowchartEditorRoute() {
  const ctx = useWorkspace();
  const teamState = useOutletContext<TeamsState>();
  const { id } = useParams<{ id: string }>();

  const {
    activeFlowchart, activeFlowchartId, handleFlowchartChange,
    isPublicView, isLoading, isFlowchartItemLoading, handleFlowchartSelect,
    saveFlowchart, triggerDebouncedSync,
  } = ctx;
  const flowchartProjectId = activeFlowchart?.project_id ?? activeFlowchart?.projectId;
  const flowchartFileId = activeFlowchart?.uid ?? activeFlowchartId;
  const flowchartProject = ctx.projects.find((project: any) => String(project.id) === String(flowchartProjectId));
  const flowchartProjectTeamId = flowchartProject?.team_id ?? flowchartProject?.teamId;
  const commentsEnabled = Boolean(!isPublicView && !ctx.isGuest && flowchartProjectTeamId && teamState.activeTeamId
    && String(flowchartProjectTeamId) === String(teamState.activeTeamId));
  const commentMarkers = useMemo<FileCommentMarkerConfig | null>(() => (
    commentsEnabled && flowchartProjectId != null && flowchartProjectTeamId && ctx.user?.id && flowchartFileId != null
      ? {
          projectId: String(flowchartProjectId),
          teamId: String(flowchartProjectTeamId),
          fileId: String(flowchartFileId),
          featureType: 'flowchart',
        }
      : null
  ), [commentsEnabled, ctx.user?.id, flowchartFileId, flowchartProjectId, flowchartProjectTeamId]);

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

  const flowchartView = (
    <FlowchartView
      isLoading={isFlowchartItemLoading}
      activeFlowchartId={activeFlowchartId}
      activeFlowchart={activeFlowchart}
      handleFlowchartChange={handleFlowchartChange}
      isReadOnly={isPublicView}
      commentsEnabled={commentsEnabled}
      saveFlowchart={saveFlowchart}
      triggerDebouncedSync={triggerDebouncedSync}
    />
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ProjectFileTabs currentView="flowchart" />
      {commentMarkers
        ? <FileCommentMarkersProvider key={[commentMarkers.projectId, commentMarkers.teamId, commentMarkers.featureType, commentMarkers.fileId].join(':')} config={commentMarkers}>{flowchartView}</FileCommentMarkersProvider>
        : flowchartView}
    </div>
  );
}
