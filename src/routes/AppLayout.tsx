import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sparkles, Database, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Components
import { AppSidebar } from '@/components/app-sidebar';
import { MainHeader } from '@/components/MainHeader';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { MoveToTrashAlert } from '@/components/modals/MoveToTrashAlert';
import { DeleteEntityAlert } from '@/components/modals/DeleteEntityAlert';
import { RenameDocumentDialog } from '@/components/modals/RenameDocumentDialog';
import { DuplicateDocumentDialog } from '@/components/modals/DuplicateDocumentDialog';
import { ExportAllDialog } from '@/components/modals/ExportAllDialog';
import { ImportSQLModal } from '@/components/modals/ImportSQLModal';
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
  useSidebar,
} from '@/components/ui/sidebar';

import { useWorkspace } from '@/providers/WorkspaceProvider';
import { AIActionProvider, useAIAction } from '@/contexts/AIActionContext';
import { RightChatSidebar } from '@/components/ai/RightChatSidebar';
import { AIChatPanel } from '@/components/ai/AIChatPanel';
import { DBMLEditorPanel } from '@/components/diagram/DBMLEditorPanel';
import { AIChatToggle } from '@/components/ai/AIChatToggle';

// ── Inner component that uses AIAction context ──

function AppLayoutInner() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isExportAllOpen, setIsExportAllOpen] = useState(false);
  const [dbmlContent, setDbmlContent] = useState('');
  const { rightPanelMode, setRightPanelMode, pendingPrompt, clearPrompt, pendingAction, clearPendingAction } = useAIAction();

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
    handleOpenImportModal, isImportModalOpen, setIsImportModalOpen,
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
    setIsSettingsOpen,
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
    handleEdgeFlip: handleEdgeFlip2,
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

  const showAIChat = useMemo(() => {
    if (entityContext === null || isPublicView || entityContext.entityType === 'drawing') return false;
    // Apply same default logic as DiagramEditorRoute: Data tab → hide AI Chat
    const isProductionDb = !isPublicView && activeDiagram?.source_type === 'production_db';
    const resolvedTab = searchParams.get('tab') || (isProductionDb ? 'data' : 'erd');
    return resolvedTab === 'erd';
  }, [entityContext, isPublicView, activeDiagram, searchParams]);

  // Derive project_id from the active entity — used to populate ai_chat_sessions.project_id
  const activeProjectId = useMemo<string | number | null>(() => {
    const ent = activeNote || activeDiagram || activeFlowchart || activeDrawing;
    return ent?.project_id ?? null;
  }, [activeNote, activeDiagram, activeFlowchart, activeDrawing]);

  // ── Persist Tauri window size/position (handled by tauri-plugin-window-state) ──

  // ── Update browser tab title (route-aware) ──
  useEffect(() => {
    const pageTitle = (() => {
      // If there's an active file open, always use its name
      if (activeFileName) return `${activeFileName} | ERD Builder Pro`;

      // Derive title from route
      const path = location.pathname;
      if (path === '/') return `Dashboard | ERD Builder Pro`;
      if (path === '/trash') return `Trash | ERD Builder Pro`;
      if (path.startsWith('/table/')) {
        const label = breadcrumbLabel || featureLabel || 'Tables';
        return `${label} | ERD Builder Pro`;
      }
      // Editor routes without a loaded file yet — show type label
      if (path.startsWith('/notes/')) return `Notes | ERD Builder Pro`;
      if (path.startsWith('/diagrams/')) return `Diagram | ERD Builder Pro`;
      if (path.startsWith('/flowcharts/')) return `Flowchart | ERD Builder Pro`;
      if (path.startsWith('/drawings/')) return `Drawing | ERD Builder Pro`;

      // 404 / unknown routes
      return `ERD Builder Pro`;
    })();
    document.title = pageTitle;
  }, [activeFileName, featureLabel, breadcrumbLabel, location.pathname]);

  // ── Desktop-only keyboard shortcut: CMD+, (macOS) / CTRL+, (Win/Linux) → open Settings
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
    if (!isTauri) return;

    const handleKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const accel = isMac ? e.metaKey : e.ctrlKey;
      if (accel && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [setIsSettingsOpen]);

  const rightPanelOpen = rightPanelMode !== 'closed';

  // ── Collapse left sidebar when right panel opens ──
  const { setOpen: setLeftSidebarOpen, open: leftSidebarOpen } = useSidebar();
  const prevLeftOpenRef = useRef(leftSidebarOpen);
  useEffect(() => {
    if (rightPanelOpen) {
      prevLeftOpenRef.current = leftSidebarOpen;
      setLeftSidebarOpen(false);
    } else if (prevLeftOpenRef.current) {
      // Restore sidebar only if it was open before panel opened
      setLeftSidebarOpen(true);
    }
  }, [rightPanelOpen]);

  // ── Auto-close right panel when leaving file pages ──
  useEffect(() => {
    if (!showAIChat) {
      setRightPanelMode('closed');
    }
  }, [showAIChat, setRightPanelMode]);

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

      <SidebarInset className={cn(
        isPublicView ? "w-full" : "",
        rightPanelOpen && "mr-90 transition-[margin] duration-200"
      )}>
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
           onExportAll={() => setIsExportAllOpen(true)}
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

        <div className="flex flex-1 flex-col gap-4 p-4 pt-4 min-h-0 overflow-hidden" style={{ isolation: 'isolate' } as React.CSSProperties}>
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
            handleEdgeFlip={handleEdgeFlip2}
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

        {view === 'erd' && (
          <>
            <ExportAllDialog
              open={isExportAllOpen}
              onOpenChange={setIsExportAllOpen}
              nodes={nodes}
              edges={edges}
              fileName={activeFileName || 'Untitled'}
              onExportPDF={handleHeaderExportPDF}
              onExportImage={handleHeaderExportImage}
            />
            <ImportSQLModal
              isOpen={isImportModalOpen}
              onOpenChange={setIsImportModalOpen}
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              activeDiagramId={activeDiagramId}
              takeSnapshot={takeSnapshot}
              saveDiagram={saveDiagram}
              triggerDebouncedSync={triggerDebouncedSync}
              broadcastMessage={broadcastMessage}
              setIsLocalSaving={setIsLocalSaving}
              viewportRef={viewportRef}
              lastLoadedDiagramIdRef={lastLoadedDiagramIdRef}
            />
          </>
        )}

        {/* Right panel with tabs — sticky right sidebar */}
        {showAIChat && rightPanelOpen && (
          <RightChatSidebar>
            <div className="h-full flex flex-col">
              {/* ── Tab bar ── */}
              <div className="shrink-0 flex items-center border-b border-border bg-muted/20">
                <div className="flex-1 flex">
                  <button
                    onClick={() => setRightPanelMode('chat')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      rightPanelMode === 'chat'
                        ? 'border-primary text-primary bg-background/50'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }`}
                  >
                    <Sparkles className="size-3.5" />
                    AI Chat
                  </button>
                  <button
                    onClick={() => setRightPanelMode('dbml')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      rightPanelMode === 'dbml'
                        ? 'border-primary text-primary bg-background/50'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }`}
                  >
                    <Database className="size-3.5" />
                    DBML
                  </button>
                </div>
                <Button variant="ghost" size="icon" className="size-8 mr-1" onClick={() => setRightPanelMode('closed')} title="Close panel">
                  <PanelRightClose className="size-3.5" />
                </Button>
              </div>

              {/* ── Tab content ── */}
              <div className="flex-1 min-h-0">
                {rightPanelMode === 'dbml' ? (
                  <DBMLEditorPanel
                    value={dbmlContent}
                    onChange={setDbmlContent}
                    onClose={() => setRightPanelMode('closed')}
                  />
                ) : (
                  <AIChatPanel
                    onClose={() => setRightPanelMode('closed')}
                    entityType={entityContext!.entityType}
                    entityUid={entityContext!.entityUid}
                    entityTitle={entityContext!.entityType === 'note' ? activeNote?.title : 
                                 entityContext!.entityType === 'diagram' ? activeDiagram?.name : 
                                 entityContext!.entityType === 'flowchart' ? activeFlowchart?.title : null}
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
              </div>
            </div>
          </RightChatSidebar>
        )}

        {/* Floating toggle button — visible when right panel is closed */}
        {showAIChat && !rightPanelOpen && (
          <AIChatToggle
            isOpen={false}
            onClick={() => setRightPanelMode('chat')}
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
