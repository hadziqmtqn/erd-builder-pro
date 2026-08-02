import * as React from "react"
import { useState, useRef, useEffect } from "react"
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
  ArrowUpRight,
  Loader2,
  ChevronDown,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { Project, AppView } from "../types"
import { SponsorCarousel } from "@/components/SponsorCarousel"

function getSearchShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl+K";
  const platform = navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad/i.test(platform) ? "⌘K" : "Ctrl+K";
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[];
  view: AppView;
  activeFeatureView: AppView | null;
  globalSearchResults: any[];
  isGlobalSearchLoading: boolean;
  onGlobalSearchResultSelect: (result: any) => void;
  onViewChange: (view: AppView, showTable?: boolean, workspaceUid?: string | null) => void;
  onNoteSelect: (uid: string) => void;
  onDrawingSelect: (uid: string) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number | string, name: string) => void;
  onProjectDelete: (id: number | string) => void;
  onLogout: () => void;
  onWorkspaceFilter: (uid: string | null) => void;
  selectedWorkspaceUid: string | null;
  globalSearchQuery: string;
  onGlobalSearchChange: (query: string) => void;
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
  activeFeatureView,
  globalSearchResults,
  isGlobalSearchLoading,
  onGlobalSearchResultSelect,
  onViewChange,
  onNoteSelect,
  onDrawingSelect,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onLogout,
  onWorkspaceFilter,
  selectedWorkspaceUid,
  globalSearchQuery: searchQuery,
  onGlobalSearchChange: onSearchChange,
  isProjectsLoading,
  user,
  isOnline,
  onOpenFeedback,
  ...props
}: AppSidebarProps) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchShortcutLabel] = useState(getSearchShortcutLabel);
  const searchShortcutKeys = searchShortcutLabel === '⌘K' ? ['⌘', 'K'] : ['Ctrl', 'K'];
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const searchFilterOptions = [
    { value: 'all', label: 'All' },
    { value: 'workspace', label: 'Workspaces' },
    { value: 'erd', label: 'ERD' },
    { value: 'notes', label: 'Notes' },
    { value: 'flowchart', label: 'Flowcharts' },
    { value: 'drawings', label: 'Drawings' },
  ];
  const visibleSearchResults = searchFilter === 'all'
    ? globalSearchResults
    : globalSearchResults.filter((result: any) => result.type === searchFilter);
  const activeSearchFilter = searchFilterOptions.find((option) => option.value === searchFilter) || searchFilterOptions[0];

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (isSearchOpen) {
      window.setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 0);
    }
  }, [isSearchOpen]);

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
      isActive: activeFeatureView === 'notes',
      onClick: () => onViewChange('notes', true),
    },
    {
      title: "ERD Builder",
      url: "#",
      icon: Database,
      iconClassName: "text-blue-400",
      isActive: activeFeatureView === 'erd',
      onClick: () => onViewChange('erd', true),
    },
    {
      title: "Flowchart",
      url: "#",
      icon: Network,
      iconClassName: "text-green-400",
      isActive: activeFeatureView === 'flowchart',
      onClick: () => onViewChange('flowchart', true),
    },
    {
      title: "Drawings",
      url: "#",
      icon: PenTool,
      iconClassName: "text-purple-400",
      isActive: activeFeatureView === 'drawings',
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
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              disabled={!isOnline}
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-accent/40 disabled:pointer-events-none disabled:opacity-50"
            >
              <Search className="size-4 shrink-0" />
              <span className="flex-1">Search</span>
              <span className="flex items-center gap-0.5">
                {searchShortcutKeys.map((key) => (
                  <kbd key={key} className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{key}</kbd>
                ))}
              </span>
            </button>
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
      <Dialog open={isSearchOpen} onOpenChange={(open) => {
        setIsSearchOpen(open);
        if (!open) {
          setIsFilterOpen(false);
          setSearchFilter('all');
          onSearchChange('');
        }
      }}>
        <DialogContent size="2xl" showCloseButton={false} className="top-[27%] sm:max-w-2xl">
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search"
              aria-label="Global search"
              className="h-9 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/70"
            />
            <kbd className="rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">ESC</kbd>
          </div>
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Filter:</span>
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium hover:bg-accent"
                  />
                }
              >
                {activeSearchFilter.label}
                <ChevronDown className={`size-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-44 p-1.5">
                {searchFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => { setSearchFilter(option.value); setIsFilterOpen(false); }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm ${searchFilter === option.value ? 'bg-accent font-medium' : 'hover:bg-accent/60'}`}
                  >
                    {option.label}
                    {searchFilter === option.value && <span aria-hidden="true">✓</span>}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          {(isGlobalSearchLoading || searchQuery.trim().length >= 2) && (
            <div className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">
              {isGlobalSearchLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Searching...
                </div>
              ) : visibleSearchResults.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No results found.</p>
              ) : (
                visibleSearchResults.map((result: any) => (
                  <button
                    key={`${result.type}-${result.uid ?? result.id}`}
                    type="button"
                    onClick={() => { onGlobalSearchResultSelect(result); setIsSearchOpen(false); }}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      {result.type === 'workspace' ? <Folder className="size-4 text-primary" />
                        : result.type === 'erd' ? <Database className="size-4 text-blue-400" />
                          : result.type === 'notes' ? <FileText className="size-4 text-yellow-400" />
                            : result.type === 'flowchart' ? <Network className="size-4 text-green-400" />
                              : <PenTool className="size-4 text-purple-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{result.name || '(Untitled)'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {result.type === 'workspace' ? 'Workspace' : result.type === 'erd' ? 'ERD' : result.type === 'flowchart' ? 'Flowchart' : result.type === 'notes' ? 'Note' : 'Drawing'}
                        {result.workspace?.name && ` · ${result.workspace.name}`}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 group-hover:text-primary" />
                  </button>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
