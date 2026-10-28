import { useState } from "react"
import { FolderClosed, FolderOpen, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { MoveToTrashAlert } from "@/components/modals/MoveToTrashAlert"
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
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useProjectFilePage } from "@/hooks/useProjectFilePage"
import { isFileCreator } from "@/lib/fileOwnership"
import { UNASSIGNED_PROJECT } from "@/lib/file-types"
import { ProjectAccessDialog } from "@/components/team/ProjectAccessDialog"
import type { Project } from "@/types"

interface WorkspaceSidebarPanelProps {
  activeTeamId: string | null
  isProjectsLoading?: boolean
  onProjectCreate: (name: string) => void
  onProjectDelete: (id: number | string) => void
  onProjectUpdate: (id: number | string, name: string) => void
  projects: Project[]
  user: any
}

/** Projects group of the single sidebar; a Project opens its file page (COL-008). */
export function WorkspaceSidebarPanel({
  activeTeamId,
  isProjectsLoading,
  onProjectCreate,
  onProjectDelete,
  onProjectUpdate,
  projects,
  user,
}: WorkspaceSidebarPanelProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [editingProject, setEditingProject] = useState<{ id: number | string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [deletingProject, setDeletingProject] = useState<{ id: number | string; name: string } | null>(null)
  const [accessProject, setAccessProject] = useState<{ id: number | string; name: string } | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")

  const activeProjects = projects.filter((project) => !project.is_deleted)
  const openProjectKey = location.pathname.match(/^\/projects\/([^/]+)$/)?.[1]
  const selectedWorkspaceUid = openProjectKey ? decodeURIComponent(openProjectKey) : null
  // Recount when the page changes (not on tab, page or search changes) so the item disappears once the last file gets a Project.
  const { total: unassignedTotal } = useProjectFilePage({ projectId: "null", type: "all", page: 1, perPage: 10 }, location.pathname)
  const hasUnassignedFiles = unassignedTotal > 0
  const handleProjectClick = (uid: string | null | undefined, fallbackId?: number | string) => {
    const key = uid ?? (fallbackId != null ? String(fallbackId) : null)
    if (key) navigate(`/projects/${encodeURIComponent(key)}`)
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <SidebarGroupAction
          title="New Project"
          aria-label="New Project"
          onClick={() => {
            setCreateName("")
            setIsCreateOpen(true)
          }}
        >
          <Plus />
        </SidebarGroupAction>
        <SidebarGroupContent>
          <SidebarMenu>
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
                        isActive={selectedWorkspaceUid === project.uid || selectedWorkspaceUid === String(project.id ?? "")}
                        onClick={() => handleProjectClick(project.uid, project.id)}
                      >
                        <FolderClosed aria-hidden="true" />
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
                            <DropdownMenuContent align="end" className="min-w-44">
                              {activeTeamId && (project.access_role === "owner" || project.access_role === "manager") && (
                                <>
                                  <DropdownMenuItem onClick={() => setAccessProject({ id: project.id, name: project.name })}>
                                    <Users className="size-3.5" aria-hidden="true" />
                                    Manage access
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {isFileCreator(project, user?.id, user?.id === "guest") ? (
                                <>
                                  <DropdownMenuItem onClick={() => {
                                    setRenameValue(project.name)
                                    setEditingProject(project)
                                  }}>
                                    <Pencil className="size-3.5" aria-hidden="true" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeletingProject(project)}>
                                    <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem disabled>Only the creator can rename or delete</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
                {hasUnassignedFiles && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Unassigned"
                      isActive={selectedWorkspaceUid === UNASSIGNED_PROJECT}
                      onClick={() => handleProjectClick(UNASSIGNED_PROJECT)}
                    >
                      <FolderOpen aria-hidden="true" />
                      <span>Unassigned</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <ProjectAccessDialog project={accessProject} onOpenChange={(open) => { if (!open) setAccessProject(null) }} />

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
