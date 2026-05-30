import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

// Components
import { AppSidebar } from '@/components/app-sidebar';
import { MainHeader } from '@/components/MainHeader';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { MoveToTrashAlert } from '@/components/modals/MoveToTrashAlert';
import { DeleteEntityAlert } from '@/components/modals/DeleteEntityAlert';
import { RenameDocumentDialog } from '@/components/modals/RenameDocumentDialog';
import { DuplicateDocumentDialog } from '@/components/modals/DuplicateDocumentDialog';
import { TablePropertiesModal } from '@/components/modals/TablePropertiesModal';
import { RelationshipPropertiesModal } from '@/components/modals/RelationshipPropertiesModal';
import { ImportNoteModal } from '@/components/modals/ImportNoteModal';
import { ExportNoteModal } from '@/components/modals/ExportNoteModal';
import { NoteExporter } from '@/lib/exporters/note-exporter';
import { getMarkdownFromHtml } from '@/lib/markdownUtils';
import { buildEntityContextText } from '@/hooks/aiEntityContext';
import { initialNodes as flowchartInitialNodes, initialEdges as flowchartInitialEdges } from '@/components/flowchart/flowchartConstants';
import { OfflineOverlay } from '@/components/layout/OfflineOverlay';

// UI
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';

import { useWorkspace } from '@/providers/WorkspaceProvider';
import { AIActionProvider, useAIAction } from '@/contexts/AIActionContext';
import { AIChatPanel } from '@/components/ai/AIChatPanel';
import { AIChatToggle } from '@/components/ai/AIChatToggle';

// ── Inner component that uses AIAction context ──

function AppLayoutInner() {
  const location = useLocation();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { isAIOpen, setAIOpen, pendingPrompt, clearPrompt, pendingAction, clearPendingAction } = useAIAction();

  // ─── Derive AI entity context from current route ─────
  const entityContext = useMemo(() => {
    const m = location.pathname.match(/^\/(notes|diagrams|flowcharts|drawings)\/([^/]+)$/);
    if (!m) return null;
    const typeMap: Record<string, string> = {
      notes: 'note',
      diagrams: 'diagram',
      flowcharts: 'flowchart',
      drawings: 'drawing',
    };
    return { entityType: typeMap[m[1]], entityUid: m[2] };
  }, [location.pathname]);

  const {
    view, sidebarView,
    isPublicView, isOnline,
    projects, searchQuery, setSearchQuery, user,
    isInstallable, installApp, isProjectsLoading,
    handleLogout,
    handleViewChange,
    handleNoteSelect, handleDrawingSelect, 
    handleSidebarProjectCreate, handleSidebarProjectUpdate, handleSidebarProjectDelete,
    handleWorkspaceFilter, selectedWorkspaceUid,
    handleHeaderDelete, handleHeaderRename, handleHeaderSettingsSaved,
    handleHeaderExportSQL, handleHeaderExportPDF, handleHeaderExportImage,
    handleExportMarkdown, handleCopyMarkdown, handleImportMarkdown,
    handleDuplicate,
    syncError, isSyncing, isLocalSaving, isRefreshing, hasPendingSyncs, syncDrafts,
    activeFileUid, currentActiveId, initialShareSettings,
    activeDocument, isGuest,
    featureLabel, activeProjectName, activeFileName, hasActiveItem,
    fileSearchRef, fileSearchQuery, setFileSearchQuery,
    activeNote, activeDrawing, activeFlowchart, activeDiagram,
    notes, diagrams, flowcharts, drawings,
    nodes, edges, setNodes, setEdges,
    activeDiagramId, takeSnapshot, saveDiagram,
    triggerDebouncedSync, broadcastMessage,
    setIsLocalSaving, viewportRef, lastLoadedDiagramIdRef,
    fetchTrash,
    triggerTableRefresh,
    setTableLoadingState,
    selectedNodeId, setSelectedNodeId, selectedEdgeId, setSelectedEdgeId,
    selectedEntity, deleteEntity, deleteEdge,
    updateDiagram, updateNote, updateDrawing, updateFlowchart,
    moveDiagramToProject, moveNoteToProject, moveDrawingToProject, moveFlowchartToProject,
    deleteDiagram, deleteNote, deleteDrawing, deleteFlowchart,
    handleEntityUpdate,
    handleSidebarDiagramCreate, handleSidebarNoteCreate, handleSidebarDrawingCreate, handleSidebarFlowchartCreate,
    isMoveToTrashAlertOpen, setIsMoveToTrashAlertOpen,
    isDeleteAlertOpen, setIsDeleteAlertOpen,
    isRenameDialogOpen, setIsRenameDialogOpen,
    isDuplicateDialogOpen, setIsDuplicateDialogOpen,
    isTablePropertiesOpen, setIsTablePropertiesOpen,
    isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen,
    isImportNoteModalOpen, setIsImportNoteModalOpen,
    isExportNoteModalOpen, setIsExportNoteModalOpen,
    newName, setNewName, renameProjectId, setRenameProjectId,
    duplicateName, setDuplicateName,
    itemToDelete, 
    createDialogOpen, setCreateDialogOpen,
    createDialogView, 
    editDialogNote, setEditDialogNote,
    tableDeleteDoc, setTableDeleteDoc,
    executeDuplicate, confirmPermanentDelete,
    handleEdgeUpdate: handleEdgeUpdate2,
    breadcrumbLabel,
  } = useWorkspace();

  // ─── Build entity context text from workspace data ───
  const entityContextText = useMemo(() => {
    const ctx = entityContext;
    if (!ctx) return null;

    switch (ctx.entityType) {
      case 'note':
        if (!activeNote) return null;
        return buildEntityContextText('note', {
          title: activeNote.title,
          content: getMarkdownFromHtml(String(activeNote.content || '')),
        });

      case 'diagram':
        if (!activeDiagram) return null;
        return buildEntityContextText('diagram', {
          title: activeDiagram.name,
          nodes: nodes as any[],
          edges: edges as any[],
        });

      case 'flowchart':
        if (!activeFlowchart) return null;
        let flowchartNodes: any[] = [];
        let flowchartEdges: any[] = [];
        try {
          const parsed = JSON.parse(activeFlowchart.data || '{}');
          flowchartNodes = (parsed.nodes && parsed.nodes.length > 0) ? parsed.nodes : flowchartInitialNodes;
          flowchartEdges = (parsed.edges && parsed.edges.length > 0) ? parsed.edges : flowchartInitialEdges;
        } catch {
          flowchartNodes = flowchartInitialNodes;
          flowchartEdges = flowchartInitialEdges;
        }
        return buildEntityContextText('flowchart', {
          title: activeFlowchart.title,
          nodes: flowchartNodes,
          edges: flowchartEdges,
        });

      case 'drawing':
        if (!activeDrawing) return null;
        return buildEntityContextText('drawing', {
          title: activeDrawing.title,
        });

      default:
        return null;
    }
  }, [entityContext, activeNote, activeDiagram, activeFlowchart, activeDrawing, nodes, edges]);

  const showAIChat = entityContext !== null && !isPublicView && entityContext.entityType !== 'drawing';

  // Derive project_id from the active entity — used to populate ai_chat_sessions.project_id
  const activeProjectId = useMemo<string | number | null>(() => {
    const ent = activeNote || activeDiagram || activeFlowchart || activeDrawing;
    return ent?.project_id ?? null;
  }, [activeNote, activeDiagram, activeFlowchart, activeDrawing]);

  // ── Update browser tab title ──
  useEffect(() => {
    document.title = activeFileName
      ? `${activeFileName} | ERD Builder Pro`
      : 'ERD Builder Pro';
  }, [activeFileName]);

  return (
    <>
      {!isOnline && !isPublicView && <OfflineOverlay />}

      {!isPublicView && (
        <AppSidebar
          view={sidebarView}
          projects={projects}
          onViewChange={handleViewChange}
          onNoteSelect={handleNoteSelect}
          onDrawingSelect={handleDrawingSelect}
          onProjectCreate={handleSidebarProjectCreate}
          onProjectUpdate={handleSidebarProjectUpdate}
          onProjectDelete={handleSidebarProjectDelete}
          onLogout={handleLogout}
          onWorkspaceFilter={handleWorkspaceFilter}
          selectedWorkspaceUid={selectedWorkspaceUid}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          user={user}
          isOnline={isOnline}
          isInstallable={isInstallable}
          onInstall={installApp}
          isProjectsLoading={isProjectsLoading}
          onOpenFeedback={() => setIsFeedbackOpen(true)}
        />
      )}

      <SidebarInset className={isPublicView ? "w-full" : ""}>
        <MainHeader
          featureLabel={featureLabel}
          activeProjectName={activeProjectName}
          activeFileName={activeFileName}
          view={view}
          hasActiveItem={isPublicView ? true : hasActiveItem}
          syncError={syncError}
          isSyncing={isSyncing}
          isLocalSaving={isLocalSaving}
          isRefreshing={isRefreshing}
          hasPendingSyncs={hasPendingSyncs}
          onSave={syncDrafts}
          activeFileUid={activeFileUid}
          activeFileId={currentActiveId}
          initialShareSettings={initialShareSettings}
          isPublicView={isPublicView}
          onSettingsSaved={handleHeaderSettingsSaved}
          isOnline={isOnline}
          updatedAt={activeDocument?.updated_at}
          onDelete={handleHeaderDelete}
          onRename={handleHeaderRename}
          onExportSQL={handleHeaderExportSQL}
          onExportPDF={handleHeaderExportPDF}
          onExportImage={handleHeaderExportImage}
          onExportMarkdown={handleExportMarkdown}
          onCopyMarkdown={handleCopyMarkdown}
          onImportMarkdown={handleImportMarkdown}
          onDuplicate={handleDuplicate}
          isGuest={isGuest}
          fileSearchRef={fileSearchRef}
          fileSearchQuery={fileSearchQuery}
          onFileSearchChange={setFileSearchQuery}
          hideFileSearch={location.pathname === '/'}
          breadcrumbLabel={breadcrumbLabel}
          noteContent={activeNote?.content}
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 overflow-hidden" style={{ isolation: 'isolate' } as React.CSSProperties}>
          <Outlet />
        </div>

        <ImportNoteModal
          isOpen={isImportNoteModalOpen}
          onClose={() => setIsImportNoteModalOpen(false)}
          onImport={() => {}}
        />

        <ExportNoteModal
          isOpen={isExportNoteModalOpen}
          onClose={() => setIsExportNoteModalOpen(false)}
          onExport={(format, options, pageSize) => {
            if (activeNote) {
              if (format === 'markdown') {
                // executeExportMarkdown
              } else if (format === 'pdf') {
                NoteExporter.exportToPDF(activeNote, options, pageSize);
              } else if (format === 'print') {
                NoteExporter.printNote(activeNote, options);
              } else if (format === 'word') {
                NoteExporter.exportToWord(activeNote, options);
              }
            }
          }}
        />

        <FeedbackDialog
          open={isFeedbackOpen}
          onOpenChange={setIsFeedbackOpen}
        />

        <MoveToTrashAlert
          isOpen={isPermanentDeleteConfirmOpen}
          onOpenChange={setIsPermanentDeleteConfirmOpen}
          mode="permanent-delete"
          itemType={itemToDelete?.type || ''}
          onConfirm={confirmPermanentDelete}
          onAfterDelete={undefined}
        />

        {!isPublicView && (
          <TablePropertiesModal
            isOpen={isTablePropertiesOpen && !!selectedNodeId}
            onOpenChange={setIsTablePropertiesOpen}
            selectedEntity={selectedEntity}
            handleEntityUpdate={handleEntityUpdate}
            deleteEntity={deleteEntity}
            setSelectedNodeId={setSelectedNodeId}
            setIsDeleteAlertOpen={setIsDeleteAlertOpen}
          />
        )}

        {!isPublicView && (
          <RenameDocumentDialog
            isOpen={isRenameDialogOpen}
            onOpenChange={(open) => { setIsRenameDialogOpen(open); if (!open) setEditDialogNote(null); }}
            view={view}
            activeDocument={editDialogNote ?? activeDocument}
            newName={newName}
            setNewName={setNewName}
            projects={projects}
            selectedProjectId={renameProjectId}
            setSelectedProjectId={setRenameProjectId}
            updateDiagram={updateDiagram}
            updateNote={updateNote}
            updateDrawing={updateDrawing}
            updateFlowchart={updateFlowchart}
            onMoveDiagramToProject={moveDiagramToProject}
            onMoveNoteToProject={moveNoteToProject}
            onMoveDrawingToProject={moveDrawingToProject}
            onMoveFlowchartToProject={moveFlowchartToProject}
            onRenameSuccess={undefined}
          />
        )}

        {!isPublicView && (
          <RenameDocumentDialog
            isOpen={createDialogOpen}
            onOpenChange={(open) => { setCreateDialogOpen(open); }}
            mode="create"
            view={createDialogView}
            activeDocument={null}
            newName={newName}
            setNewName={setNewName}
            projects={projects}
            selectedProjectId={renameProjectId}
            setSelectedProjectId={setRenameProjectId}
            onCreate={(title, projectId) => {
              const viewCb = createDialogView;
              if (viewCb === 'notes') handleSidebarNoteCreate(title, projectId);
              else if (viewCb === 'erd') handleSidebarDiagramCreate(title, projectId);
              else if (viewCb === 'drawings') handleSidebarDrawingCreate(title, projectId);
              else if (viewCb === 'flowchart') handleSidebarFlowchartCreate(title, projectId);
            }}
            onRenameSuccess={undefined}
          />
        )}

        <MoveToTrashAlert
          isOpen={isMoveToTrashAlertOpen}
          onOpenChange={(open) => { setIsMoveToTrashAlertOpen(open); if (!open) setTableDeleteDoc(null); }}
          activeDocument={tableDeleteDoc ?? activeDocument}
          view={view}
          deleteDiagram={deleteDiagram}
          deleteNote={deleteNote}
          deleteDrawing={deleteDrawing}
          deleteFlowchart={deleteFlowchart}
          fetchTrash={fetchTrash}
          onAfterDelete={async () => { setTableDeleteDoc(null); handleViewChange(view, true); setTableLoadingState('loading'); triggerTableRefresh(); }}
        />

        {!isPublicView && (
          <RelationshipPropertiesModal
            isOpen={!!selectedEdgeId}
            onOpenChange={(open) => { if (!open) setSelectedEdgeId(null); }}
            selectedEdge={edges.find(e => e.id === selectedEdgeId) || null}
            nodes={nodes}
            handleEdgeUpdate={handleEdgeUpdate2}
            deleteEdge={deleteEdge}
          />
        )}

        <DeleteEntityAlert
          isOpen={isDeleteAlertOpen}
          onOpenChange={setIsDeleteAlertOpen}
          selectedEntity={selectedEntity}
          deleteEntity={deleteEntity}
          setSelectedNodeId={setSelectedNodeId}
        />

        <DuplicateDocumentDialog
          isOpen={isDuplicateDialogOpen}
          onOpenChange={setIsDuplicateDialogOpen}
          view={view}
          duplicateName={duplicateName}
          setDuplicateName={setDuplicateName}
          executeDuplicate={executeDuplicate}
          isRefreshing={isRefreshing}
        />

        {/* AI Assistant — only on file feature pages */}
        {showAIChat && isAIOpen && (
          <AIChatPanel
            onClose={() => setAIOpen(false)}
            entityType={entityContext!.entityType}
            entityUid={entityContext!.entityUid}
            entityTitle={entityContext.entityType === 'note' ? activeNote?.title : 
                         entityContext.entityType === 'diagram' ? activeDiagram?.name : 
                         entityContext.entityType === 'flowchart' ? activeFlowchart?.title : null}
            entityContextText={entityContextText}
            projectId={activeProjectId}
            pendingPrompt={pendingPrompt}
            onPromptUsed={clearPrompt}
            pendingAction={pendingAction}
            onClearPendingAction={clearPendingAction}
            notes={notes}
            diagrams={diagrams}
            flowcharts={flowcharts}
            drawings={drawings}
            activeNoteContent={entityContext?.entityType === 'note' ? activeNote?.content : undefined}
          />
        )}
        {showAIChat && (
          <AIChatToggle
            isOpen={isAIOpen}
            onClick={() => setAIOpen(true)}
          />
        )}
      </SidebarInset>
    </>
  );
}

// ── Root layout: providers wrap inner content ──

export function AppLayout() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AIActionProvider>
        <AppLayoutInner />
      </AIActionProvider>
    </SidebarProvider>
  );
}

export default AppLayout;
