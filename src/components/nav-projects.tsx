import * as React from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { Diagram, Project, Note, Drawing, Flowchart } from "../types"
import { Database, StickyNote, PenTool, Network } from "lucide-react"
import { toast } from "sonner"

// Refactored Components
import { SidebarModals } from "./sidebar/modals/SidebarModals"
import { ProjectGroup } from "./sidebar/sections/ProjectGroup"

export function NavProjects({
  projects,
  activeProjectId,
  onProjectSelect,
  onProjectDelete,
  onProjectUpdate,
  onProjectCreate,
  onDiagramCreate,
  onNoteCreate,
  onDrawingCreate,
  onFlowchartCreate,
  diagrams,
  notes,
  drawings,
  flowcharts,
  onDiagramSelect,
  onNoteSelect,
  onDrawingSelect,
  onFlowchartSelect,
  activeDiagramId,
  activeNoteUid,
  activeDrawingId,
  activeFlowchartId,
  view,
  sidebarView,
  onDiagramDelete,
  onNoteDelete,
  onDrawingDelete,
  onFlowchartDelete,
  onDiagramUpdate,
  onNoteUpdate,
  onDrawingUpdate,
  onFlowchartUpdate,
  onMoveDiagramToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  onMoveFlowchartToProject,
  allProjects,
  searchQuery,
  hasMoreProjects,
  hasMoreDiagrams,
  hasMoreNotes,
  hasMoreDrawings,
  hasMoreFlowcharts,
  onLoadMoreProjects,
  onLoadMoreDiagrams,
  onLoadMoreNotes,
  onLoadMoreDrawings,
  onLoadMoreFlowcharts,
  isOnline,
  isProjectsLoading,
  isDiagramsLoading,
  isNotesLoading,
  isDrawingsLoading,
  isFlowchartsLoading,
  uncategorized,
}: {
  projects: any[]
  activeProjectId: number | string | null
  onProjectSelect: (id: number | string | null) => void
  onProjectDelete: (id: number | string) => void
  onProjectUpdate: (id: number | string, name: string) => void
  onProjectCreate: (name: string) => void
  onDiagramCreate: (name: string, projectId: number | string | null) => void
  onNoteCreate: (title: string, projectId: number | string | null) => void
  onDrawingCreate: (title: string, projectId: number | string | null) => void
  onFlowchartCreate: (title: string, projectId: number | string | null) => void
  diagrams: Diagram[]
  notes: Note[]
  drawings: Drawing[]
  flowcharts: Flowchart[]
  onDiagramSelect: (id: number | string) => void
  onNoteSelect: (uid: string) => void
  onDrawingSelect: (uid: string) => void
  onFlowchartSelect: (uid: string) => void
  activeDiagramId: number | string | null
  activeNoteUid: string | null
  activeDrawingId: string | null
  activeFlowchartId: number | string | null
  view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog' | 'backups'
  sidebarView: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'changelog'
  onDiagramDelete: (id: number | string) => void
  onNoteDelete: (id: number | string) => void
  onDrawingDelete: (uid: string) => void
  onFlowchartDelete: (uid: string) => void
  onDiagramUpdate: (id: number | string, name: string, options?: { silent?: boolean }) => void
  onNoteUpdate: (id: number | string, title: string, options?: { silent?: boolean }) => void
  onDrawingUpdate: (uid: string, title: string, options?: { silent?: boolean }) => void
  onFlowchartUpdate: (uid: string, title: string, options?: { silent?: boolean }) => void
  onMoveDiagramToProject: (diagramId: number | string, projectId: number | string | null, options?: { silent?: boolean }) => void
  onMoveNoteToProject: (noteId: number | string, projectId: number | string | null, options?: { silent?: boolean }) => void
  onMoveDrawingToProject: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => void
  onMoveFlowchartToProject: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => void
  allProjects: Project[]
  searchQuery: string
  hasMoreProjects?: boolean
  hasMoreDiagrams?: boolean
  hasMoreNotes?: boolean
  hasMoreDrawings?: boolean
  hasMoreFlowcharts?: boolean
  onLoadMoreProjects?: () => void
  onLoadMoreDiagrams?: () => void
  onLoadMoreNotes?: () => void
  onLoadMoreDrawings?: () => void
  onLoadMoreFlowcharts?: () => void
  onNoteCopyMarkdown?: (id: number | string) => void
  onNoteImportMarkdown?: (id: number | string) => void
  onNoteExportMarkdown?: (id: number | string) => void
  isOnline: boolean
  isProjectsLoading?: boolean
  isDiagramsLoading?: boolean
  isNotesLoading?: boolean
  isDrawingsLoading?: boolean
  isFlowchartsLoading?: boolean
  uncategorized: {
    diagrams: Diagram[];
    notes: Note[];
    drawings: Drawing[];
    flowcharts: Flowchart[];
  };
}) {
  const { isMobile } = useSidebar()
  
  // Dialog States
  const [isProjectDialogOpen, setIsProjectDialogOpen] = React.useState(false)
  const [isFileDialogOpen, setIsFileDialogOpen] = React.useState(false)
  const [isEditFileDialogOpen, setIsEditFileDialogOpen] = React.useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false)
  
  const [projectName, setProjectName] = React.useState("")
  const [fileName, setFileName] = React.useState("")
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("none")
  
  const [editingProjectId, setEditingProjectId] = React.useState<number | string | null>(null)
  const [editingProjectName, setEditingProjectName] = React.useState("")
  
  const [editingFile, setEditingFile] = React.useState<{ id: number | string, name: string, projectId: number | string | null, type: 'erd' | 'notes' | 'drawings' | 'flowchart', uid?: string } | null>(null)
  const [deletingFile, setDeletingFile] = React.useState<{ id: number | string, type: 'erd' | 'notes' | 'drawings' | 'flowchart', uid?: string } | null>(null)
  const [deletingProject, setDeletingProject] = React.useState<{ id: number | string, name: string } | null>(null)
  const [isProjectDeleteConfirmOpen, setIsProjectDeleteConfirmOpen] = React.useState(false)

  const handleCreateProject = () => {
    if (projectName.trim()) {
      onProjectCreate(projectName.trim())
      setProjectName("")
      setIsProjectDialogOpen(false)
    }
  }

  const handleCreateFile = () => {
    if (fileName.trim()) {
      const projectId = selectedProjectId === "none" ? null : selectedProjectId
      if (sidebarView === 'erd') {
        onDiagramCreate(fileName.trim(), projectId)
      } else if (sidebarView === 'notes') {
        onNoteCreate(fileName.trim(), projectId)
      } else if (sidebarView === 'drawings') {
        onDrawingCreate(fileName.trim(), projectId)
      } else if (sidebarView === 'flowchart') {
        onFlowchartCreate(fileName.trim(), projectId)
      }
      setFileName("")
      setIsFileDialogOpen(false)
    }
  }

  const handleUpdateFile = async () => {
    if (editingFile && editingFile.name.trim()) {
      const projectId = selectedProjectId === "none" ? null : selectedProjectId
      
      try {
        if (editingFile.type === 'erd') {
          await onDiagramUpdate(editingFile.id, editingFile.name.trim(), { silent: true })
          if (String(projectId) !== String(editingFile.projectId)) await onMoveDiagramToProject(editingFile.id, projectId, { silent: true })
        } else if (editingFile.type === 'notes') {
          await onNoteUpdate(editingFile.id, editingFile.name.trim(), { silent: true })
          if (String(projectId) !== String(editingFile.projectId)) await onMoveNoteToProject(editingFile.id, projectId, { silent: true })
        } else if (editingFile.type === 'drawings') {
          await onDrawingUpdate(editingFile.uid!, editingFile.name.trim(), { silent: true })
          if (String(projectId) !== String(editingFile.projectId)) await onMoveDrawingToProject(editingFile.uid!, projectId, { silent: true })
        } else if (editingFile.type === 'flowchart') {
          await onFlowchartUpdate(editingFile.uid!, editingFile.name.trim(), { silent: true })
          if (String(projectId) !== String(editingFile.projectId)) await onMoveFlowchartToProject(editingFile.uid!, projectId, { silent: true })
        }
        toast.success('File updated successfully')
      } catch (err) {
        toast.error('Failed to update file')
      }
      
      setIsEditFileDialogOpen(false)
      setEditingFile(null)
    }
  }

  const handleDeleteConfirm = () => {
    if (deletingFile) {
      if (deletingFile.type === 'erd') onDiagramDelete(deletingFile.id)
      else if (deletingFile.type === 'notes') onNoteDelete(deletingFile.id)
      else if (deletingFile.type === 'drawings') onDrawingDelete(deletingFile.uid!)
      else if (deletingFile.type === 'flowchart') onFlowchartDelete(deletingFile.uid!)
      
      setIsDeleteConfirmOpen(false)
      setDeletingFile(null)
    }
  }

  const getFileCount = (projectId: number | string | null, viewFilter?: string) => {
    const currentView = viewFilter || sidebarView;
    const dCount = (diagrams || []).filter(f => !f.is_deleted && (projectId === null || String(f.project_id) === String(projectId)) && (currentView === 'erd')).length
    const nCount = (notes || []).filter(n => !n.is_deleted && (projectId === null || String(n.project_id) === String(projectId)) && (currentView === 'notes')).length
    const drCount = (drawings || []).filter(d => !d.is_deleted && (projectId === null || String(d.project_id) === String(projectId)) && (currentView === 'drawings')).length
    const fCount = (flowcharts || []).filter(f => !f.is_deleted && (projectId === null || String(f.project_id) === String(projectId)) && (currentView === 'flowchart')).length
    
    if (currentView === 'erd') return dCount;
    if (currentView === 'notes') return nCount;
    if (currentView === 'drawings') return drCount;
    if (currentView === 'flowchart') return fCount;
    return dCount + nCount + drCount + fCount;
  }

  const getFilesForCurrentView = () => {
    const pFiles = projects.flatMap(p => {
      switch (sidebarView) {
        case 'erd': return p.diagrams || []
        case 'notes': return p.notes || []
        case 'drawings': return p.drawings || []
        case 'flowchart': return p.flowcharts || []
        default: return []
      }
    });

    const uFiles = (() => {
      switch (sidebarView) {
        case 'erd': return uncategorized.diagrams || []
        case 'notes': return uncategorized.notes || []
        case 'drawings': return uncategorized.drawings || []
        case 'flowchart': return uncategorized.flowcharts || []
        default: return []
      }
    })();

    return [...pFiles, ...uFiles];
  }

  const getActiveFileId = () => {
    switch (sidebarView) {
      case 'erd': return activeDiagramId
      case 'notes': return activeNoteUid
      case 'drawings': return activeDrawingId
      case 'flowchart': {
        // Map numeric activeFlowchartId to uid for sidebar highlighting
        const fc = flowcharts.find(f => String(f.id) === String(activeFlowchartId));
        return fc?.uid ?? activeFlowchartId;
      }
      default: return null
    }
  }

  const getOnFileSelect = () => {
    switch (sidebarView) {
      case 'erd': return onDiagramSelect
      case 'notes': return (id: number | string) => onNoteSelect(String(id))
      case 'drawings': return (id: number | string) => onDrawingSelect(String(id))
      case 'flowchart': return (id: number | string) => onFlowchartSelect(String(id))
      default: return () => {}
    }
  }

  const getIcon = () => {
    switch (sidebarView) {
      case 'erd': return Database
      case 'notes': return StickyNote
      case 'drawings': return PenTool
      case 'flowchart': return Network
      default: return Database
    }
  }

  const allFiles = getFilesForCurrentView().filter(f => !f.is_deleted);
  const activeFileId = getActiveFileId();
  const onFileSelect = getOnFileSelect();
  const fileIcon = getIcon();

  return (
    <>
      <ProjectGroup 
        projects={projects}
        activeProjectId={activeProjectId}
        isOnline={isOnline}
        isProjectsLoading={!!isProjectsLoading}
        hasMoreProjects={!!hasMoreProjects}
        sidebarView={sidebarView}
        view={view}
        isMobile={isMobile}
        onProjectSelect={onProjectSelect}
        onProjectCreateClick={() => {
          setEditingProjectId(null)
          setProjectName("")
          setIsProjectDialogOpen(true)
        }}
        onLoadMoreProjects={onLoadMoreProjects}
        setEditingProjectId={setEditingProjectId}
        setEditingProjectName={setEditingProjectName}
        setIsProjectDialogOpen={setIsProjectDialogOpen}
        setDeletingProject={setDeletingProject}
        setIsProjectDeleteConfirmOpen={setIsProjectDeleteConfirmOpen}
        getFileCount={getFileCount}
        
        // New Props for Tree View
        files={allFiles}
        activeFileId={activeFileId}
        onFileSelect={onFileSelect}
        fileIcon={fileIcon}
        setEditingFile={setEditingFile}
        setSelectedProjectId={setSelectedProjectId}
        setIsEditFileDialogOpen={setIsEditFileDialogOpen}
        setDeletingFile={setDeletingFile}
        setIsDeleteConfirmOpen={setIsDeleteConfirmOpen}
        onAddClick={() => {
          setSelectedProjectId(activeProjectId?.toString() || "none")
          setFileName("")
          setIsFileDialogOpen(true)
        }}
        hasMoreFiles={
          (sidebarView === 'erd' && !!hasMoreDiagrams) || 
          (sidebarView === 'notes' && !!hasMoreNotes) || 
          (sidebarView === 'drawings' && !!hasMoreDrawings) || 
          (sidebarView === 'flowchart' && !!hasMoreFlowcharts)
        }
        onLoadMoreFiles={
          sidebarView === 'erd' ? onLoadMoreDiagrams! : 
          sidebarView === 'notes' ? onLoadMoreNotes! : 
          sidebarView === 'drawings' ? onLoadMoreDrawings! : 
          onLoadMoreFlowcharts!
        }
        isFilesLoading={
          (sidebarView === 'erd' && !!isDiagramsLoading) || 
          (sidebarView === 'notes' && !!isNotesLoading) || 
          (sidebarView === 'drawings' && !!isDrawingsLoading) || 
          (sidebarView === 'flowchart' && !!isFlowchartsLoading)
        }
        searchQuery={searchQuery}
        uncategorized={uncategorized}
      />

      <SidebarModals 
        isProjectDialogOpen={isProjectDialogOpen}
        setIsProjectDialogOpen={setIsProjectDialogOpen}
        editingProjectId={editingProjectId}
        setEditingProjectId={setEditingProjectId}
        editingProjectName={editingProjectName}
        setEditingProjectName={setEditingProjectName}
        projectName={projectName}
        setProjectName={setProjectName}
        handleCreateProject={handleCreateProject}
        onProjectUpdate={onProjectUpdate}
        
        isFileDialogOpen={isFileDialogOpen}
        setIsFileDialogOpen={setIsFileDialogOpen}
        sidebarView={sidebarView}
        fileName={fileName}
        setFileName={setFileName}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        allProjects={allProjects}
        handleCreateFile={handleCreateFile}
        
        isEditFileDialogOpen={isEditFileDialogOpen}
        setIsEditFileDialogOpen={setIsEditFileDialogOpen}
        editingFile={editingFile}
        setEditingFile={setEditingFile}
        handleUpdateFile={handleUpdateFile}
        
        isDeleteConfirmOpen={isDeleteConfirmOpen}
        setIsDeleteConfirmOpen={setIsDeleteConfirmOpen}
        handleDeleteConfirm={handleDeleteConfirm}
        
        isProjectDeleteConfirmOpen={isProjectDeleteConfirmOpen}
        setIsProjectDeleteConfirmOpen={setIsProjectDeleteConfirmOpen}
        deletingProject={deletingProject}
        setDeletingProject={setDeletingProject}
        onProjectDelete={onProjectDelete}
      />
    </>
  )
}
