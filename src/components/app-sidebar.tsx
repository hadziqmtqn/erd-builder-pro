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
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
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
  sidebarView: 'erd' | 'notes' | 'drawings';
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
  hasMoreProjects?: boolean;
  hasMoreFiles?: boolean;
  hasMoreNotes?: boolean;
  hasMoreDrawings?: boolean;
  onLoadMoreProjects?: () => void;
  onLoadMoreFiles?: () => void;
  onLoadMoreNotes?: () => void;
  onLoadMoreDrawings?: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
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
  sidebarView,
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
  hasMoreProjects,
  hasMoreFiles,
  hasMoreNotes,
  hasMoreDrawings,
  onLoadMoreProjects,
  onLoadMoreFiles,
  onLoadMoreNotes,
  onLoadMoreDrawings,
  searchQuery,
  onSearchChange,
  ...props
}: AppSidebarProps) {
  // Navigation items for the main section
  const navMain = [
    {
      title: "Notes",
      url: "#",
      icon: StickyNote,
      iconClassName: "text-yellow-400",
      isActive: view === 'notes',
      onClick: () => onViewChange('notes'),
    },
    {
      title: "ERD Builder",
      url: "#",
      icon: Database,
      iconClassName: "text-blue-400",
      isActive: view === 'erd',
      onClick: () => onViewChange('erd'),
    },
    {
      title: "Drawings",
      url: "#",
      icon: PenTool,
      iconClassName: "text-purple-400",
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
        <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent className="relative">
            <SidebarInput 
              placeholder={`Search ${sidebarView === 'erd' ? 'diagrams' : sidebarView === 'notes' ? 'notes' : 'drawings'}...`}
              className="pl-8"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none text-muted-foreground" />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:p-0">
          <SidebarGroupLabel>Features</SidebarGroupLabel>
          <NavMain items={navMain} />
        </SidebarGroup>
      </SidebarHeader>
      <SidebarContent>
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
          sidebarView={sidebarView}
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
          searchQuery={searchQuery}
          hasMoreProjects={hasMoreProjects}
          hasMoreFiles={hasMoreFiles}
          hasMoreNotes={hasMoreNotes}
          hasMoreDrawings={hasMoreDrawings}
          onLoadMoreProjects={onLoadMoreProjects}
          onLoadMoreFiles={onLoadMoreFiles}
          onLoadMoreNotes={onLoadMoreNotes}
          onLoadMoreDrawings={onLoadMoreDrawings}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser 
          user={{
            name: "Admin",
            email: import.meta.env.VITE_ADMIN_EMAIL || "admin@example.com",
            avatar: "",
          }} 
          onLogout={onLogout}
          onViewChange={onViewChange}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
