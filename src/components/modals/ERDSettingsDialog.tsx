import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { SQLImportForm, type SQLImportFormProps } from './SQLImportForm';

interface ERDSettingsDialogProps extends SQLImportFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  activeDocument: any | null;
  newName: string;
  setNewName: (name: string) => void;
  projects: any[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  updateDiagram?: (id: string | number, name: string, options?: { silent?: boolean }) => void;
  onMoveDiagramToProject?: (id: number | string, projectId: number | string | null, options?: { silent?: boolean }) => Promise<boolean | undefined>;
  onRenameSuccess?: () => Promise<void>;
}

export function ERDSettingsDialog({
  isOpen,
  onOpenChange,
  activeDocument,
  newName,
  setNewName,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  updateDiagram,
  onMoveDiagramToProject,
  onRenameSuccess,
  ...sqlImportProps
}: ERDSettingsDialogProps) {
  useEffect(() => {
    if (isOpen && activeDocument) {
      const pid = activeDocument?.project_id ?? activeDocument?.projectId;
      setSelectedProjectId(pid != null ? String(pid) : 'none');
    }
  }, [isOpen]);

  const handleRenameSave = async () => {
    if (!newName.trim()) return;

    const id = activeDocument?.uid ?? activeDocument?.id;
    if (!id) return;

    const projectId = selectedProjectId === "none" ? null : selectedProjectId;
    const currentProjectId = activeDocument?.project_id || activeDocument?.projectId;
    const hasNameChanged = newName.trim() !== (activeDocument?.title || activeDocument?.name);
    const hasProjectChanged = String(projectId) !== String(currentProjectId);

    try {
      if (hasNameChanged) {
        await updateDiagram?.(id, newName, { silent: true });
      }

      if (hasProjectChanged) {
        await onMoveDiagramToProject?.(id, projectId, { silent: true });
      }

      if ((hasNameChanged || hasProjectChanged) && onRenameSuccess) {
        await onRenameSuccess();
      }

      if (hasNameChanged || hasProjectChanged) {
        toast.success('Document updated successfully');
      }
    } catch (error) {
      toast.error('Failed to update document');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Diagram Settings</DialogTitle>
          <DialogDescription>
            Configure diagram properties and import SQL schema.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" className="px-6">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="general" className="flex-1 gap-2">
              <Settings2 className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="schema" className="flex-1 gap-2">
              <Database className="w-4 h-4" />
              Schema
            </TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="space-y-4">
            <Field>
              <FieldLabel htmlFor="settings-name" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                Name
              </FieldLabel>
              <Input
                id="settings-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    handleRenameSave();
                  }
                }}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                Project
              </FieldLabel>
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
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!newName.trim()}
                onClick={handleRenameSave}
                className="h-9 px-6"
              >
                Save Changes
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="schema">
            <SQLImportForm
              {...sqlImportProps}
              onComplete={() => {
                onOpenChange(false);
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
