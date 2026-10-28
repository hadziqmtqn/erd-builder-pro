import React, { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { ArrowUpRight, Plus, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner';

export interface CreateFileType {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Not in the active Cloud plan; the card stays visible and points to pricing. */
  locked?: boolean;
}

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
  requireProject?: boolean;
  canMoveProject?: boolean;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  /** For create mode — called with (title, projectId) when user confirms */
  onCreate?: (title: string, projectId: string | null) => void;
  /** For create mode — creates a project and returns it for selection. */
  onProjectCreate?: (name: string) => Promise<{ id: number | string } | null>;
  /** For edit mode */
  updateDiagram?: (id: string | number, name: string, options?: { silent?: boolean }) => void;
  updateNote?: (uid: string, name: string, options?: { silent?: boolean }) => void;
  updateDrawing?: (uid: string, name: string, options?: { silent?: boolean }) => void;
  updateFlowchart?: (uid: string, name: string, options?: { silent?: boolean }) => void;
  updateDbClient?: (uid: string, name: string) => void | Promise<void>;
  onMoveDiagramToProject?: (id: number | string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveNoteToProject?: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveDrawingToProject?: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onMoveFlowchartToProject?: (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onRenameSuccess?: () => Promise<void>;
  /** Create mode — radio cards that switch the file type inside the same dialog. */
  fileTypes?: CreateFileType[];
  onViewChange?: (view: string) => void;
  onViewPlans?: () => void;
  /** DB Client files start from a database connection, managed in its drawer. */
  onOpenDbConnections?: () => void;
}

const viewLabel = (v: string) =>
  v === 'erd' ? 'diagram' : v === 'notes' ? 'note' : v === 'drawings' ? 'drawing' : v === 'db-client' ? 'DB Client' : 'flowchart';

export const RenameDocumentDialog: React.FC<RenameDocumentDialogProps> = ({
  isOpen,
  onOpenChange,
  mode = 'edit',
  view,
  activeDocument,
  newName,
  setNewName,
  projects,
  requireProject = false,
  canMoveProject = false,
  selectedProjectId,
  setSelectedProjectId,
  onCreate,
  onProjectCreate,
  updateDiagram,
  updateNote,
  updateDrawing,
  updateFlowchart,
  updateDbClient,
  onMoveDiagramToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  onMoveFlowchartToProject,
  onRenameSuccess,
  fileTypes,
  onViewChange,
  onViewPlans,
  onOpenDbConnections,
}) => {
  const isCreate = mode === 'create';
  const selectedType = fileTypes?.find((type) => type.value === view);
  const isLockedType = isCreate && Boolean(selectedType?.locked);
  const isDbClientCreate = isCreate && view === 'db-client';
  const currentProjectId = activeDocument?.project_id ?? activeDocument?.projectId;
  // An existing file without a Project may still be renamed; it just cannot be moved out of one (COL-008).
  const isProjectMissing = requireProject && selectedProjectId === 'none' && (isCreate || currentProjectId != null);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsAddingProject(false);
      setNewProjectName('');
    }
    onOpenChange(open);
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || !onProjectCreate || isCreatingProject) return;

    setIsCreatingProject(true);
    try {
      const project = await onProjectCreate(name);
      if (!project) {
        toast.error('Failed to create project');
        return;
      }
      setSelectedProjectId(String(project.id));
      setIsAddingProject(false);
      setNewProjectName('');
    } catch {
      toast.error('Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  };

  useEffect(() => {
    if (isOpen && !isCreate && activeDocument) {
      const pid = activeDocument?.project_id ?? activeDocument?.projectId;
      setSelectedProjectId(pid != null ? String(pid) : 'none');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (isAddingProject || isCreatingProject || !newName.trim() || isProjectMissing || isLockedType || isDbClientCreate) return;

    if (isCreate) {
      onCreate?.(newName.trim(), selectedProjectId === 'none' ? null : selectedProjectId);
      handleOpenChange(false);
      return;
    }

    // Edit mode — existing behavior
    const id = view === 'db-client' || view === 'notes' || view === 'flowchart' || view === 'drawings'
      ? activeDocument?.uid || activeDocument?.id
      : activeDocument?.id;
    if (id && newName.trim()) {
      const projectId = selectedProjectId === "none" ? null : selectedProjectId;
      const hasNameChanged = newName.trim() !== (activeDocument?.title || activeDocument?.name);
      const hasProjectChanged = view !== 'db-client' && String(projectId) !== String(currentProjectId);
      if (hasProjectChanged && !canMoveProject) {
        toast.error('Only the file creator can move this file.');
        return;
      }

      try {
        if (hasNameChanged) {
          if (view === 'erd') await updateDiagram?.(id, newName, { silent: true });
          else if (view === 'notes') await updateNote?.(String(id), newName, { silent: true });
          else if (view === 'drawings') await updateDrawing?.(id, newName, { silent: true });
          else if (view === 'flowchart') await updateFlowchart?.(id, newName, { silent: true });
          else if (view === 'db-client') await updateDbClient?.(String(id), newName.trim());
        }

        if (hasProjectChanged) {
          let moved: boolean | undefined;
          if (view === 'erd') moved = await onMoveDiagramToProject?.(id, projectId, { silent: true });
          else if (view === 'notes') moved = await onMoveNoteToProject?.(id, projectId, { silent: true });
          else if (view === 'drawings') moved = await onMoveDrawingToProject?.(id, projectId, { silent: true });
          else if (view === 'flowchart') moved = await onMoveFlowchartToProject?.(id, projectId, { silent: true });
          if (moved === false) throw new Error('Failed to move document');
        }

        if ((hasNameChanged || hasProjectChanged) && onRenameSuccess) {
          await onRenameSuccess();
        }

        toast.success(view === 'db-client' ? 'DB Client renamed successfully' : 'Document updated successfully');
        handleOpenChange(false);
      } catch (error) {
        toast.error(view === 'db-client' ? 'Failed to rename DB Client' : 'Failed to update document');
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className={fileTypes && isCreate ? 'sm:max-w-md' : 'sm:max-w-sm'}>
        <DialogHeader>
          <DialogTitle>{isCreate ? (fileTypes ? 'New file' : `Create ${viewLabel(view)}`) : 'Edit'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? `Choose a project for your new ${viewLabel(view)}.`
              : view === 'db-client' ? 'Change the name of this DB Client.'
              : canMoveProject ? `Update the name and project for your ${viewLabel(view)}.` : `Update the name of this ${viewLabel(view)}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {isCreate && fileTypes && (
              <fieldset>
                <legend className="sr-only">File type</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {fileTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <label
                        key={type.value}
                        className={cn(
                          'relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 text-center text-xs font-medium transition-colors hover:bg-accent/50',
                          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                          view === type.value && 'border-primary bg-primary/5 text-foreground',
                          type.locked && 'text-muted-foreground',
                        )}
                      >
                        <input
                          type="radio"
                          name="create-file-type"
                          value={type.value}
                          checked={view === type.value}
                          onChange={() => onViewChange?.(type.value)}
                          className="sr-only"
                        />
                        <Icon className="size-5" aria-hidden="true" />
                        <span>{type.label}</span>
                        {type.locked && (
                          <span className="absolute right-1.5 top-1.5 rounded border border-primary/30 px-1 text-[9px] font-semibold uppercase text-primary">Pro</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {isLockedType ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-sm">
                <p className="font-medium">{selectedType?.label} needs a paid Cloud plan</p>
                <p className="mt-1 text-xs text-muted-foreground">Plans, limits, and checkout are managed in ERDBPro SaaS.</p>
                {onViewPlans && (
                  <Button type="button" size="sm" className="mt-3" onClick={onViewPlans}>
                    View Cloud plans
                    <ArrowUpRight className="size-4" />
                  </Button>
                )}
              </div>
            ) : isDbClientCreate ? (
              <div className="rounded-lg border border-border px-3.5 py-3 text-sm">
                <p className="font-medium">DB Client files start from a database connection</p>
                <p className="mt-1 text-xs text-muted-foreground">Pick a connection and a database, then choose the project for the new DB Client.</p>
                {onOpenDbConnections && (
                  <Button type="button" size="sm" className="mt-3" onClick={() => { handleOpenChange(false); onOpenDbConnections(); }}>
                    Open database connections
                  </Button>
                )}
              </div>
            ) : (<>
            <Field>
              <FieldLabel htmlFor="rename-input" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                {isCreate || view === 'db-client' ? 'Name' : 'New Name'}
              </FieldLabel>
              <Input
                id="rename-input"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    handleSave();
                  }
                }}
                autoFocus
              />
            </Field>

            {view !== 'db-client' && <Field>
              <FieldLabel htmlFor="document-project-select" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                Project
              </FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={selectedProjectId}
                  onValueChange={(value) => value !== null && setSelectedProjectId(value)}
                  disabled={(!isCreate && !canMoveProject) || isAddingProject || isCreatingProject}
                >
                  <SelectTrigger id="document-project-select" className="min-w-0 flex-1">
                    <SelectValue>
                      {selectedProjectId === "none" ? (requireProject ? "Select Project" : "No project") : projects.find(p => p.id.toString() === selectedProjectId)?.name || "Select Project"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {!requireProject && <SelectItem value="none">No project</SelectItem>}
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isCreate && onProjectCreate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="shrink-0"
                    aria-label={isAddingProject ? 'Cancel adding project' : 'Add a project'}
                    aria-expanded={isAddingProject}
                    aria-controls="new-project-field"
                    disabled={isCreatingProject}
                    onClick={() => {
                      setIsAddingProject(!isAddingProject);
                      setNewProjectName('');
                    }}
                  >
                    {isAddingProject ? <X className="size-4" /> : <Plus className="size-4" />}
                  </Button>
                )}
              </div>
              {isCreate && isAddingProject && (
                <div id="new-project-field" className="mt-3 space-y-2">
                  <FieldLabel htmlFor="new-project-name" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                    New project name
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="new-project-name"
                      value={newProjectName}
                      onChange={(event) => setNewProjectName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleCreateProject();
                        }
                      }}
                      placeholder="Enter project name"
                      className="min-w-0 flex-1"
                      autoFocus
                      disabled={isCreatingProject}
                    />
                    <Button
                      type="button"
                      size="lg"
                      className="shrink-0"
                      disabled={!newProjectName.trim() || isCreatingProject}
                      onClick={() => void handleCreateProject()}
                    >
                      {isCreatingProject ? 'Adding…' : 'Add project'}
                    </Button>
                  </div>
                </div>
              )}
            </Field>}
            </>)}
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-9" />}>
            Cancel
          </DialogClose>
          {!isLockedType && !isDbClientCreate && (
            <Button
              disabled={isAddingProject || isCreatingProject || !newName.trim() || isProjectMissing}
              onClick={handleSave}
              className="h-9 px-6"
            >
              {isCreate ? 'Create' : 'Save Changes'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
