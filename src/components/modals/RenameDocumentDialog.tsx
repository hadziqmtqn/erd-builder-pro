import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner';

interface RenameDocumentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'edit' = rename + move workspace (existing behavior). 'create' = create new document. */
  mode?: 'edit' | 'create';
  view: string;
  activeDocument: any | null;
  newName: string;
  setNewName: (name: string) => void;
  projects: any[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  /** For create mode — called with (title, projectId) when user confirms */
  onCreate?: (title: string, projectId: string | null) => void;
  /** For edit mode */
  updateDiagram?: (id: string | number, name: string, options?: { silent?: boolean }) => void;
  updateNote?: (uid: string, name: string, options?: { silent?: boolean }) => void;
  updateDrawing?: (uid: string, name: string, options?: { silent?: boolean }) => void;
  updateFlowchart?: (uid: string, name: string, options?: { silent?: boolean }) => void;
  onMoveDiagramToProject?: (id: number | string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveNoteToProject?: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveDrawingToProject?: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveFlowchartToProject?: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onRenameSuccess?: () => Promise<void>;
}

const viewLabel = (v: string) =>
  v === 'erd' ? 'diagram' : v === 'notes' ? 'note' : v === 'drawings' ? 'drawing' : 'flowchart';

export const RenameDocumentDialog: React.FC<RenameDocumentDialogProps> = ({
  isOpen,
  onOpenChange,
  mode = 'edit',
  view,
  activeDocument,
  newName,
  setNewName,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  onCreate,
  updateDiagram,
  updateNote,
  updateDrawing,
  updateFlowchart,
  onMoveDiagramToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  onMoveFlowchartToProject,
  onRenameSuccess,
}) => {
  const isCreate = mode === 'create';

  const handleSave = async () => {
    if (!newName.trim()) return;

    if (isCreate) {
      onCreate?.(newName.trim(), selectedProjectId === 'none' ? null : selectedProjectId);
      onOpenChange(false);
      return;
    }

    // Edit mode — existing behavior
    const id = view === 'notes' || view === 'flowchart' || view === 'drawings' ? activeDocument?.uid : activeDocument?.id;
    if (id && newName.trim()) {
      const projectId = selectedProjectId === "none" ? null : selectedProjectId;
      const currentProjectId = activeDocument?.project_id || activeDocument?.projectId;
      const hasNameChanged = newName.trim() !== (activeDocument?.title || activeDocument?.name);
      const hasProjectChanged = String(projectId) !== String(currentProjectId);

      try {
        if (hasNameChanged) {
          if (view === 'erd') await updateDiagram?.(id, newName, { silent: true });
          else if (view === 'notes') await updateNote?.(String(id), newName, { silent: true });
          else if (view === 'drawings') await updateDrawing?.(id, newName, { silent: true });
          else if (view === 'flowchart') await updateFlowchart?.(id, newName, { silent: true });
        }

        if (hasProjectChanged) {
          if (view === 'erd') await onMoveDiagramToProject?.(id, projectId, { silent: true });
          else if (view === 'notes') await onMoveNoteToProject?.(id, projectId, { silent: true });
          else if (view === 'drawings') await onMoveDrawingToProject?.(id, projectId, { silent: true });
          else if (view === 'flowchart') await onMoveFlowchartToProject?.(id, projectId, { silent: true });
        }

        if ((hasNameChanged || hasProjectChanged) && onRenameSuccess) {
          await onRenameSuccess();
        }

        toast.success('Document updated successfully');
        onOpenChange(false);
      } catch (error) {
        toast.error('Failed to update document');
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isCreate ? `Create ${viewLabel(view)}` : 'Edit Document'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? `Enter a name and select a workspace for your new ${viewLabel(view)}.`
              : `Update the name and project for your ${viewLabel(view)}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="rename-input" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isCreate ? 'Name' : 'New Name'}
              </label>
              <input
                id="rename-input"
                type="text"
                className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    handleSave();
                  }
                }}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </label>
              <Select value={selectedProjectId} onValueChange={(value) => value !== null && setSelectedProjectId(value)}>
                <SelectTrigger className="h-9">
                  <SelectValue>
                    {selectedProjectId === "none" ? "Uncategorized" : projects.find(p => p.id.toString() === selectedProjectId)?.name || "Select Project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-9" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={!newName.trim()}
            onClick={handleSave}
            className="h-9 px-6"
          >
            {isCreate ? 'Create' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
