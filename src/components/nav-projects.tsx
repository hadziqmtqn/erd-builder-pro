import * as React from "react"
import {
  Folder,
  MoreHorizontal,
  Plus,
  Trash2,
  Edit2,
  ChevronRight,
  Database,
  StickyNote,
  PenTool,
  Network,
  FolderPlus,
} from "lucide-react"
import { Skeleton } from "./ui/skeleton"
import { Badge } from "./ui/badge"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogBody
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Diagram, Project, Note, Drawing, Flowchart } from "../types"

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
  activeNoteId,
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
}: {
  projects: {
    id: number | string
    name: string
    url: string
    icon: any
    isActive: boolean
    files_count?: number
    diagrams_count?: number
    notes_count?: number
    drawings_count?: number
    flowcharts_count?: number
  }[]
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
  onNoteSelect: (id: number | string) => void
  onDrawingSelect: (id: number | string) => void
  onFlowchartSelect: (id: number | string) => void
  activeDiagramId: number | string | null
  activeNoteId: number | string | null
  activeDrawingId: number | string | null
  activeFlowchartId: number | string | null
  view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog'
  sidebarView: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'changelog'
  onDiagramDelete: (id: number | string) => void
  onNoteDelete: (id: number | string) => void
  onDrawingDelete: (id: number | string) => void
  onFlowchartDelete: (id: number | string) => void
  onDiagramUpdate: (id: number | string, name: string) => void
  onNoteUpdate: (id: number | string, title: string) => void
  onDrawingUpdate: (id: number | string, title: string) => void
  onFlowchartUpdate: (id: number | string, title: string) => void
  onMoveDiagramToProject: (diagramId: number | string, projectId: number | string | null) => void
  onMoveNoteToProject: (noteId: number | string, projectId: number | string | null) => void
  onMoveDrawingToProject: (drawingId: number | string, projectId: number | string | null) => void
  onMoveFlowchartToProject: (flowchartId: number | string, projectId: number | string | null) => void
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
  isOnline: boolean
  isProjectsLoading?: boolean
  isDiagramsLoading?: boolean
  isNotesLoading?: boolean
  isDrawingsLoading?: boolean
  isFlowchartsLoading?: boolean
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
  
  const [editingFile, setEditingFile] = React.useState<{ id: number | string, name: string, projectId: number | string | null, type: 'erd' | 'notes' | 'drawings' | 'flowchart' } | null>(null)
  const [deletingFile, setDeletingFile] = React.useState<{ id: number | string, type: 'erd' | 'notes' | 'drawings' | 'flowchart' } | null>(null)
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

  const handleUpdateFile = () => {
    if (editingFile && editingFile.name.trim()) {
      const projectId = selectedProjectId === "none" ? null : selectedProjectId
      
      if (editingFile.type === 'erd') {
        onDiagramUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveDiagramToProject(editingFile.id, projectId)
      } else if (editingFile.type === 'notes') {
        onNoteUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveNoteToProject(editingFile.id, projectId)
      } else if (editingFile.type === 'drawings') {
        onDrawingUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveDrawingToProject(editingFile.id, projectId)
      } else if (editingFile.type === 'flowchart') {
        onFlowchartUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveFlowchartToProject(editingFile.id, projectId)
      }

      
      setIsEditFileDialogOpen(false)
      setEditingFile(null)
    }
  }

  const handleDeleteConfirm = () => {
    if (deletingFile) {
      if (deletingFile.type === 'erd') onDiagramDelete(deletingFile.id)
      else if (deletingFile.type === 'notes') onNoteDelete(deletingFile.id)
      else if (deletingFile.type === 'drawings') onDrawingDelete(deletingFile.id)
      else if (deletingFile.type === 'flowchart') onFlowchartDelete(deletingFile.id)
      
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

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
      {!isOnline ? null : (
        <SidebarGroupAction title="Add Project" onClick={() => {
          setEditingProjectId(null)
          setProjectName("")
          setIsProjectDialogOpen(true)
        }} className="cursor-pointer">
          <Plus />
          <span className="sr-only">Add Project</span>
        </SidebarGroupAction>
      )}
      <SidebarMenu>
        <SidebarMenuItem className={cn(!isOnline && "opacity-50 cursor-not-allowed")}>
          <SidebarMenuButton 
            isActive={activeProjectId === null}
            onClick={() => isOnline && onProjectSelect(null)}
            className={cn("cursor-pointer", !isOnline && "pointer-events-none")}
          >
            <Folder />
            <span>All Project</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        
        {isProjectsLoading && (
          <div className="space-y-2 px-2 py-2">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        )}

        {!isProjectsLoading && projects.map((item) => (
          <SidebarMenuItem key={item.id} className={cn(!isOnline && "opacity-50 cursor-not-allowed")}>
            <Tooltip>
              <TooltipTrigger render={
                <SidebarMenuButton 
                  onClick={() => isOnline && onProjectSelect(item.id)} 
                  isActive={item.isActive} 
                  className={cn("cursor-pointer", !isOnline && "pointer-events-none")}
                >
                  <item.icon />
                  <span className="flex-1 min-w-0 truncate">{item.name}</span>
                  <Badge className="ml-auto bg-green-50 text-green-700 hover:bg-green-50 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-950 border-none px-1.5 h-4.5 text-[10px] font-bold">
                    {(() => {
                      if (item.diagrams_count !== undefined) {
                        if (sidebarView === 'erd') return item.diagrams_count;
                        if (sidebarView === 'notes') return item.notes_count || 0;
                        if (sidebarView === 'drawings') return item.drawings_count || 0;
                        if (sidebarView === 'flowchart') return item.flowcharts_count || 0;
                        return item.files_count || 0;
                      }
                      return getFileCount(item.id);
                    })()}
                  </Badge>
                </SidebarMenuButton>
              } />
              <TooltipContent side="right" sideOffset={10}>
                {item.name}
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className={cn("cursor-pointer", !isOnline && "pointer-events-none")}><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem disabled={!isOnline} onClick={() => {
                  setEditingProjectId(item.id)
                  setEditingProjectName(item.name)
                  setIsProjectDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4 text-muted-foreground" />
                  <span>Rename Project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  disabled={!isOnline} 
                  className="text-destructive focus:text-destructive" 
                  onClick={() => {
                    setDeletingProject({ id: item.id, name: item.name })
                    setIsProjectDeleteConfirmOpen(true)
                  }}
                >
                  <Trash2 className="mr-2 size-4" />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        {hasMoreProjects && (
          <SidebarMenuItem className={cn(!isOnline && "opacity-50 cursor-not-allowed")}>
            <SidebarMenuButton 
              className={cn("text-muted-foreground hover:text-foreground", !isOnline && "pointer-events-none")}
              onClick={() => isOnline && onLoadMoreProjects?.()}
            >
              <MoreHorizontal className="size-4" />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        </SidebarMenu>
      </SidebarGroup>

      {/* Files Section based on active project and sidebarView */}
      <SidebarGroup className="group-data-[collapsible=icon]:hidden pt-0">
        <SidebarGroupLabel>
          {sidebarView === 'erd' ? 'Diagrams' : sidebarView === 'notes' ? 'Notes' : sidebarView === 'flowchart' ? 'Flowcharts' : 'Drawings'}
        </SidebarGroupLabel>
      {!isOnline ? null : (
        <SidebarGroupAction title={`Add ${sidebarView}`} onClick={() => {
          setSelectedProjectId(activeProjectId?.toString() || "none")
          setFileName("")
          setIsFileDialogOpen(true)
        }} className="cursor-pointer">
          <Plus />
        </SidebarGroupAction>
      )}
      <SidebarMenu>
        {((sidebarView === 'erd' && isDiagramsLoading) || 
          (sidebarView === 'notes' && isNotesLoading) || 
          (sidebarView === 'drawings' && isDrawingsLoading) || 
          (sidebarView === 'flowchart' && isFlowchartsLoading)) && (
          <div className="space-y-2 px-2 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        )}

        {!isDiagramsLoading && sidebarView === 'erd' && (diagrams || []).filter(f => !f.is_deleted && (activeProjectId === null || String(f.project_id) === String(activeProjectId))).map(file => (
          <SidebarMenuItem key={file.id} className={cn(!isOnline && "opacity-50 cursor-not-allowed")}>
          <Tooltip>
            <TooltipTrigger render={
              <SidebarMenuButton 
                isActive={activeDiagramId === file.id && view === 'erd'}
                onClick={() => isOnline && onDiagramSelect(file.id)}
                className={cn("cursor-pointer", !isOnline && "pointer-events-none")}
              >
                <Database className="size-4" />
                <span className="flex-1 min-w-0 truncate">{file.name}</span>
              </SidebarMenuButton>
            } />
            <TooltipContent side="right" sideOffset={10}>
              {file.name}
            </TooltipContent>
          </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className={cn("cursor-pointer", !isOnline && "pointer-events-none")}><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem disabled={!isOnline} onClick={() => {
                  setEditingFile({ id: file.id, name: file.name, projectId: file.project_id, type: 'erd' })
                  setSelectedProjectId(file.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!isOnline} className="text-destructive focus:text-destructive" onClick={() => {
                  setDeletingFile({ id: file.id, type: 'erd' })
                  setIsDeleteConfirmOpen(true)
                }}>
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        {!isNotesLoading && sidebarView === 'notes' && (notes || []).filter(n => !n.is_deleted && (activeProjectId === null || String(n.project_id) === String(activeProjectId))).map(note => (
          <SidebarMenuItem key={note.id} className={cn(!isOnline && "opacity-50 cursor-not-allowed")}>
          <Tooltip>
            <TooltipTrigger render={
              <SidebarMenuButton 
                isActive={activeNoteId === note.id && view === 'notes'}
                onClick={() => isOnline && onNoteSelect(note.id)}
                className={cn("cursor-pointer", !isOnline && "pointer-events-none")}
              >
                <StickyNote className="size-4" />
                <span className="flex-1 min-w-0 truncate">{note.title}</span>
              </SidebarMenuButton>
            } />
            <TooltipContent side="right" sideOffset={10}>
              {note.title}
            </TooltipContent>
          </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className={cn("cursor-pointer", !isOnline && "pointer-events-none")}><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem disabled={!isOnline} onClick={() => {
                  setEditingFile({ id: note.id, name: note.title, projectId: note.project_id, type: 'notes' })
                  setSelectedProjectId(note.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!isOnline} className="text-destructive focus:text-destructive" onClick={() => {
                  setDeletingFile({ id: note.id, type: 'notes' })
                  setIsDeleteConfirmOpen(true)
                }}>
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        {!isDrawingsLoading && sidebarView === 'drawings' && (drawings || []).filter(d => !d.is_deleted && (activeProjectId === null || String(d.project_id) === String(activeProjectId))).map(drawing => (
          <SidebarMenuItem key={drawing.id} className={cn(!isOnline && "opacity-50 cursor-not-allowed")}>
          <Tooltip>
            <TooltipTrigger render={
              <SidebarMenuButton 
                isActive={activeDrawingId === drawing.id && view === 'drawings'}
                onClick={() => isOnline && onDrawingSelect(drawing.id)}
                className={cn("cursor-pointer", !isOnline && "pointer-events-none")}
              >
                <PenTool className="size-4" />
                <span className="flex-1 min-w-0 truncate">{drawing.title}</span>
              </SidebarMenuButton>
            } />
            <TooltipContent side="right" sideOffset={10}>
              {drawing.title}
            </TooltipContent>
          </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className={cn("cursor-pointer", !isOnline && "pointer-events-none")}><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem disabled={!isOnline} onClick={() => {
                  setEditingFile({ id: drawing.id, name: drawing.title, projectId: drawing.project_id, type: 'drawings' })
                  setSelectedProjectId(drawing.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!isOnline} className="text-destructive focus:text-destructive" onClick={() => {
                  setDeletingFile({ id: drawing.id, type: 'drawings' })
                  setIsDeleteConfirmOpen(true)
                }}>
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}

        {sidebarView === 'flowchart' && (flowcharts || []).filter(f => !f.is_deleted && (activeProjectId === null || String(f.project_id) === String(activeProjectId))).map(flowchart => (
          <SidebarMenuItem key={flowchart.id} className={cn(!isOnline && "opacity-50 cursor-not-allowed")}>
          <Tooltip>
            <TooltipTrigger render={
              <SidebarMenuButton 
                isActive={activeFlowchartId === flowchart.id && view === 'flowchart'}
                onClick={() => isOnline && onFlowchartSelect(flowchart.id)}
                className={cn("cursor-pointer", !isOnline && "pointer-events-none")}
              >
                <Network className="size-4" />
                <span className="flex-1 min-w-0 truncate">{flowchart.title}</span>
              </SidebarMenuButton>
            } />
            <TooltipContent side="right" sideOffset={10}>
              {flowchart.title}
            </TooltipContent>
          </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className={cn("cursor-pointer", !isOnline && "pointer-events-none")}><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem disabled={!isOnline} onClick={() => {
                  setEditingFile({ id: flowchart.id, name: flowchart.title, projectId: flowchart.project_id, type: 'flowchart' })
                  setSelectedProjectId(flowchart.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!isOnline} className="text-destructive focus:text-destructive" onClick={() => {
                  setDeletingFile({ id: flowchart.id, type: 'flowchart' })
                  setIsDeleteConfirmOpen(true)
                }}>
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}

        {sidebarView === 'erd' && hasMoreDiagrams && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onLoadMoreDiagrams}
            >
              <MoreHorizontal className="size-4" />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        {sidebarView === 'notes' && hasMoreNotes && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onLoadMoreNotes}
            >
              <MoreHorizontal className="size-4" />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        {sidebarView === 'drawings' && hasMoreDrawings && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onLoadMoreDrawings}
            >
              <MoreHorizontal className="size-4" />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        {sidebarView === 'flowchart' && hasMoreFlowcharts && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onLoadMoreFlowcharts}
            >
              <MoreHorizontal className="size-4" />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        {searchQuery && (
          ((sidebarView === 'erd' && diagrams.length === 0) ||
           (sidebarView === 'notes' && notes.length === 0) ||
           (sidebarView === 'drawings' && drawings.length === 0) ||
           (sidebarView === 'flowchart' && flowcharts.length === 0)) && (
            <div className="px-4 py-2 text-xs text-muted-foreground italic">No results match "{searchQuery}"</div>
          )
        )}
      </SidebarMenu>

      {/* Project Dialog */}
      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProjectId !== null ? 'Rename Project' : 'Create New Project'}</DialogTitle>
            <DialogDescription>
              {editingProjectId !== null ? 'Enter a new name for your project.' : 'Enter a name for your new project to organize your files.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                value={editingProjectId !== null ? editingProjectName : projectName}
                onChange={(e) => editingProjectId !== null ? setEditingProjectName(e.target.value) : setProjectName(e.target.value)}
                placeholder="Project name"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsProjectDialogOpen(false)
              setEditingProjectId(null)
            }}>Cancel</Button>
            <Button onClick={() => {
              if (editingProjectId !== null) {
                if (editingProjectName.trim()) {
                  onProjectUpdate(editingProjectId, editingProjectName.trim())
                  setEditingProjectId(null)
                  setIsProjectDialogOpen(false)
                }
              } else {
                handleCreateProject()
              }
            }}>{editingProjectId !== null ? 'Save Changes' : 'Create Project'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File/Note/Drawing Dialog */}
      <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New {sidebarView === 'erd' ? 'Diagram' : sidebarView === 'notes' ? 'Note' : sidebarView === 'flowchart' ? 'Flowchart' : 'Drawing'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="filename">
                Name
              </Label>
              <Input
                id="filename"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Enter name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project">
                Project
              </Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project">
                    {selectedProjectId === "none" ? "No Project (Root)" : allProjects.find(p => p.id.toString() === selectedProjectId)?.name || "Select a project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project (Root)</SelectItem>
                  {allProjects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFileDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFile}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit File Dialog */}
      <Dialog open={isEditFileDialogOpen} onOpenChange={setIsEditFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingFile?.type === 'erd' ? 'Diagram' : editingFile?.type === 'notes' ? 'Note' : editingFile?.type === 'flowchart' ? 'Flowchart' : 'Drawing'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-filename">
                Name
              </Label>
              <Input
                id="edit-filename"
                value={editingFile?.name || ""}
                onChange={(e) => setEditingFile(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="Enter name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-project">
                Project
              </Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project">
                    {selectedProjectId === "none" ? "No Project (Root)" : allProjects.find(p => p.id.toString() === selectedProjectId)?.name || selectedProjectId}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project (Root)</SelectItem>
                  {allProjects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditFileDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateFile}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This will move the item to the trash. You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If you delete this item, it will be moved to the Trash Bin where you can restore it within 30 days.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Project Delete Confirmation Dialog */}
      <Dialog open={isProjectDeleteConfirmOpen} onOpenChange={setIsProjectDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project "{deletingProject?.name}"?</DialogTitle>
            <DialogDescription>
              Are you sure you want to move this project to the trash?
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Moving this project to the trash will also move all its <strong>Diagrams, Notes, Drawings, and Flowcharts</strong> to the trash as well. You can restore them later from the Trash Bin.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProjectDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (deletingProject) {
                onProjectDelete(deletingProject.id)
                setIsProjectDeleteConfirmOpen(false)
                setDeletingProject(null)
              }
            }}>Delete Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
    </>
  )
}
