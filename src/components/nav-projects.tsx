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

import { FileData, Project, Note, Drawing } from "../types"
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
  files,
  notes,
  drawings,
  onFileSelect,
  onNoteSelect,
  onDrawingSelect,
  activeFileId,
  activeNoteId,
  activeDrawingId,
  view,
  onFileDelete,
  onNoteDelete,
  onDrawingDelete,
  onFileUpdate,
  onNoteUpdate,
  onDrawingUpdate,
  onMoveFileToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  allProjects,
}: {
  projects: {
    id: number
    name: string
    url: string
    icon: any
    isActive: boolean
  }[]
  activeProjectId: number | null
  onProjectSelect: (id: number | null) => void
  onProjectDelete: (id: number) => void
  onProjectUpdate: (id: number, name: string) => void
  onProjectCreate: (name: string) => void
  onFileCreate: (name: string, projectId: number | null) => void
  onNoteCreate: (title: string, projectId: number | null) => void
  onDrawingCreate: (title: string, projectId: number | null) => void
  files: FileData[]
  notes: Note[]
  drawings: Drawing[]
  onFileSelect: (id: number) => void
  onNoteSelect: (id: number) => void
  onDrawingSelect: (id: number) => void
  activeFileId: number | null
  activeNoteId: number | null
  activeDrawingId: number | null
  view: 'erd' | 'notes' | 'drawings' | 'trash'
  onFileDelete: (id: number) => void
  onNoteDelete: (id: number) => void
  onDrawingDelete: (id: number) => void
  onFileUpdate: (id: number, name: string) => void
  onNoteUpdate: (id: number, title: string) => void
  onDrawingUpdate: (id: number, title: string) => void
  onMoveFileToProject: (fileId: number, projectId: number | null) => void
  onMoveNoteToProject: (noteId: number, projectId: number | null) => void
  onMoveDrawingToProject: (drawingId: number, projectId: number | null) => void
  allProjects: Project[]
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
  
  const [editingProjectId, setEditingProjectId] = React.useState<number | null>(null)
  const [editingProjectName, setEditingProjectName] = React.useState("")
  
  const [editingFile, setEditingFile] = React.useState<{ id: number, name: string, projectId: number | null, type: 'erd' | 'notes' | 'drawings' } | null>(null)
  const [deletingFile, setDeletingFile] = React.useState<{ id: number, type: 'erd' | 'notes' | 'drawings' } | null>(null)

  const handleCreateProject = () => {
    if (projectName.trim()) {
      onProjectCreate(projectName.trim())
      setProjectName("")
      setIsProjectDialogOpen(false)
    }
  }

  const handleCreateFile = () => {
    if (fileName.trim()) {
      const projectId = selectedProjectId === "none" ? null : parseInt(selectedProjectId)
      if (view === 'erd') {
        onFileCreate(fileName.trim(), projectId)
      } else if (view === 'notes') {
        onNoteCreate(fileName.trim(), projectId)
      } else if (view === 'drawings') {
        onDrawingCreate(fileName.trim(), projectId)
      }
      setFileName("")
      setIsFileDialogOpen(false)
    }
  }

  const handleUpdateFile = () => {
    if (editingFile && editingFile.name.trim()) {
      const projectId = selectedProjectId === "none" ? null : parseInt(selectedProjectId)
      
      if (editingFile.type === 'erd') {
        onFileUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveFileToProject(editingFile.id, projectId)
      } else if (editingFile.type === 'notes') {
        onNoteUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveNoteToProject(editingFile.id, projectId)
      } else if (editingFile.type === 'drawings') {
        onDrawingUpdate(editingFile.id, editingFile.name.trim())
        if (projectId !== editingFile.projectId) onMoveDrawingToProject(editingFile.id, projectId)
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
      }}>
        <Plus />
        <span className="sr-only">Add Project</span>
      </SidebarGroupAction>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton 
            isActive={activeProjectId === null}
            onClick={() => onProjectSelect(null)}
          >
            <Folder />
            <span>All Workspace</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {projects.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton render={<button onClick={() => onProjectSelect(item.id)} />} isActive={item.isActive}>
              <item.icon />
              <span>{item.name}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover><MoreHorizontal /></SidebarMenuAction>}>
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
        </SidebarMenu>
      </SidebarGroup>

      {/* Files Section based on active project and view */}
      {view !== 'trash' && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>
            {view === 'erd' ? 'Diagrams' : view === 'notes' ? 'Notes' : 'Drawings'}
          </SidebarGroupLabel>
      <SidebarGroupAction title={`Add ${view}`} onClick={() => {
        setSelectedProjectId(activeProjectId?.toString() || "none")
        setFileName("")
        setIsFileDialogOpen(true)
      }}>
        <Plus />
      </SidebarGroupAction>
      <SidebarMenu>
        {view === 'erd' && files.filter(f => !f.is_deleted && (activeProjectId === null || f.project_id === activeProjectId)).map(file => (
          <SidebarMenuItem key={file.id}>
            <SidebarMenuButton 
              isActive={activeFileId === file.id}
              onClick={() => onFileSelect(file.id)}
            >
              <Database className="size-4" />
              <span>{file.name}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem onClick={() => {
                  setEditingFile({ id: file.id, name: file.name, projectId: file.project_id, type: 'erd' })
                  setSelectedProjectId(file.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Edit
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
        {view === 'notes' && notes.filter(n => !n.is_deleted && (activeProjectId === null || n.project_id === activeProjectId)).map(note => (
          <SidebarMenuItem key={note.id}>
            <SidebarMenuButton 
              isActive={activeNoteId === note.id}
              onClick={() => onNoteSelect(note.id)}
            >
              <StickyNote className="size-4" />
              <span>{note.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover><MoreHorizontal /></SidebarMenuAction>}>
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuItem onClick={() => {
                  setEditingFile({ id: note.id, name: note.title, projectId: note.project_id, type: 'notes' })
                  setSelectedProjectId(note.project_id?.toString() || "none")
                  setIsEditFileDialogOpen(true)
                }}>
                  <Edit2 className="mr-2 size-4" />
                  Edit
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
        {view === 'drawings' && drawings.filter(d => !d.is_deleted && (activeProjectId === null || d.project_id === activeProjectId)).map(drawing => (
          <SidebarMenuItem key={drawing.id}>
            <SidebarMenuButton 
              isActive={activeDrawingId === drawing.id}
              onClick={() => onDrawingSelect(drawing.id)}
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
                  Edit
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
      </SidebarMenu>

      {/* Project Dialog */}
      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProjectId ? 'Rename Project' : 'Create New Project'}</DialogTitle>
            <DialogDescription>
              {editingProjectId ? 'Enter a new name for your project.' : 'Enter a name for your new project to organize your files.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                value={editingProjectId ? editingProjectName : projectName}
                onChange={(e) => editingProjectId ? setEditingProjectName(e.target.value) : setProjectName(e.target.value)}
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
              if (editingProjectId) {
                if (editingProjectName.trim()) {
                  onProjectUpdate(editingProjectId, editingProjectName.trim())
                  setEditingProjectId(null)
                  setIsProjectDialogOpen(false)
                }
              } else {
                handleCreateProject()
              }
            }}>{editingProjectId ? 'Save Changes' : 'Create Project'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File/Note/Drawing Dialog */}
      <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New {view === 'erd' ? 'Diagram' : view === 'notes' ? 'Note' : 'Drawing'}</DialogTitle>
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
            <DialogTitle>Edit {editingFile?.type === 'erd' ? 'Diagram' : editingFile?.type === 'notes' ? 'Note' : 'Drawing'}</DialogTitle>
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
    )}
    </>
  )
}
