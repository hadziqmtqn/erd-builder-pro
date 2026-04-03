import * as React from "react"
import {
  AudioWaveform,
  BookOpen,
  Bot,
  Command,
  Frame,
  GalleryVerticalEnd,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
  Database,
  StickyNote,
  PenTool,
  Trash2,
  Plus,
  Folder,
  MoreHorizontal,
  Edit2,
  Trash,
  FolderPlus,
  Search,
  ChevronRight,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarRail,
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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  files: FileData[];
  notes: Note[];
  drawings: Drawing[];
  projects: Project[];
  trashData: {
    files: FileData[];
    notes: Note[];
    drawings: Drawing[];
    projects: Project[];
  };
  activeFileId: number | null;
  activeNoteId: number | null;
  activeDrawingId: number | null;
  activeProjectId: number | null;
  view: 'erd' | 'notes' | 'drawings' | 'trash';
  onViewChange: (view: 'erd' | 'notes' | 'drawings' | 'trash') => void;
  onFileSelect: (id: number) => void;
  onNoteSelect: (id: number) => void;
  onDrawingSelect: (id: number) => void;
  onProjectSelect: (id: number | null) => void;
  onFileCreate: (name: string, projectId?: number | null) => void;
  onNoteCreate: (title: string, projectId?: number | null) => void;
  onDrawingCreate: (title: string, projectId?: number | null) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number, name: string) => void;
  onProjectDelete: (id: number) => void;
  onProjectRestore: (id: number) => void;
  onFileDelete: (id: number) => void;
  onNoteDelete: (id: number) => void;
  onDrawingDelete: (id: number) => void;
  onFileRestore: (id: number) => void;
  onNoteRestore: (id: number) => void;
  onDrawingRestore: (id: number) => void;
  onFilePermanentDelete: (id: number) => void;
  onNotePermanentDelete: (id: number) => void;
  onDrawingPermanentDelete: (id: number) => void;
  onProjectPermanentDelete: (id: number) => void;
  onFileUpdate: (id: number, name: string) => void;
  onNoteUpdate: (id: number, title: string) => void;
  onDrawingUpdate: (id: number, title: string) => void;
  onLogout: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onMoveFileToProject: (fileId: number, projectId: number | null) => void;
  onMoveNoteToProject: (noteId: number, projectId: number | null) => void;
  onMoveDrawingToProject: (drawingId: number, projectId: number | null) => void;
}

export function AppSidebar({
  files,
  notes,
  drawings,
  projects,
  trashData,
  activeFileId,
  activeNoteId,
  activeDrawingId,
  activeProjectId,
  view,
  onViewChange,
  onFileSelect,
  onNoteSelect,
  onDrawingSelect,
  onProjectSelect,
  onFileCreate,
  onNoteCreate,
  onDrawingCreate,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onProjectRestore,
  onFileDelete,
  onNoteDelete,
  onDrawingDelete,
  onFileRestore,
  onNoteRestore,
  onDrawingRestore,
  onFilePermanentDelete,
  onNotePermanentDelete,
  onDrawingPermanentDelete,
  onProjectPermanentDelete,
  onFileUpdate,
  onNoteUpdate,
  onDrawingUpdate,
  onLogout,
  saveStatus,
  onMoveFileToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  ...props
}: AppSidebarProps) {
  const [isGlobalFileDialogOpen, setIsGlobalFileDialogOpen] = React.useState(false)
  const [newFileName, setNewFileName] = React.useState("")
  const [newFileType, setNewFileType] = React.useState<'erd' | 'notes' | 'drawings'>('erd')
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("none")

  const handleGlobalFileCreate = () => {
    if (newFileName.trim()) {
      const projectId = selectedProjectId === "none" ? null : parseInt(selectedProjectId)
      if (newFileType === 'erd') {
        onFileCreate(newFileName.trim(), projectId)
        onViewChange('erd')
      } else if (newFileType === 'notes') {
        onNoteCreate(newFileName.trim(), projectId)
        onViewChange('notes')
      } else if (newFileType === 'drawings') {
        onDrawingCreate(newFileName.trim(), projectId)
        onViewChange('drawings')
      }
      setNewFileName("")
      setIsGlobalFileDialogOpen(false)
    }
  }
  // Navigation items for the main section
  const navMain = [
    {
      title: "Notes",
      url: "#",
      icon: StickyNote,
      isActive: view === 'notes',
      onClick: () => onViewChange('notes'),
    },
    {
      title: "ERD Builder",
      url: "#",
      icon: Database,
      isActive: view === 'erd',
      onClick: () => onViewChange('erd'),
    },
    {
      title: "Drawings",
      url: "#",
      icon: PenTool,
      isActive: view === 'drawings',
      onClick: () => onViewChange('drawings'),
    },
  ]

  // Projects navigation
  const navProjects = projects.filter(p => !p.is_deleted).map(project => ({
    id: project.id,
    name: project.name,
    url: "#",
    icon: Folder,
    isActive: activeProjectId === project.id,
  }))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher 
          teams={[
            {
              name: "ERD Pro",
              logo: Database,
              plan: "Workspace",
            }
          ]} 
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Feature</SidebarGroupLabel>
          <SidebarGroupAction title="Create New File" onClick={() => {
            // We can trigger the file dialog in NavProjects or have a separate one here
            // For now, let's just make sure NavProjects can handle it or add a global one.
            // Actually, let's just add a global one in AppSidebar for "Create New File"
            setIsGlobalFileDialogOpen(true)
          }}>
            <Plus />
          </SidebarGroupAction>
          <NavMain items={navMain} />
        </SidebarGroup>
        <NavProjects 
          projects={navProjects} 
          activeProjectId={activeProjectId}
          onProjectSelect={onProjectSelect}
          onProjectDelete={onProjectDelete}
          onProjectUpdate={onProjectUpdate}
          onProjectCreate={onProjectCreate}
          onFileCreate={onFileCreate}
          onNoteCreate={onNoteCreate}
          onDrawingCreate={onDrawingCreate}
          files={files}
          notes={notes}
          drawings={drawings}
          onFileSelect={onFileSelect}
          onNoteSelect={onNoteSelect}
          onDrawingSelect={onDrawingSelect}
          activeFileId={activeFileId}
          activeNoteId={activeNoteId}
          activeDrawingId={activeDrawingId}
          view={view}
          onFileDelete={onFileDelete}
          onNoteDelete={onNoteDelete}
          onDrawingDelete={onDrawingDelete}
          onFileUpdate={onFileUpdate}
          onNoteUpdate={onNoteUpdate}
          onDrawingUpdate={onDrawingUpdate}
          onMoveFileToProject={onMoveFileToProject}
          onMoveNoteToProject={onMoveNoteToProject}
          onMoveDrawingToProject={onMoveDrawingToProject}
          allProjects={projects.filter(p => !p.is_deleted)}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser 
          user={{
            name: "Admin",
            email: "admin@example.com",
            avatar: "",
          }} 
          onLogout={onLogout}
          onViewChange={onViewChange}
        />
      </SidebarFooter>
      <SidebarRail />
      
      <Dialog open={isGlobalFileDialogOpen} onOpenChange={setIsGlobalFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>
              Create a new diagram, note, or drawing in your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Select value={newFileType} onValueChange={(v: any) => setNewFileType(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="erd">ERD Builder</SelectItem>
                  <SelectItem value="notes">Notes</SelectItem>
                  <SelectItem value="drawings">Drawings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="global-filename">Name</Label>
              <Input
                id="global-filename"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="Enter name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="global-project">Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project (Root)</SelectItem>
                  {projects.filter(p => !p.is_deleted).map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGlobalFileDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGlobalFileCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
