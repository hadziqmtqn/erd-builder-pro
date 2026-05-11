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
  MoreHorizontal,
  Pencil,
  Trash2,
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { MoveToTrashAlert } from "@/components/modals/MoveToTrashAlert"

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

  // Rename/delete project dialog state
  const [editingProject, setEditingProject] = useState<{ id: number | string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingProject, setDeletingProject] = useState<{ id: number | string; name: string } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');

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
      onClick: () => onViewChange('erd', true),
    },
    {
      title: "Flowchart",
      url: "#",
      icon: Network,
      iconClassName: "text-green-400",
      isActive: view === 'flowchart',
      onClick: () => onViewChange('flowchart', true),
    },
    {
      title: "Drawings",
      url: "#",
      icon: PenTool,
      iconClassName: "text-purple-400",
      isActive: view === 'drawings',
      onClick: () => onViewChange('drawings', true),
    },
  ];

  // Filtered non-deleted projects
  const activeProjects = projects.filter(p => !p.is_deleted);

  const handleWorkspaceClick = (uid: string | null) => {
    onViewChange(view, true, uid);
  };

  return (
    <>
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
                <TooltipTrigger
                  className="hover:bg-muted hover:text-foreground rounded-md p-0.5 cursor-pointer"
                  onClick={() => {
                    setCreateName('');
                    setIsCreateOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="right">Create Workspace</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {/* "All" option + project list */}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="All Workspaces"
                  isActive={selectedWorkspaceUid === null}
                  onClick={() => handleWorkspaceClick(null)}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span>All Workspaces</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

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
                  <SidebarMenuItem key={project.uid ?? project.id}>
                    <SidebarMenuButton
                      tooltip={project.name}
                      isActive={selectedWorkspaceUid === project.uid}
                      onClick={() => handleWorkspaceClick(project.uid ?? null)}
                    >
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1 text-left">{project.name}</span>
                      {/* Three-dots menu */}
                      <span onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger nativeButton={false} render={
                            <span className="p-1 rounded hover:bg-accent/50 cursor-pointer inline-flex items-center justify-center">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </span>
                          } />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setRenameValue(project.name);
                              setEditingProject(project);
                            }}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeletingProject(project)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2 text-destructive" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {isInstallable && (
          <div className={cn("px-3 mb-2", isCollapsed && "px-0 flex justify-center")}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  className={cn(
                    "inline-flex items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                    "border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-all duration-300",
                    isCollapsed ? "size-9 p-0 justify-center" : "w-full justify-start gap-2 h-9 px-2.5"
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
      {/* Rename Workspace Dialog */}
      <Dialog open={editingProject !== null} onOpenChange={(open) => { if (!open) setEditingProject(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Workspace</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <label htmlFor="rename-project-input" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Name
              </label>
              <input
                id="rename-project-input"
                type="text"
                className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameValue.trim() && editingProject) {
                    onProjectUpdate(editingProject.id, renameValue.trim());
                    setEditingProject(null);
                  }
                }}
                autoFocus
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="h-9" />}>
              Cancel
            </DialogClose>
            <Button
              className="h-9 px-6"
              disabled={!renameValue.trim()}
              onClick={() => {
                if (editingProject && renameValue.trim()) {
                  onProjectUpdate(editingProject.id, renameValue.trim());
                  setEditingProject(null);
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Workspace Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <label htmlFor="create-project-input" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Name
              </label>
              <input
                id="create-project-input"
                type="text"
                className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && createName.trim()) {
                    onProjectCreate(createName.trim());
                    setIsCreateOpen(false);
                    setCreateName('');
                  }
                }}
                autoFocus
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="h-9" />}>
              Cancel
            </DialogClose>
            <Button
              className="h-9 px-6"
              disabled={!createName.trim()}
              onClick={() => {
                if (createName.trim()) {
                  onProjectCreate(createName.trim());
                  setIsCreateOpen(false);
                  setCreateName('');
                }
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Confirmation */}
      <MoveToTrashAlert
        isOpen={deletingProject !== null}
        onOpenChange={(open) => { if (!open) setDeletingProject(null); }}
        mode="move-to-trash"
        view="project"
        activeDocument={deletingProject ? { id: deletingProject.id, name: deletingProject.name } : undefined}
        deleteProject={onProjectDelete}
        onAfterDelete={() => setDeletingProject(null)}
      />
    </>
  );
});
