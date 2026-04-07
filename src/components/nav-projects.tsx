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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

import { FileData, Project, Note, Drawing, Flowchart } from "../types"
import { cn } from "@/lib/utils"

export function NavProjects({
  projects,
  activeProjectId,
  onProjectSelect,
  onProjectDelete,
  onProjectUpdate,
  onProjectCreate,
  onFileCreate,
  onNoteCreate,
  onDrawingCreate,
  onFlowchartCreate,
  files,
  notes,
  drawings,
  flowcharts,
  onFileSelect,
  onNoteSelect,
  onDrawingSelect,
  onFlowchartSelect,
  activeFileId,
  activeNoteId,
  activeDrawingId,
  activeFlowchartId,
  view,
  sidebarView,
  onFileDelete,
  onNoteDelete,
  onDrawingDelete,
  onFlowchartDelete,
  onFileUpdate,
  onNoteUpdate,
  onDrawingUpdate,
  onFlowchartUpdate,
  onMoveFileToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  onMoveFlowchartToProject,
  allProjects,
  searchQuery,
  hasMoreProjects,
  hasMoreFiles,
  hasMoreNotes,
  hasMoreDrawings,
  hasMoreFlowcharts,
  onLoadMoreProjects,
  onLoadMoreFiles,
  onLoadMoreNotes,
  onLoadMoreDrawings,
  onLoadMoreFlowcharts,
}: {
  projects: {
    id: number | string
    name: string
    url: string
    icon: any
    isActive: boolean
  }[]
  activeProjectId: number | string | null
  onProjectSelect: (id: number | string | null) => void
  onProjectDelete: (id: number | string) => void
  onProjectUpdate: (id: number | string, name: string) => void
  onProjectCreate: (name: string) => void
  onFileCreate: (name: string, projectId: number | string | null) => void
  onNoteCreate: (title: string, projectId: number | string | null) => void
  onDrawingCreate: (title: string, projectId: number | string | null) => void
  onFlowchartCreate: (title: string, projectId: number | string | null) => void
  files: FileData[]
  notes: Note[]
  drawings: Drawing[]
  flowcharts: Flowchart[]
  onFileSelect: (id: number | string) => void
  onNoteSelect: (id: number | string) => void
  onDrawingSelect: (id: number | string) => void
  onFlowchartSelect: (id: number | string) => void
  activeFileId: number | string | null
  activeNoteId: number | string | null
  activeDrawingId: number | string | null
  activeFlowchartId: number | string | null
  view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart'
  sidebarView: 'erd' | 'notes' | 'drawings' | 'flowchart'
  onFileDelete: (id: number | string) => void
  onNoteDelete: (id: number | string) => void
  onDrawingDelete: (id: number | string) => void
  onFlowchartDelete: (id: number | string) => void
  onFileUpdate: (id: number | string, name: string) => void
  onNoteUpdate: (id: number | string, title: string) => void
  onDrawingUpdate: (id: number | string, title: string) => void
  onFlowchartUpdate: (id: number | string, title: string) => void
  onMoveFileToProject: (fileId: number | string, projectId: number | string | null) => void
  onMoveNoteToProject: (noteId: number | string, projectId: number | string | null) => void
  onMoveDrawingToProject: (drawingId: number | string, projectId: number | string | null) => void
  onMoveFlowchartToProject: (flowchartId: number | string, projectId: number | string | null) => void
  allProjects: Project[]
  searchQuery: string
  hasMoreProjects?: boolean
  hasMoreFiles?: boolean
  hasMoreNotes?: boolean
  hasMoreDrawings?: boolean
  hasMoreFlowcharts?: boolean
  onLoadMoreProjects?: () => void
  onLoadMoreFiles?: () => void
  onLoadMoreNotes?: () => void
  onLoadMoreDrawings?: () => void
  onLoadMoreFlowcharts?: () => void
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
        onFileCreate(fileName.trim(), projectId)
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
        onFileUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveFileToProject(editingFile.id, projectId)
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
      if (deletingFile.type === 'erd') onFileDelete(deletingFile.id)
      else if (deletingFile.type === 'notes') onNoteDelete(deletingFile.id)
      else if (deletingFile.type === 'drawings') onDrawingDelete(deletingFile.id)
      else if (deletingFile.type === 'flowchart') onFlowchartDelete(deletingFile.id)
      
      setIsDeleteConfirmOpen(false)
      setDeletingFile(null)
    }
  }

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarGroupAction title="Add Project" onClick={() => {
        setEditingProjectId(null)
        setProjectName("")
        setIsProjectDialogOpen(true)
      }} className="cursor-pointer">
        <Plus />
        <span className="sr-only">Add Project</span>
      </SidebarGroupAction>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton 
            isActive={activeProjectId === null}
            onClick={() => onProjectSelect(null)}
            className="cursor-pointer"
          >
            <Folder />
            <span>All Workspace</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {projects.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton onClick={() => onProjectSelect(item.id)} isActive={item.isActive} className="cursor-pointer">
              <item.icon />
              <span>{item.name}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className="cursor-pointer"><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem onClick={() => {
                  setEditingProjectId(item.id)
                  setEditingProjectName(item.name)
                  setIsProjectDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4 text-muted-foreground" />
                  <span>Rename Project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onProjectDelete(item.id)}>
                  <Trash2 className="mr-2 size-4 text-muted-foreground" />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        {hasMoreProjects && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-muted-foreground hover:text-foreground"
              onClick={onLoadMoreProjects}
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
      <SidebarGroupAction title={`Add ${sidebarView}`} onClick={() => {
        setSelectedProjectId(activeProjectId?.toString() || "none")
        setFileName("")
        setIsFileDialogOpen(true)
      }} className="cursor-pointer">
        <Plus />
      </SidebarGroupAction>
      <SidebarMenu>
        {sidebarView === 'erd' && files.filter(f => !f.is_deleted && (activeProjectId === null || f.project_id === activeProjectId)).map(file => (
          <SidebarMenuItem key={file.id}>
            <SidebarMenuButton 
              isActive={activeFileId === file.id && view === 'erd'}
              onClick={() => onFileSelect(file.id)}
              className="cursor-pointer"
            >
              <Database className="size-4" />
              <span>{file.name}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className="cursor-pointer"><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem onClick={() => {
                  setEditingFile({ id: file.id, name: file.name, projectId: file.project_id, type: 'erd' })
                  setSelectedProjectId(file.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => {
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
        {sidebarView === 'notes' && notes.filter(n => !n.is_deleted && (activeProjectId === null || n.project_id === activeProjectId)).map(note => (
          <SidebarMenuItem key={note.id}>
            <SidebarMenuButton 
              isActive={activeNoteId === note.id && view === 'notes'}
              onClick={() => onNoteSelect(note.id)}
              className="cursor-pointer"
            >
              <StickyNote className="size-4" />
              <span>{note.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className="cursor-pointer"><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem onClick={() => {
                  setEditingFile({ id: note.id, name: note.title, projectId: note.project_id, type: 'notes' })
                  setSelectedProjectId(note.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => {
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
        {sidebarView === 'drawings' && drawings.filter(d => !d.is_deleted && (activeProjectId === null || d.project_id === activeProjectId)).map(drawing => (
          <SidebarMenuItem key={drawing.id}>
            <SidebarMenuButton 
              isActive={activeDrawingId === drawing.id && view === 'drawings'}
              onClick={() => onDrawingSelect(drawing.id)}
              className="cursor-pointer"
            >
              <PenTool className="size-4" />
              <span>{drawing.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem onClick={() => {
                  setEditingFile({ id: drawing.id, name: drawing.title, projectId: drawing.project_id, type: 'drawings' })
                  setSelectedProjectId(drawing.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => {
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

        {sidebarView === 'flowchart' && flowcharts.filter(f => !f.is_deleted && (activeProjectId === null || f.project_id === activeProjectId)).map(flowchart => (
          <SidebarMenuItem key={flowchart.id}>
            <SidebarMenuButton 
              isActive={activeFlowchartId === flowchart.id && view === 'flowchart'}
              onClick={() => onFlowchartSelect(flowchart.id)}
              className="cursor-pointer"
            >
              <Network className="size-4" />
              <span>{flowchart.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem onClick={() => {
                  setEditingFile({ id: flowchart.id, name: flowchart.title, projectId: flowchart.project_id, type: 'flowchart' })
                  setSelectedProjectId(flowchart.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => {
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

        {sidebarView === 'erd' && hasMoreFiles && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onLoadMoreFiles}
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
          ((sidebarView === 'erd' && files.length === 0) ||
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
          <div className="grid gap-4 py-4">
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
          </div>
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
          <div className="grid gap-4 py-4">
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
          </div>
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
          <div className="grid gap-4 py-4">
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
          </div>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
    </>
  )
}
