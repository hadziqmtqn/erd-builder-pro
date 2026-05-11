import * as React from "react"
import { useState, useEffect, useRef } from "react"
import {
  Database,
  StickyNote,
  PenTool,
  Search,
  Network,
  Folder,
  Plus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
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
  TooltipProvider,
} from "@/components/ui/tooltip"

import { Project } from "../types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[];
  view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog' | 'backups';
  onViewChange: (view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog' | 'backups', showTable?: boolean, workspaceUid?: string | null) => Promise<void>;
  onNoteSelect: (uid: string) => void;
  onDrawingSelect: (uid: string) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number | string, name: string) => void;
  onProjectDelete: (id: number | string) => void;
  onLogout: () => void;
  onWorkspaceFilter: (uid: string | null) => void;
  selectedWorkspaceUid: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isInstallable?: boolean;
  onInstall?: () => void;
  isProjectsLoading?: boolean;
  user: any;
  isOnline: boolean;
}

export const AppSidebar = React.memo(({
  projects,
  view,
  onViewChange,
  onNoteSelect,
  onDrawingSelect,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onLogout,
  onWorkspaceFilter,
  selectedWorkspaceUid,
  searchQuery,
  onSearchChange,
  isInstallable,
  onInstall,
  isProjectsLoading,
  user,
  isOnline,
  ...props
}: AppSidebarProps) => {
  const { state, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsMac(userAgent.includes('mac') || userAgent.includes('iphone') || userAgent.includes('ipad'));

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (state === "collapsed") setOpen(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, setOpen]);

  // Navigation items for the feature section
  const navMain = [
    {
      title: "Notes",
      url: "#",
      icon: StickyNote,
      iconClassName: "text-yellow-400",
      isActive: view === 'notes',
      onClick: () => onViewChange('notes', true),
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
  ];

  // Filtered non-deleted projects
  const activeProjects = projects.filter(p => !p.is_deleted);

  const handleWorkspaceClick = (uid: string | null) => {
    onViewChange('notes', true, uid);
  };

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
              placeholder="Search..."
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
        {/* Workspaces section */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Workspaces</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => {
                      const name = prompt('Workspace name:');
                      if (name?.trim()) onProjectCreate(name.trim());
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Create Workspace</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {/* "All" option (clear filter) */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
                selectedWorkspaceUid === null
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
              onClick={() => handleWorkspaceClick(null)}
            >
              <Folder className="h-4 w-4 shrink-0" />
              <span className="truncate group-data-[collapsible=icon]:hidden">All Workspaces</span>
            </div>

            {/* Project list */}
            {isProjectsLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse">
                Loading workspaces...
              </div>
            ) : activeProjects.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No workspaces yet
              </div>
            ) : (
              activeProjects.map(project => (
                <div
                  key={project.uid ?? project.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors group",
                    selectedWorkspaceUid === project.uid
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                  onClick={() => handleWorkspaceClick(project.uid ?? null)}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="truncate group-data-[collapsible=icon]:hidden flex-1">
                    {project.name}
                  </span>
                </div>
              ))
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {isInstallable && (
          <div className={cn("px-3 mb-2", isCollapsed && "px-0 flex justify-center")}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
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
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right">
                    Install App
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
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
  );
});
