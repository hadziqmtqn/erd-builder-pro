import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogBody
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
import { Field, FieldLabel } from "@/components/ui/field"
import { AlertTriangle } from "lucide-react"
import { Project } from "../../../types"

interface SidebarModalsProps {
  // Project Dialog
  isProjectDialogOpen: boolean
  setIsProjectDialogOpen: (open: boolean) => void
  editingProjectId: number | string | null
  setEditingProjectId: (id: number | string | null) => void
  editingProjectName: string
  setEditingProjectName: (name: string) => void
  projectName: string
  setProjectName: (name: string) => void
  handleCreateProject: () => void
  onProjectUpdate: (id: number | string, name: string) => void
  
  // File Dialog
  isFileDialogOpen: boolean
  setIsFileDialogOpen: (open: boolean) => void
  sidebarView: string
  fileName: string
  setFileName: (name: string) => void
  selectedProjectId: string
  setSelectedProjectId: (id: string) => void
  allProjects: Project[]
  handleCreateFile: () => void
  
  // Edit File Dialog
  isEditFileDialogOpen: boolean
  setIsEditFileDialogOpen: (open: boolean) => void
  editingFile: { id: number | string, name: string, projectId: number | string | null, type: string } | null
  setEditingFile: React.Dispatch<React.SetStateAction<any>>
  handleUpdateFile: () => void
  
  // Delete Confirm
  isDeleteConfirmOpen: boolean
  setIsDeleteConfirmOpen: (open: boolean) => void
  handleDeleteConfirm: () => void
  
  // Project Delete Confirm
  isProjectDeleteConfirmOpen: boolean
  setIsProjectDeleteConfirmOpen: (open: boolean) => void
  deletingProject: { id: number | string, name: string } | null
  setDeletingProject: (project: any) => void
  onProjectDelete: (id: number | string) => void
}

export function SidebarModals({
  isProjectDialogOpen,
  setIsProjectDialogOpen,
  editingProjectId,
  setEditingProjectId,
  editingProjectName,
  setEditingProjectName,
  projectName,
  setProjectName,
  handleCreateProject,
  onProjectUpdate,
  
  isFileDialogOpen,
  setIsFileDialogOpen,
  sidebarView,
  fileName,
  setFileName,
  selectedProjectId,
  setSelectedProjectId,
  allProjects,
  handleCreateFile,
  
  isEditFileDialogOpen,
  setIsEditFileDialogOpen,
  editingFile,
  setEditingFile,
  handleUpdateFile,
  
  isDeleteConfirmOpen,
  setIsDeleteConfirmOpen,
  handleDeleteConfirm,
  
  isProjectDeleteConfirmOpen,
  setIsProjectDeleteConfirmOpen,
  deletingProject,
  setDeletingProject,
  onProjectDelete
}: SidebarModalsProps) {
  return (
    <>
      {/* Project Dialog */}
      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProjectId !== null ? 'Rename Project' : 'Create New Project'}</DialogTitle>
            <DialogDescription>
              {editingProjectId !== null ? 'Enter a new name for your project.' : 'Enter a name for your new project to organize your files.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                value={editingProjectId !== null ? editingProjectName : projectName}
                onChange={(e) => editingProjectId !== null ? setEditingProjectName(e.target.value) : setProjectName(e.target.value)}
                placeholder="Project name"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsProjectDialogOpen(false)
              setEditingProjectId(null)
            }}>Cancel</Button>
            <Button onClick={() => {
              if (editingProjectId !== null) {
                if (editingProjectName.trim()) {
                  onProjectUpdate(editingProjectId, editingProjectName.trim())
                  setEditingProjectId(null)
                  setIsProjectDialogOpen(false)
                }
              } else {
                handleCreateProject()
              }
            }}>{editingProjectId !== null ? 'Save Changes' : 'Create Project'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File/Note/Drawing Dialog */}
      <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New {sidebarView === 'erd' ? 'Diagram' : sidebarView === 'notes' ? 'Note' : sidebarView === 'flowchart' ? 'Flowchart' : 'Drawing'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field>
              <FieldLabel htmlFor="filename">
                Name
              </FieldLabel>
              <Input
                id="filename"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Enter name"
                className="h-9"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project">
                Project
              </FieldLabel>
              <Select value={selectedProjectId} onValueChange={(val) => setSelectedProjectId(val ?? "")}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue>
                    {selectedProjectId === "none" ? "No Project (Root)" : allProjects.find(p => p.id.toString() === selectedProjectId)?.name || "Select a project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project (Root)</SelectItem>
                  {allProjects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFileDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFile}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit File Dialog */}
      <Dialog open={isEditFileDialogOpen} onOpenChange={setIsEditFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingFile?.type === 'erd' ? 'Diagram' : editingFile?.type === 'notes' ? 'Note' : editingFile?.type === 'flowchart' ? 'Flowchart' : 'Drawing'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field>
              <FieldLabel htmlFor="edit-filename">
                Name
              </FieldLabel>
              <Input
                id="edit-filename"
                value={editingFile?.name || ""}
                onChange={(e) => setEditingFile((prev: any) => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="Enter name"
                className="h-9"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-project">
                Project
              </FieldLabel>
              <Select value={selectedProjectId} onValueChange={(val) => setSelectedProjectId(val ?? "")}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue>
                    {selectedProjectId === "none" ? "No Project (Root)" : allProjects.find(p => p.id.toString() === selectedProjectId)?.name || selectedProjectId}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project (Root)</SelectItem>
                  {allProjects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditFileDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateFile}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-[400px]" showCloseButton={false}>
          <DialogHeader className="flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle className="text-xl text-center">Move to Trash?</DialogTitle>
          </DialogHeader>
          <DialogBody className="text-center">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to move this item to the trash?
              <br />
              You can restore it at any time from the Trash Bin.
            </p>
          </DialogBody>
          <DialogFooter className="sm:justify-center flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)} className="mt-0 w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} className="w-full sm:w-auto">Move to Trash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Delete Confirmation Dialog */}
      <Dialog open={isProjectDeleteConfirmOpen} onOpenChange={setIsProjectDeleteConfirmOpen}>
        <DialogContent className="max-w-[400px]" showCloseButton={false}>
          <DialogHeader className="flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle className="text-xl text-center">Move Project to Trash?</DialogTitle>
          </DialogHeader>
          <DialogBody className="text-center">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to move the project "{deletingProject?.name}" to the trash?
              <br />
              This will also move all associated <strong>Diagrams, Notes, Drawings, and Flowcharts</strong>.
            </p>
          </DialogBody>
          <DialogFooter className="sm:justify-center flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsProjectDeleteConfirmOpen(false)} className="mt-0 w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (deletingProject) {
                onProjectDelete(deletingProject.id)
                setIsProjectDeleteConfirmOpen(false)
                setDeletingProject(null)
              }
            }} className="w-full sm:w-auto">Move Project to Trash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
