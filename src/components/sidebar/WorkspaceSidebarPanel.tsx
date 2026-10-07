import { useState } from "react"
import { FolderClosed, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"

import { MoveToTrashAlert } from "@/components/modals/MoveToTrashAlert"
import { SponsorCarousel } from "@/components/SponsorCarousel"
import { TeamSwitcher, type SwitcherTeam } from "@/components/team-switcher"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
} from "@/components/ui/sidebar"
import { isFileCreator } from "@/lib/fileOwnership"
import { SpotlightSearch } from "@/components/sidebar/SpotlightSearch"
import type { Project } from "@/types"

interface WorkspaceSidebarPanelProps {
  activeTeamId: string | null
  globalSearchQuery: string
  globalSearchResults: any[]
  isGlobalSearchLoading: boolean
  isOnline: boolean
  isProjectsLoading?: boolean
  onGlobalSearchChange: (query: string) => void
  onGlobalSearchResultSelect: (result: any) => void
  onTeamAdd: () => void
  onTeamManage: (team: SwitcherTeam) => void
  onTeamSelect: (teamId: string | null) => void
  onTeamsRefresh: () => void
  onProjectCreate: (name: string) => void
  onProjectDelete: (id: number | string) => void
  onProjectUpdate: (id: number | string, name: string) => void
  onWorkspaceFilter: (uid: string | null) => void
  projects: Project[]
  selectedWorkspaceUid: string | null
  showDbClient: boolean
  showSponsor: boolean
  teams: SwitcherTeam[]
  teamsAvailable: boolean
  user: any
}

export function WorkspaceSidebarPanel({
  activeTeamId,
  globalSearchQuery,
  globalSearchResults,
  isGlobalSearchLoading,
  isOnline,
  isProjectsLoading,
  onGlobalSearchChange,
  onGlobalSearchResultSelect,
  onTeamAdd,
  onTeamManage,
  onTeamSelect,
  onTeamsRefresh,
  onProjectCreate,
  onProjectDelete,
  onProjectUpdate,
  onWorkspaceFilter,
  projects,
  selectedWorkspaceUid,
  showDbClient,
  showSponsor,
  teams,
  teamsAvailable,
  user,
}: WorkspaceSidebarPanelProps) {
  const [editingProject, setEditingProject] = useState<{ id: number | string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [deletingProject, setDeletingProject] = useState<{ id: number | string; name: string } | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")

  const activeProjects = projects.filter((project) => !project.is_deleted)
  const handleProjectClick = (uid: string | null | undefined, fallbackId?: number | string) => {
    onWorkspaceFilter(uid ?? (fallbackId != null ? String(fallbackId) : null))
  }

  return (
    <>
      <Sidebar collapsible="none" className="min-w-0 flex-1">
        <SidebarHeader className="gap-3.5 border-b border-sidebar-border p-4">
          <div className="flex w-full items-center gap-2">
            <div className="min-w-0 flex-1">
              <TeamSwitcher
                teams={teams}
                activeTeamId={activeTeamId}
                enabled={teamsAvailable || teams.length > 0}
                canManageTeams={Boolean(user?.isSuperAdmin || user?.is_super_admin)}
                onOpen={onTeamsRefresh}
                onSelect={onTeamSelect}
                onAdd={onTeamAdd}
                onManage={onTeamManage}
              />
            </div>
            <SpotlightSearch
              query={globalSearchQuery}
              results={globalSearchResults}
              isLoading={isGlobalSearchLoading}
              isOnline={isOnline}
              showDbClient={showDbClient}
              onQueryChange={onGlobalSearchChange}
              onResultSelect={onGlobalSearchResultSelect}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-9 w-full justify-start gap-2"
            onClick={() => {
              setCreateName("")
              setIsCreateOpen(true)
            }}
          >
            <Plus className="size-4" />
            New Project
          </Button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="px-0">
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="All Projects"
                    isActive={selectedWorkspaceUid === null || selectedWorkspaceUid === ""}
                    onClick={() => handleProjectClick(null)}
                  >
                    <FolderClosed className="size-4 shrink-0" aria-hidden="true" />
                    <span>All Projects</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {isProjectsLoading ? (
                  <div className="px-4 py-2 text-xs text-muted-foreground animate-pulse">
                    Loading projects...
                  </div>
                ) : activeProjects.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-muted-foreground">
                    No projects yet
                  </div>
                ) : (
                  activeProjects.map((project) => (
                    <SidebarMenuItem key={project.uid ?? project.id}>
                      <SidebarMenuButton
                        tooltip={project.name}
                        isActive={selectedWorkspaceUid === project.uid || String(selectedWorkspaceUid ?? "") === String(project.id ?? "")}
                        onClick={() => handleProjectClick(project.uid, project.id)}
                      >
                        <FolderClosed className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                        <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={`Project options for ${project.name}`}
                                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setRenameValue(project.name)
                                setEditingProject(project)
                              }}>
                                <Pencil className="size-3.5" aria-hidden="true" />
                                Rename
                              </DropdownMenuItem>
                              {isFileCreator(project, user?.id, user?.id === "guest") && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeletingProject(project)}>
                                    <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
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

        {showSponsor && (
          <SidebarFooter className="shrink-0 border-t border-sidebar-border p-2">
            <SponsorCarousel />
          </SidebarFooter>
        )}
      </Sidebar>

      <Dialog open={editingProject !== null} onOpenChange={(open) => { if (!open) setEditingProject(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rename Project</DialogTitle></DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="rename-project-input">Name</FieldLabel>
              <Input
                id="rename-project-input"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && renameValue.trim() && editingProject) {
                    onProjectUpdate(editingProject.id, renameValue.trim())
                    setEditingProject(null)
                  }
                }}
                autoFocus
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="h-9" />}>Cancel</DialogClose>
            <Button
              className="h-9 px-6"
              disabled={!renameValue.trim()}
              onClick={() => {
                if (editingProject && renameValue.trim()) {
                  onProjectUpdate(editingProject.id, renameValue.trim())
                  setEditingProject(null)
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Create Project</DialogTitle></DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="create-project-input">Project name</FieldLabel>
              <Input
                id="create-project-input"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && createName.trim()) {
                    onProjectCreate(createName.trim())
                    setIsCreateOpen(false)
                    setCreateName("")
                  }
                }}
                autoFocus
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="h-9" />}>Cancel</DialogClose>
            <Button
              className="h-9 px-6"
              disabled={!createName.trim()}
              onClick={() => {
                if (createName.trim()) {
                  onProjectCreate(createName.trim())
                  setIsCreateOpen(false)
                  setCreateName("")
                }
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveToTrashAlert
        isOpen={deletingProject !== null}
        onOpenChange={(open) => { if (!open) setDeletingProject(null) }}
        mode="move-to-trash"
        view="project"
        activeDocument={deletingProject ? { id: deletingProject.id, name: deletingProject.name } : undefined}
        deleteProject={onProjectDelete}
        onAfterDelete={() => setDeletingProject(null)}
      />
    </>
  )
}
