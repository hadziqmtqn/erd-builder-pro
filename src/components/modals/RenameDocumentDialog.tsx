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
  view: string;
  activeDocument: any | null;
  newName: string;
  setNewName: (name: string) => void;
  projects: any[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  updateDiagram: (id: string | number, name: string, options?: { silent?: boolean }) => void;
  updateNote: (uid: string, name: string, options?: { silent?: boolean }) => void;
  updateDrawing: (id: string | number, name: string, options?: { silent?: boolean }) => void;
  updateFlowchart: (uid: string, name: string, options?: { silent?: boolean }) => void;
  onMoveDiagramToProject: (id: number | string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveNoteToProject: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveDrawingToProject: (id: number | string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveFlowchartToProject: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onRenameSuccess?: () => Promise<void>;
}

export const RenameDocumentDialog: React.FC<RenameDocumentDialogProps> = ({
  isOpen,
  onOpenChange,
  view,
  activeDocument,
  newName,
  setNewName,
  projects,
  selectedProjectId,
  setSelectedProjectId,
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
  const handleSave = async () => {
    // Notes use uid (UUID), others use id (auto-increment). Pick the right one.
    const id = view === 'notes' || view === 'flowchart' ? activeDocument?.uid : activeDocument?.id;
    if (id && newName.trim()) {
      const projectId = selectedProjectId === "none" ? null : selectedProjectId;
      const currentProjectId = activeDocument?.project_id || activeDocument?.projectId;
      const hasNameChanged = newName.trim() !== (activeDocument?.title || activeDocument?.name);
      const hasProjectChanged = String(projectId) !== String(currentProjectId);

      try {
        // 1. Rename (silent)
        if (hasNameChanged) {
          if (view === 'erd') await updateDiagram(id, newName, { silent: true });
          else if (view === 'notes') await updateNote(String(id), newName, { silent: true });
          else if (view === 'drawings') await updateDrawing(id, newName, { silent: true });
          else if (view === 'flowchart') await updateFlowchart(id, newName, { silent: true });
        }

        // 2. Move if changed (silent)
        if (hasProjectChanged) {
          if (view === 'erd') await onMoveDiagramToProject(id, projectId, { silent: true });
          else if (view === 'notes') await onMoveNoteToProject(id, projectId, { silent: true });
          else if (view === 'drawings') await onMoveDrawingToProject(id, projectId, { silent: true });
          else if (view === 'flowchart') await onMoveFlowchartToProject(id, projectId, { silent: true });
        }

        // 3. Refresh sidebar data (projects wrapper)
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
          <DialogTitle>Edit Document</DialogTitle>
          <DialogDescription>
            Update the name and project for your {view === 'erd' ? 'diagram' : view === 'notes' ? 'note' : view === 'drawings' ? 'drawing' : 'flowchart'}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="rename-input" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                New Name
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
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
