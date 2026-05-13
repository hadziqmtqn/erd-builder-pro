import React, { Suspense } from 'react';
import { Node, Edge, OnNodesChange, OnEdgesChange, OnConnect } from '@xyflow/react';
import { Entity } from '@/types';

// Lazy-loaded Views (heavy bundles — React Flow, Excalidraw, TipTap)
const ERDView = React.lazy(() => import('@/components/views/ERDView').then(m => ({ default: m.ERDView })));
const NotesView = React.lazy(() => import('@/components/views/NotesView').then(m => ({ default: m.NotesView })));
const DrawingsView = React.lazy(() => import('@/components/views/DrawingsView').then(m => ({ default: m.DrawingsView })));
const FlowchartView = React.lazy(() => import('@/components/views/FlowchartView').then(m => ({ default: m.FlowchartView })));
const ChangelogView = React.lazy(() => import('@/components/views/ChangelogView').then(m => ({ default: m.ChangelogView })));
const BackupsView = React.lazy(() => import('@/components/views/BackupsView').then(m => ({ default: m.BackupsView })));
const TrashView = React.lazy(() => import('@/components/views/TrashView').then(m => ({ default: m.TrashView })));

// Lightweight views — eager loaded
import { WelcomeView } from '@/components/views/WelcomeView';
import { NotesTableView } from '@/components/views/NotesTableView';
import { ErdTableView } from '@/components/views/ErdTableView';
import { DrawingsTableView } from '@/components/views/DrawingsTableView';
import { FlowchartTableView } from '@/components/views/FlowchartTableView';

// Modals used inside workspace
import { ERDImportModal } from '@/components/modals/ERDImportModal';

export interface WorkspaceContentProps {
  view: string;
  nodes: Node<Entity>[];
  edges: Edge[];
  activeDiagramId: any;
  isPublicView: boolean;
  publicData: any;
  isLoading: boolean;
  isReadOnly: boolean;
  hasActiveItem: boolean;
  activeDiagram: any;
  isNotesDocumentRoute?: boolean;
  isERDDocumentRoute?: boolean;
  isDrawingsDocumentRoute?: boolean;
  isFlowchartDocumentRoute?: boolean;

  // ERDView callbacks (stabilized by parent)
  onNodesChange: OnNodesChange<Node<Entity>>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  selectedNodeId: string | null;
  addEntity: () => void;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  takeSnapshot: (nodes: Node<Entity>[], edges: Edge[]) => void;
  onNodeDragStop?: () => void;
  onMoveEnd?: (e: any, v: any) => void;

  // Stabilized inline callbacks
  onNodeClick: (e: React.MouseEvent, n: Node) => void;
  onNodeDoubleClick: (e: React.MouseEvent, n: Node) => void;
  onEdgeClick: (e: any, edge: Edge) => void;
  onPaneClick: () => void;
  onMove: (e: any, v: any) => void;
  openImportModal: () => void;
  handleExportSQL: (dialect: 'postgresql' | 'mysql') => void;
  handleExportPDF: () => void;
  handleExportImage: () => void;

  // ERDImportModal
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node<Entity>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  saveDiagram: (nodes: Node<Entity>[], edges: Edge[], viewport: any) => Promise<void>;
  triggerDebouncedSync: () => void;
  broadcastMessage: (type: any, draftType: any, id: any) => void;
  setIsLocalSaving: (val: boolean) => void;
  viewportRef: { current: any };
  lastLoadedDiagramIdRef: { current: any };

  // Notes
  activeNote: any;
  activeNoteUid: any;
  saveNote: (note: any) => Promise<boolean>;
  handleNoteChange: (content: string) => void;
  deleteNote: (id: any) => Promise<void>;
  notes: any[];
  notesTotal: number;
  projects: any[];
  onNoteCreate: () => void;
  onNoteSelect: (uid: string) => void;
  selectedWorkspaceUid: string | null;
  tablePage: number;
  onTablePageChange?: (page: number) => void;
  onWorkspaceClick?: (uid: string | null) => void;
  onOpenEditDocument?: (uid: string) => void;
  onDeleteNote?: (uid: string) => void;

  // ERD
  diagrams: any[];
  diagramsTotal: number;
  onDiagramCreate: () => void;
  onDiagramSelect: (uid: string) => void;
  onDeleteDiagram: (uid: string) => void;

  // Flowcharts
  flowcharts: any[];
  flowchartsTotal: number;
  onFlowchartCreate: () => void;
  onFlowchartSelect: (uid: string) => void;
  onDeleteFlowchart: (uid: string) => void;

  // Drawings
  activeDrawing: any;
  activeDrawingId: any;
  drawings: any[];
  drawingsTotal: number;
  onDrawingCreate: () => void;
  onDrawingSelect: (uid: string) => void;
  onDeleteDrawing: (uid: string) => void;
  saveDrawing: (drawing: any) => Promise<boolean>;
  handleDrawingChange: (data: string) => void;
  deleteDrawing: (id: any) => Promise<void>;

  // Flowcharts
  activeFlowchart: any;
  activeFlowchartId: any;
  handleFlowchartChange: (nodes: any[], edges: any[]) => void;

  // Trash
  trashData: any;
  isTrashLoading: boolean;
  restoreProject: (id: any) => Promise<void>;
  restoreDiagram: (id: any) => Promise<void>;
  restoreNote: (id: any) => Promise<void>;
  restoreDrawing: (id: any) => Promise<void>;
  restoreFlowchart: (id: any) => Promise<void>;
  handleProjectPermanentDelete: (id: any) => void;
  handleDiagramPermanentDelete: (id: any) => void;
  handleNotePermanentDelete: (id: any) => void;
  handleDrawingPermanentDelete: (id: any) => void;
  handleFlowchartPermanentDelete: (id: any) => void;
  fetchTrash: () => Promise<void>;
}

/**
 * 🛡️ Workspace Content — isolated in React.memo to prevent re-render when
 * sync-related state (isSyncing, syncError, hasPendingSyncs, isRefreshing) changes in parent.
 */
export const WorkspaceContent = React.memo(function WorkspaceContent(props: WorkspaceContentProps) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 overflow-hidden" style={{ isolation: 'isolate' }}>
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground/60 animate-pulse">Loading...</span>
          </div>
        </div>
      }>
      {props.view === 'notes' && props.isNotesDocumentRoute && !props.activeNote ? (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading note...</p>
        </div>
      ) : props.view === 'erd' && props.isERDDocumentRoute && !props.activeDiagram ? (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading diagram...</p>
        </div>
      ) : props.view === 'flowchart' && props.isFlowchartDocumentRoute && !props.activeFlowchart ? (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading flowchart...</p>
        </div>
      ) : props.view === 'drawings' && props.isDrawingsDocumentRoute && !props.activeDrawing ? (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading drawing...</p>
        </div>
      ) : !props.hasActiveItem && props.view !== 'trash' && props.view !== 'changelog' && props.view !== 'backups' && !props.isPublicView ? (
        props.view === 'notes' ? (
          <NotesTableView
            notes={props.notes}
            projects={props.projects}
            selectedWorkspace={props.selectedWorkspaceUid}
            page={props.tablePage}
            totalNotes={props.notesTotal}
            isLoading={false}
            onSelectNote={props.onNoteSelect}
            onCreateNote={props.onNoteCreate}
            onPageChange={(p) => props.onTablePageChange?.(p)}
            onWorkspaceClick={(uid) => props.onWorkspaceClick?.(uid)}
            onOpenEditDocument={(uid) => props.onOpenEditDocument?.(uid)}
            onDeleteNote={(uid) => props.onDeleteNote?.(uid)}
          />
        ) : props.view === 'erd' ? (
          <ErdTableView
            diagrams={props.diagrams}
            projects={props.projects}
            selectedWorkspace={props.selectedWorkspaceUid}
            page={props.tablePage}
            totalDiagrams={props.diagramsTotal}
            isLoading={false}
            onSelectDiagram={props.onDiagramSelect}
            onCreateDiagram={props.onDiagramCreate}
            onPageChange={(p) => props.onTablePageChange?.(p)}
            onWorkspaceClick={(uid) => props.onWorkspaceClick?.(uid)}
            onOpenEditDocument={(uid) => props.onOpenEditDocument?.(uid)}
            onDeleteDiagram={props.onDeleteDiagram}
          />
        ) : props.view === 'flowchart' ? (
          <FlowchartTableView
            flowcharts={props.flowcharts}
            projects={props.projects}
            selectedWorkspace={props.selectedWorkspaceUid}
            page={props.tablePage}
            totalFlowcharts={props.flowchartsTotal}
            isLoading={false}
            onSelectFlowchart={props.onFlowchartSelect}
            onCreateFlowchart={props.onFlowchartCreate}
            onPageChange={(p) => props.onTablePageChange?.(p)}
            onWorkspaceClick={(uid) => props.onWorkspaceClick?.(uid)}
            onOpenEditDocument={(uid) => props.onOpenEditDocument?.(uid)}
            onDeleteFlowchart={props.onDeleteFlowchart}
          />
        ) : props.view === 'drawings' ? (
          <DrawingsTableView
            drawings={props.drawings}
            projects={props.projects}
            selectedWorkspace={props.selectedWorkspaceUid}
            page={props.tablePage}
            totalDrawings={props.drawingsTotal}
            isLoading={false}
            onSelectDrawing={props.onDrawingSelect}
            onCreateDrawing={props.onDrawingCreate}
            onPageChange={(p) => props.onTablePageChange?.(p)}
            onWorkspaceClick={(uid) => props.onWorkspaceClick?.(uid)}
            onOpenEditDocument={(uid) => props.onOpenEditDocument?.(uid)}
            onDeleteDrawing={props.onDeleteDrawing}
          />
        ) : (
          <WelcomeView />
        )
      ) : (
        <>
          {props.view === 'erd' && (props.isPublicView ? props.publicData : props.activeDiagramId) && (
            <ERDView 
              key={props.isPublicView ? props.publicData?.id : props.activeDiagramId}
              isLoading={props.isLoading}
              nodes={props.nodes} edges={props.edges} onNodesChange={props.onNodesChange} onEdgesChange={props.onEdgesChange} onConnect={props.onConnect}
              onNodeClick={props.onNodeClick}
              onNodeDoubleClick={props.onNodeDoubleClick}
              onEdgeClick={props.onEdgeClick}
              onPaneClick={props.onPaneClick}
              onMove={props.onMove}
              addEntity={props.addEntity}
              openImportModal={props.openImportModal}
              handleExportSQL={props.handleExportSQL}
              handleExportPDF={props.handleExportPDF}
              handleExportImage={props.handleExportImage}
              isReadOnly={props.isReadOnly}
              undo={props.undo}
              redo={props.redo}
              canUndo={props.canUndo}
              canRedo={props.canRedo}
              takeSnapshot={props.takeSnapshot}
              selectedNodeId={props.selectedNodeId}
              onNodeDragStop={props.onNodeDragStop}
              onMoveEnd={props.onMoveEnd}
            />
          )}
          {props.view === 'backups' && (
            <BackupsView />
          )}
          {props.view === 'erd' && (
            <ERDImportModal 
              isOpen={props.isImportModalOpen}
              onOpenChange={props.setIsImportModalOpen}
              nodes={props.nodes}
              edges={props.edges}
              setNodes={props.setNodes}
              setEdges={props.setEdges}
              activeDiagramId={props.activeDiagramId}
              takeSnapshot={props.takeSnapshot}
              saveDiagram={props.saveDiagram}
              triggerDebouncedSync={props.triggerDebouncedSync}
              broadcastMessage={props.broadcastMessage}
              setIsLocalSaving={props.setIsLocalSaving}
              viewportRef={props.viewportRef}
              lastLoadedDiagramIdRef={props.lastLoadedDiagramIdRef}
            />
          )}
          {props.view === 'notes' && props.activeNote && <NotesView isLoading={props.isLoading} activeNoteUid={props.isPublicView ? null : props.activeNoteUid} activeNote={props.activeNote} saveNote={props.saveNote} handleNoteChange={props.handleNoteChange} deleteNote={props.deleteNote} isReadOnly={props.isReadOnly} />}
          {props.view === 'drawings' && props.activeDrawing && <DrawingsView isLoading={props.isLoading} activeDrawingId={props.isPublicView ? null : props.activeDrawingId} activeDrawing={props.activeDrawing} saveDrawing={props.saveDrawing} handleDrawingChange={props.handleDrawingChange} deleteDrawing={props.deleteDrawing} isReadOnly={props.isReadOnly} />}
          {props.view === 'flowchart' && props.activeFlowchart && <FlowchartView isLoading={props.isLoading} activeFlowchartId={props.activeFlowchartId} activeFlowchart={props.activeFlowchart} handleFlowchartChange={props.handleFlowchartChange} isReadOnly={props.isReadOnly} />}
          {props.view === 'changelog' && <ChangelogView />}
        </>
      )}
      {props.view === 'trash' && (
        <TrashView 
          trashData={props.trashData} 
          restoreProject={props.restoreProject}
          restoreDiagram={props.restoreDiagram}
          restoreNote={props.restoreNote}
          restoreDrawing={props.restoreDrawing}
          restoreFlowchart={props.restoreFlowchart}
          fetchTrash={props.fetchTrash}
          handleProjectPermanentDelete={props.handleProjectPermanentDelete}
          handleDiagramPermanentDelete={props.handleDiagramPermanentDelete}
          handleNotePermanentDelete={props.handleNotePermanentDelete}
          handleDrawingPermanentDelete={props.handleDrawingPermanentDelete}
          handleFlowchartPermanentDelete={props.handleFlowchartPermanentDelete}
          isLoading={props.isTrashLoading}
        />
      )}
      </Suspense>
    </div>
  );
});
