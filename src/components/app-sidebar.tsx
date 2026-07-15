import * as React from "react"
import { useState, useRef } from "react"
import {
  Database,
  PenTool,
  Search,
  Network,
  Folder,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
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

import { Project, AppView } from "../types"
import { SponsorCarousel } from "@/components/SponsorCarousel"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[];
  view: AppView;
  onViewChange: (view: AppView, showTable?: boolean, workspaceUid?: string | null) => void;
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
  onOpenFeedback: () => void;
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
  isProjectsLoading,
  user,
  isOnline,
  onOpenFeedback,
  ...props
}: AppSidebarProps) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Rename/delete project dialog state
  const [editingProject, setEditingProject] = useState<{ id: number | string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingProject, setDeletingProject] = useState<{ id: number | string; name: string } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');

  // Navigation items for the feature section
  const navMain = [
    {
      title: "Notes",
      url: "#",
      icon: FileText,
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

  const handleWorkspaceClick = (uid: string | null | undefined, fallbackId?: number | string) => {
    const id = uid ?? (fallbackId != null ? String(fallbackId) : null);
    onViewChange(view, true, id);
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
              placeholder="search workspace"
              className="pl-8"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={!isOnline}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none text-muted-foreground transition-opacity group-disabled:opacity-50" />
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
        <SidebarGroup className="px-4 group-data-[collapsible=icon]:p-2">
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
                  isActive={selectedWorkspaceUid === null || selectedWorkspaceUid === ''}
                  onClick={() => handleWorkspaceClick(null)}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span>All Workspaces</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isProjectsLoading ? (
                <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse group-data-[collapsible=icon]:hidden">
                  Loading workspaces...
                </div>
              ) : activeProjects.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  No workspaces yet
                </div>
              ) : (
                activeProjects.map(project => (
                  <SidebarMenuItem key={project.uid ?? project.id}>
                    <SidebarMenuButton
                      tooltip={project.name}
                      isActive={selectedWorkspaceUid === project.uid || String(selectedWorkspaceUid ?? '') === String(project.id ?? '')}
                      onClick={() => handleWorkspaceClick(project.uid, project.id)}
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
        {/* Sponsor carousel — auto-rotate */}
        <SponsorCarousel isCollapsed={isCollapsed} />
        <NavUser 
          user={user} 
          onLogout={onLogout}
          onViewChange={onViewChange}
          isOnline={isOnline}
          onOpenFeedback={onOpenFeedback}
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
            <Field>
              <FieldLabel htmlFor="rename-project-input" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                Name
              </FieldLabel>
              <Input
                id="rename-project-input"
                type="text"
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
            </Field>
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
            <Field>
              <FieldLabel htmlFor="create-project-input" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                Name
              </FieldLabel>
              <Input
                id="create-project-input"
                type="text"
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
            </Field>
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
