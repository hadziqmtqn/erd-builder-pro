import * as React from "react"
import { useState, useEffect, useRef } from "react"
import pkg from "../../package.json"
import {
  Database,
  StickyNote,
  PenTool,
  Folder,
  Search,
  Network,
  Sparkles,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import { FeedbackDialog } from "@/components/FeedbackDialog"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { Diagram, Project, Note, Drawing, Flowchart } from "../types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  diagrams: Diagram[];
  notes: Note[];
  drawings: Drawing[];
  flowcharts: Flowchart[];
  projects: Project[];
  activeDiagramId: number | string | null;
  activeNoteId: number | string | null;
  activeDrawingId: number | string | null;
  activeFlowchartId: number | string | null;
  activeProjectId: number | string | null;
  view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog';
  sidebarView: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'changelog';
  onViewChange: (view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog') => void;
  onDiagramSelect: (id: number | string) => void;
  onNoteSelect: (id: number | string) => void;
  onDrawingSelect: (id: number | string) => void;
  onFlowchartSelect: (id: number | string) => void;
  onProjectSelect: (id: number | string | null) => void;
  onDiagramCreate: (name: string, projectId?: number | string | null) => void;
  onNoteCreate: (title: string, projectId?: number | string | null) => void;
  onDrawingCreate: (title: string, projectId?: number | string | null) => void;
  onFlowchartCreate: (title: string, projectId?: number | string | null) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number | string, name: string) => void;
  onProjectDelete: (id: number | string) => void;
  onDiagramDelete: (id: number | string) => void;
  onNoteDelete: (id: number | string) => void;
  onDrawingDelete: (id: number | string) => void;
  onFlowchartDelete: (id: number | string) => void;
  onDiagramUpdate: (id: number | string, name: string) => void;
  onNoteUpdate: (id: number | string, title: string) => void;
  onDrawingUpdate: (id: number | string, title: string) => void;
  onFlowchartUpdate: (id: number | string, title: string) => void;
  onLogout: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onMoveDiagramToProject: (diagramId: number | string, projectId: number | string | null) => void;
  onMoveNoteToProject: (noteId: number | string, projectId: number | string | null) => void;
  onMoveDrawingToProject: (drawingId: number | string, projectId: number | string | null) => void;
  onMoveFlowchartToProject: (flowchartId: number | string, projectId: number | string | null) => void;

  hasMoreProjects?: boolean;
  hasMoreDiagrams?: boolean;
  hasMoreNotes?: boolean;
  hasMoreDrawings?: boolean;
  hasMoreFlowcharts?: boolean;
  onLoadMoreProjects?: () => void;
  onLoadMoreDiagrams?: () => void;
  onLoadMoreNotes?: () => void;
  onLoadMoreDrawings?: () => void;
  onLoadMoreFlowcharts?: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isInstallable?: boolean;
  onInstall?: () => void;
  isProjectsLoading?: boolean;
  isDiagramsLoading?: boolean;
  isNotesLoading?: boolean;
  isDrawingsLoading?: boolean;
  isFlowchartsLoading?: boolean;
  isTrashLoading?: boolean;
}

export function AppSidebar({
  diagrams,
  notes,
  drawings,
  flowcharts,
  projects,
  activeDiagramId,
  activeNoteId,
  activeDrawingId,
  activeFlowchartId,
  activeProjectId,
  view,
  sidebarView,
  onViewChange,
  onDiagramSelect,
  onNoteSelect,
  onDrawingSelect,
  onFlowchartSelect,
  onProjectSelect,
  onDiagramCreate,
  onNoteCreate,
  onDrawingCreate,
  onFlowchartCreate,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onDiagramDelete,
  onNoteDelete,
  onDrawingDelete,
  onFlowchartDelete,
  onDiagramUpdate,
  onNoteUpdate,
  onDrawingUpdate,
  onFlowchartUpdate,
  onLogout,
  saveStatus,
  onMoveDiagramToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  onMoveFlowchartToProject,
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
  searchQuery,
  onSearchChange,
  user,
  isOnline,
  isInstallable,
  onInstall,
  isProjectsLoading,
  isDiagramsLoading,
  isNotesLoading,
  isDrawingsLoading,
  isFlowchartsLoading,
  isTrashLoading,
  ...props
}: AppSidebarProps) {
  const { state, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = useState(false);

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
    isActive: activeProjectId !== null && String(activeProjectId) === String(project.id),
  }))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher 
          teams={[
            {
              name: "ERD Builder Pro",
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
          onDiagramCreate={onDiagramCreate}
          onNoteCreate={onNoteCreate}
          onDrawingCreate={onDrawingCreate}
          onFlowchartCreate={onFlowchartCreate}
          diagrams={diagrams}
          notes={notes}
          drawings={drawings}
          flowcharts={flowcharts}
          onDiagramSelect={onDiagramSelect}
          onNoteSelect={onNoteSelect}
          onDrawingSelect={onDrawingSelect}
          onFlowchartSelect={onFlowchartSelect}
          activeDiagramId={activeDiagramId}
          activeNoteId={activeNoteId}
          activeDrawingId={activeDrawingId}
          activeFlowchartId={activeFlowchartId}
          view={view}
          sidebarView={sidebarView}
          onDiagramDelete={onDiagramDelete}
          onNoteDelete={onNoteDelete}
          onDrawingDelete={onDrawingDelete}
          onFlowchartDelete={onFlowchartDelete}
          onDiagramUpdate={onDiagramUpdate}
          onNoteUpdate={onNoteUpdate}
          onDrawingUpdate={onDrawingUpdate}
          onFlowchartUpdate={onFlowchartUpdate}
          onMoveDiagramToProject={onMoveDiagramToProject}
          onMoveNoteToProject={onMoveNoteToProject}
          onMoveDrawingToProject={onMoveDrawingToProject}
          onMoveFlowchartToProject={onMoveFlowchartToProject}
          allProjects={projects.filter(p => !p.is_deleted)}
          searchQuery={searchQuery}
          hasMoreProjects={hasMoreProjects}
          hasMoreDiagrams={hasMoreDiagrams}
          hasMoreNotes={hasMoreNotes}
          hasMoreDrawings={hasMoreDrawings}
          hasMoreFlowcharts={hasMoreFlowcharts}
          onLoadMoreProjects={onLoadMoreProjects}
          onLoadMoreDiagrams={onLoadMoreDiagrams}
          onLoadMoreNotes={onLoadMoreNotes}
          onLoadMoreDrawings={onLoadMoreDrawings}
          onLoadMoreFlowcharts={onLoadMoreFlowcharts}
          isOnline={isOnline}
          isProjectsLoading={isProjectsLoading}
          isDiagramsLoading={isDiagramsLoading}
          isNotesLoading={isNotesLoading}
          isDrawingsLoading={isDrawingsLoading}
          isFlowchartsLoading={isFlowchartsLoading}
        />
      </SidebarContent>
      <SidebarFooter>
        {isInstallable && (
          <div className={cn("px-3 mb-2", isCollapsed && "px-0 flex justify-center")}>
            <Tooltip>
              <TooltipTrigger render={
                <Button 
                  variant="outline" 
                  size={isCollapsed ? "icon" : "sm"} 
                  className={cn(
                    "border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-all duration-300",
                    isCollapsed ? "size-9 p-0" : "w-full justify-start gap-2 h-9"
                  )}
                  onClick={onInstall}
                >
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Database className="w-4 h-4" />
                  </motion.div>
                  {!isCollapsed && <span>Install App</span>}
                </Button>
              } />
              {isCollapsed && (
                <TooltipContent side="right">
                  Install App
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        )}
        <NavUser 
          user={user} 
          onLogout={onLogout}
          onViewChange={onViewChange}
          isOnline={isOnline}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
