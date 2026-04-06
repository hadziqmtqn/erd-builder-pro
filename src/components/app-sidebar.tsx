import * as React from "react"
import { useState, useEffect, useRef } from "react"
import {
  Database,
  StickyNote,
  PenTool,
  Folder,
  Search,
  Network,
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
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

import { FileData, Project, Note, Drawing, Flowchart } from "../types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  files: FileData[];
  notes: Note[];
  drawings: Drawing[];
  flowcharts: Flowchart[];
  projects: Project[];
  activeFileId: number | null;
  activeNoteId: number | null;
  activeDrawingId: number | null;
  activeFlowchartId: number | null;
  activeProjectId: number | null;
  view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart';
  sidebarView: 'erd' | 'notes' | 'drawings' | 'flowchart';
  onViewChange: (view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart') => void;
  onFileSelect: (id: number) => void;
  onNoteSelect: (id: number) => void;
  onDrawingSelect: (id: number) => void;
  onFlowchartSelect: (id: number) => void;
  onProjectSelect: (id: number | null) => void;
  onFileCreate: (name: string, projectId?: number | null) => void;
  onNoteCreate: (title: string, projectId?: number | null) => void;
  onDrawingCreate: (title: string, projectId?: number | null) => void;
  onFlowchartCreate: (title: string, projectId?: number | null) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number, name: string) => void;
  onProjectDelete: (id: number) => void;
  onFileDelete: (id: number) => void;
  onNoteDelete: (id: number) => void;
  onDrawingDelete: (id: number) => void;
  onFlowchartDelete: (id: number) => void;
  onFileUpdate: (id: number, name: string) => void;
  onNoteUpdate: (id: number, title: string) => void;
  onDrawingUpdate: (id: number, title: string) => void;
  onFlowchartUpdate: (id: number, title: string) => void;
  onLogout: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onMoveFileToProject: (fileId: number, projectId: number | null) => void;
  onMoveNoteToProject: (noteId: number, projectId: number | null) => void;
  onMoveDrawingToProject: (drawingId: number, projectId: number | null) => void;
  onMoveFlowchartToProject: (flowchartId: number, projectId: number | null) => void;
  hasMoreProjects?: boolean;
  hasMoreFiles?: boolean;
  hasMoreNotes?: boolean;
  hasMoreDrawings?: boolean;
  hasMoreFlowcharts?: boolean;
  onLoadMoreProjects?: () => void;
  onLoadMoreFiles?: () => void;
  onLoadMoreNotes?: () => void;
  onLoadMoreDrawings?: () => void;
  onLoadMoreFlowcharts?: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  user: any;
  isOnline: boolean;
}

export function AppSidebar({
  files,
  notes,
  drawings,
  flowcharts,
  projects,
  activeFileId,
  activeNoteId,
  activeDrawingId,
  activeFlowchartId,
  activeProjectId,
  view,
  sidebarView,
  onViewChange,
  onFileSelect,
  onNoteSelect,
  onDrawingSelect,
  onFlowchartSelect,
  onProjectSelect,
  onFileCreate,
  onNoteCreate,
  onDrawingCreate,
  onFlowchartCreate,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onFileDelete,
  onNoteDelete,
  onDrawingDelete,
  onFlowchartDelete,
  onFileUpdate,
  onNoteUpdate,
  onDrawingUpdate,
  onFlowchartUpdate,
  onLogout,
  saveStatus,
  onMoveFileToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  onMoveFlowchartToProject,
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
  searchQuery,
  onSearchChange,
  user,
  isOnline,
  ...props
}: AppSidebarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = useState(false);
  const { setOpen, state } = useSidebar();

  useEffect(() => {
    // Better OS detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsMac(userAgent.includes('mac') || userAgent.includes('iphone') || userAgent.includes('ipad'));

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        
        // Auto-expand if collapsed
        if (state === "collapsed") {
          setOpen(true);
        }

        // Delay focus slightly to allow state transition if needed
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select(); // Select existing text for quick re-search
        }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, setOpen]);
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
      title: "Flowchart",
      url: "#",
      icon: Network,
      iconClassName: "text-green-400",
      isActive: view === 'flowchart',
      onClick: () => onViewChange('flowchart'),
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
              ref={searchInputRef}
              placeholder={`Search ${sidebarView === 'erd' ? 'diagrams' : sidebarView === 'notes' ? 'notes' : 'drawings'}...`}
              className="pl-8 pr-12"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={!isOnline}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none text-muted-foreground transition-opacity group-disabled:opacity-50" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1 opacity-50 group-data-[collapsible=icon]:hidden">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">{isMac ? '⌘' : 'Ctrl'}</span>K
              </kbd>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:p-0">
          <SidebarGroupLabel className="flex items-center justify-between">
            Features
            {!isOnline && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive/10 text-[10px] font-bold text-destructive uppercase tracking-wider">
                <span className="w-1 h-1 rounded-full bg-destructive animate-pulse" />
                Offline
              </span>
            )}
          </SidebarGroupLabel>
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
          onFlowchartCreate={onFlowchartCreate}
          files={files}
          notes={notes}
          drawings={drawings}
          flowcharts={flowcharts}
          onFileSelect={onFileSelect}
          onNoteSelect={onNoteSelect}
          onDrawingSelect={onDrawingSelect}
          onFlowchartSelect={onFlowchartSelect}
          activeFileId={activeFileId}
          activeNoteId={activeNoteId}
          activeDrawingId={activeDrawingId}
          activeFlowchartId={activeFlowchartId}
          view={view}
          sidebarView={sidebarView}
          onFileDelete={onFileDelete}
          onNoteDelete={onNoteDelete}
          onDrawingDelete={onDrawingDelete}
          onFlowchartDelete={onFlowchartDelete}
          onFileUpdate={onFileUpdate}
          onNoteUpdate={onNoteUpdate}
          onDrawingUpdate={onDrawingUpdate}
          onFlowchartUpdate={onFlowchartUpdate}
          onMoveFileToProject={onMoveFileToProject}
          onMoveNoteToProject={onMoveNoteToProject}
          onMoveDrawingToProject={onMoveDrawingToProject}
          onMoveFlowchartToProject={onMoveFlowchartToProject}
          allProjects={projects.filter(p => !p.is_deleted)}
          searchQuery={searchQuery}
          hasMoreProjects={hasMoreProjects}
          hasMoreFiles={hasMoreFiles}
          hasMoreNotes={hasMoreNotes}
          hasMoreDrawings={hasMoreDrawings}
          hasMoreFlowcharts={hasMoreFlowcharts}
          onLoadMoreProjects={onLoadMoreProjects}
          onLoadMoreFiles={onLoadMoreFiles}
          onLoadMoreNotes={onLoadMoreNotes}
          onLoadMoreDrawings={onLoadMoreDrawings}
          onLoadMoreFlowcharts={onLoadMoreFlowcharts}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser 
          user={user} 
          onLogout={onLogout}
          onViewChange={onViewChange}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
