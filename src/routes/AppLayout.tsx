import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
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

/** Replace parser-generated column UUID inside handle string with canvas column UUID.
 *  parseSQLToERD's column IDs are "col-xxx", so handles are "col-col-xxx-source".
 *  Strip the extra prefix, remap, then rebuild. */
function remapHandle(handle: string | null | undefined, colIdMap: Map<string, string>): string | null | undefined {
  if (!handle) return handle;
  const m = handle.match(/^(col-)+(col-[\w-]+)-(source|target)(-[lr])?$/);
  if (m) {
    const colId = m[2];
    const suffix = m[3] + (m[4] || '');
    const mapped = colIdMap.get(colId);
    return mapped ? `col-${mapped}-${suffix}` : handle;
  }
  return handle;
}

/** Remap column ID in handle string: "col-xxx-source" → "col-yyy-source" */
function remapCol(handle: string | null | undefined, colMap: Map<string, string>): string | null | undefined {
  if (!handle) return handle;
  return handle.replace(/^(col-)([\w-]+)(-source|-target)(-[lr])?$/, (_, pre, id, suffix, lr) => {
    const mapped = colMap.get(id);
    return mapped ? `${pre}${mapped}${suffix}${lr || ''}` : _;
  });
}

import { AIActionProvider, useAIAction } from '@/contexts/AIActionContext';
import { RightChatSidebar } from '@/components/ai/RightChatSidebar';
import { AIChatPanel } from '@/components/ai/AIChatPanel';
import { DBMLEditorPanel } from '@/components/diagram/DBMLEditorPanel';
import { dbmlToERD, erdToDBML } from '@/lib/dbml-converter';
import { AIChatToggle } from '@/components/ai/AIChatToggle';

// ── Inner component that uses AIAction context ──

function isValidDBMLSource(content: string): boolean {
  if (!content.trim()) return false;
  try {
    dbmlToERD(content);
    return true;
  } catch {
    return false;
  }
}

function AppLayoutInner() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isExportAllOpen, setIsExportAllOpen] = useState(false);
  const [dbmlContent, setDbmlContent] = useState('');
  const dbmlContentRef = useRef('');
  const dbmlDraftDirtyRef = useRef(false);
  const dbmlSourceKeyRef = useRef<string | null>(null);
  const dbmlPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { rightPanelMode, setRightPanelMode, pendingPrompt, clearPrompt, pendingAction, clearPendingAction } = useAIAction();

  const setLocalDbmlContent = useCallback((content: string) => {
    dbmlContentRef.current = content;
    setDbmlContent(content);
  }, []);

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
  const isActiveDiagramContext = entityContext?.entityType === 'diagram';

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
    handleHeaderExportSQL, handleHeaderExportImage,
    handleOpenImportModal, isImportModalOpen, setIsImportModalOpen,
    handleExportMarkdown, handleCopyMarkdown, handleImportMarkdown, executeImportMarkdown,
    handleDuplicate,
    syncError, isSyncing, isLocalSaving, isRefreshing, hasPendingSyncs, syncDrafts,
    activeFileUid, currentActiveId, initialShareSettings,
    activeDocument, isGuest,
    featureLabel, activeProjectName, activeFileName, hasActiveItem,
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

  // Use the URL UUID rather than activeDiagramId. The workspace can briefly
  // switch that ID from a numeric value to a UUID while loading; using it as
  // the key caused a later effect to read an empty key and erase DBML that had
  // just been generated.
  const dbmlStorageKey = entityContext?.entityType === 'diagram'
    ? `erd-builder-dbml:${entityContext.entityUid}`
    : null;

  const activeDiagramDbmlSource = activeDiagram?.dbml_source ?? activeDiagram?.dbmlSource ?? '';

  // Read the persisted DBML source from the diagram first. Fall back to the
  // legacy browser cache once so older users keep standalone DBML constructs.
  useEffect(() => {
    const keyChanged = dbmlSourceKeyRef.current !== dbmlStorageKey;
    if (keyChanged) {
      dbmlSourceKeyRef.current = dbmlStorageKey;
      dbmlDraftDirtyRef.current = false;
    }

    if (!dbmlStorageKey) {
      setLocalDbmlContent('');
      return;
    }

    if (activeDiagramDbmlSource) {
      if (keyChanged || !dbmlDraftDirtyRef.current || !dbmlContentRef.current.trim()) {
        setLocalDbmlContent(activeDiagramDbmlSource);
      }
      return;
    }

    if (!keyChanged && dbmlDraftDirtyRef.current) return;

    try {
      const legacyDbml = localStorage.getItem(dbmlStorageKey) || '';
      setLocalDbmlContent(legacyDbml);
      if (legacyDbml.trim()) {
        dbmlPersistTimerRef.current && clearTimeout(dbmlPersistTimerRef.current);
        dbmlPersistTimerRef.current = setTimeout(async () => {
          if (!isValidDBMLSource(legacyDbml)) return;
          await saveDiagram(nodes, edges, viewportRef?.current || { x: 0, y: 0, zoom: 1 }, { dbmlSource: legacyDbml });
          if (!isGuest) triggerDebouncedSync();
        }, 300);
      }
    } catch {
      setLocalDbmlContent('');
    }
  }, [dbmlStorageKey, activeDiagramDbmlSource, saveDiagram, viewportRef, isGuest, triggerDebouncedSync, setLocalDbmlContent]);

  const handleDBMLContentChange = useCallback((content: string, persistNow = false) => {
    setLocalDbmlContent(content);
    dbmlDraftDirtyRef.current = !persistNow;
    dbmlPersistTimerRef.current && clearTimeout(dbmlPersistTimerRef.current);

    const persist = async () => {
      if (!isValidDBMLSource(content)) return;
      await saveDiagram(nodes, edges, viewportRef?.current || { x: 0, y: 0, zoom: 1 }, { dbmlSource: content });
      if (dbmlContentRef.current === content) dbmlDraftDirtyRef.current = false;
      if (!isGuest) triggerDebouncedSync();
    };

    if (persistNow) {
      void persist();
      return;
    }

    dbmlPersistTimerRef.current = setTimeout(() => { void persist(); }, 800);
  }, [saveDiagram, nodes, edges, viewportRef, isGuest, triggerDebouncedSync, setLocalDbmlContent]);

  useEffect(() => () => {
    if (dbmlPersistTimerRef.current) clearTimeout(dbmlPersistTimerRef.current);
  }, []);

  const openDBMLPanel = useCallback(() => {
    if ((activeDiagram?.source_type ?? activeDiagram?.sourceType) === 'production_db') return;
    if (!isActiveDiagramContext) return;
    setRightPanelMode('dbml');
    if (dbmlContent.trim() || nodes.length === 0) return;
    try {
      const dbml = erdToDBML(nodes, edges);
      if (dbml.trim()) handleDBMLContentChange(dbml, true);
    } catch {
      // The panel still opens; the regular sync effect will retry after canvas settles.
    }
  }, [activeDiagram, isActiveDiagramContext, setRightPanelMode, dbmlContent, nodes, edges, handleDBMLContentChange]);

  // ── Generate DBML from canvas on the first panel open. Keep the source text
  // while switching panels: it contains DBML-only constructs (Enum, Note and
  // TableGroup) which the canvas does not model completely.
  useEffect(() => {
    if (rightPanelMode === 'dbml' && isActiveDiagramContext && nodes.length > 0 && !dbmlContent.trim()) {
      try {
        const dbml = erdToDBML(nodes, edges);
        if (dbml.trim()) handleDBMLContentChange(dbml, true);
      } catch { /* ignore conversion errors */ }
    }
  }, [rightPanelMode, isActiveDiagramContext, nodes, edges, dbmlContent, handleDBMLContentChange]);

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
    const isProductionDb = isActiveDiagramContext && (activeDiagram?.source_type ?? activeDiagram?.sourceType) === 'production_db';
    const resolvedTab = searchParams.get('tab') || (isProductionDb ? 'data' : 'erd');
    return resolvedTab === 'erd';
  }, [entityContext, isPublicView, activeDiagram, searchParams]);
  const showDBMLPanel = isActiveDiagramContext && (activeDiagram?.source_type ?? activeDiagram?.sourceType) !== 'production_db';

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

  // ── DBML → ERD callback ──
  const handleDBMLApply = useCallback((newNodes: Node<Entity>[], newEdges: Edge[], source: string) => {
    const nodeIdMap = new Map<string, string>();
    // Deep clone edges so we can mutate handles for column remapping
    const clonedEdges = newEdges.map(e => ({ ...e }));
    const mergedNodes = newNodes.map(n => {
      const existing = nodes.find(cur => cur.data.name === n.data.name);
      if (existing) {
        nodeIdMap.set(n.id, existing.id);
        // Remap parser column IDs → canvas column IDs by name match
        const colMap = new Map<string, string>();
        n.data.columns = n.data.columns.map(nc => {
          const ec = existing.data.columns.find(c => c.name === nc.name);
          if (ec) {
            colMap.set(nc.id, ec.id);
            // Preserve enum_values and ENUM type from canvas
            // (parser loses enum_values during DBML→SQL→ERD roundtrip)
            return { ...nc, id: ec.id,
              enum_name: nc.enum_name || ec.enum_name,
              enum_values: nc.enum_values || ec.enum_values,
              comment: nc.comment || ec.comment,
              max_length: nc.max_length ?? ec.max_length,
              numeric_precision: nc.numeric_precision ?? ec.numeric_precision,
              numeric_scale: nc.numeric_scale ?? ec.numeric_scale,
              type: (ec.type.toUpperCase() === 'ENUM' && ec.enum_values && nc.type.toUpperCase() !== 'ENUM')
                ? ec.type : nc.type };
          }
          return nc;
        });
        // Remap edge handles to use canvas column IDs
        for (const e of clonedEdges) {
          if (e.source === n.id) e.sourceHandle = remapCol(e.sourceHandle, colMap);
          if (e.target === n.id) e.targetHandle = remapCol(e.targetHandle, colMap);
        }
        return { ...n, id: existing.id, position: existing.position,
          data: { ...n.data, id: existing.data.id, x: existing.data.x, y: existing.data.y,
            color: existing.data.color, collapsed: existing.data.collapsed,
            hidden_columns: existing.data.hidden_columns, note: existing.data.note } };
      }
      // New table: column IDs are already UUIDs from parser — pass through
      return n;
    });

    // Remap edge node IDs + compute position-based handles
    const mergedEdges = clonedEdges.map(e => {
      const srcId = nodeIdMap.get(e.source) || e.source;
      const tgtId = nodeIdMap.get(e.target) || e.target;
      const srcNode = mergedNodes.find(n => n.id === srcId);
      const tgtNode = mergedNodes.find(n => n.id === tgtId);
      const sx = srcNode?.position.x ?? 0;
      const tx = tgtNode?.position.x ?? 0;
      const srcSuffix = sx < tx ? 'source' : 'source-l';
      const tgtSuffix = sx < tx ? 'target' : 'target-r';

      // Rebuild handles with correct position-based suffix
      const srcColId = e.sourceHandle?.replace(/^col-/, '').replace(/-(source|target)(-[lr])?$/, '') || '';
      const tgtColId = e.targetHandle?.replace(/^col-/, '').replace(/-(source|target)(-[lr])?$/, '') || '';

      return {
        ...e,
        source: srcId,
        target: tgtId,
        sourceHandle: srcColId ? `col-${srcColId}-${srcSuffix}` : undefined,
        targetHandle: tgtColId ? `col-${tgtColId}-${tgtSuffix}` : undefined,
      };
    });

    // Compare by table structure + column properties (parser generates new UUIDs)
    const nodesSame = mergedNodes.length === nodes.length &&
      mergedNodes.every((n, i) => {
        const cur = nodes[i];
        if (!cur || n.data.name !== cur.data.name) return false;
        if (n.data.columns.length !== cur.data.columns.length) return false;
        return n.data.columns.every((c, j) => {
          const cc = cur.data.columns[j];
          return c.name === cc?.name && c.type === cc?.type &&
            c.is_pk === cc?.is_pk && c.is_nullable === cc?.is_nullable &&
            c.comment === cc?.comment && c.max_length === cc?.max_length &&
            c.numeric_precision === cc?.numeric_precision && c.numeric_scale === cc?.numeric_scale;
        });
      });
    // Compare edges by sorted canonical keys (table names, not UUIDs)
    const edgeKey = (e: Edge, nodeList: Node<Entity>[]) => {
      const s = nodeList.find(n => n.id === e.source)?.data.name || '';
      const t = nodeList.find(n => n.id === e.target)?.data.name || '';
      return `${s}>${t}`;
    };
    const sortedNew = [...mergedEdges].sort((a, b) => edgeKey(a, mergedNodes).localeCompare(edgeKey(b, mergedNodes)));
    const sortedCur = [...edges].sort((a, b) => edgeKey(a, nodes).localeCompare(edgeKey(b, nodes)));
    const edgesSame = sortedNew.length === sortedCur.length &&
      sortedNew.every((e, i) => edgeKey(e, mergedNodes) === edgeKey(sortedCur[i], nodes));

    takeSnapshot?.(nodes, edges);
    setNodes(mergedNodes);
    setEdges(mergedEdges);
    // Always update React state (fixes handles/IDs), but only save if data changed
    if (!nodesSame || !edgesSame) {
      saveDiagram?.(mergedNodes, mergedEdges, viewportRef?.current, { dbmlSource: source })
        ?.then(() => triggerDebouncedSync?.());
    }
  }, [nodes, edges, setNodes, setEdges, takeSnapshot, saveDiagram, viewportRef, triggerDebouncedSync]);

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

  // DBML is part of ERD Builder only. If the user navigates from an ERD to
  // Notes/Flowchart while the DBML tab is active, keep the panel usable by
  // falling back to chat instead of showing a DBML tab for the wrong feature.
  useEffect(() => {
    if (rightPanelMode === 'dbml' && !showDBMLPanel) {
      setRightPanelMode(showAIChat ? 'chat' : 'closed');
    }
  }, [rightPanelMode, showDBMLPanel, showAIChat, setRightPanelMode]);

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
          onExportImage={handleHeaderExportImage}
          onExportMarkdown={handleExportMarkdown}
          onCopyMarkdown={handleCopyMarkdown}
          onImportMarkdown={handleImportMarkdown}
          onDuplicate={handleDuplicate}
          isGuest={isGuest}
          breadcrumbLabel={breadcrumbLabel}
          noteContent={activeNote?.content}
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-4 min-h-0 overflow-hidden" style={{ isolation: 'isolate' } as React.CSSProperties}>
          <Outlet />
        </div>

        <ImportNoteModal
          isOpen={isImportNoteModalOpen}
          onClose={() => setIsImportNoteModalOpen(false)}
          onImport={executeImportMarkdown}
        />

        <ExportNoteModal
          isOpen={isExportNoteModalOpen}
          onClose={() => setIsExportNoteModalOpen(false)}
          onExport={(format, options, pageSize) => {
            if (activeNote) {
              if (format === 'markdown') {
                // executeExportMarkdown
              } else if (format === 'pdf') {
                NoteExporter.exportToPDF(activeNote, options, pageSize, activeProjectName || undefined);
              } else if (format === 'print') {
                NoteExporter.printNote(activeNote, options, activeProjectName || undefined);
              } else if (format === 'word') {
                NoteExporter.exportToWord(activeNote, options, activeProjectName || undefined);
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
                  {showDBMLPanel && (
                    <button
                      onClick={openDBMLPanel}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        rightPanelMode === 'dbml'
                          ? 'border-primary text-primary bg-background/50'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                      }`}
                    >
                      <Database className="size-3.5" />
                      DBML
                    </button>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="size-8 mr-1" onClick={() => setRightPanelMode('closed')} title="Close panel">
                  <PanelRightClose className="size-3.5" />
                </Button>
              </div>

              {/* ── Tab content ── */}
              <div className="flex-1 min-h-0">
                <div className={cn('h-full', rightPanelMode === 'dbml' && 'hidden')}>
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
                </div>
                {rightPanelMode === 'dbml' && showDBMLPanel && (
                  <DBMLEditorPanel
                    value={dbmlContent}
                    onChange={handleDBMLContentChange}
                    onApply={handleDBMLApply}
                    nodes={nodes}
                    edges={edges}
                    onSelectTable={(name) => {
                      const node = nodes.find(n => n.data.name.toLowerCase() === name.toLowerCase());
                      if (node) setSelectedNodeId(node.id);
                    }}
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
