import React, { useState } from 'react';
import {
  Plus,
  Trash,
  Pencil,
  Bot,
  Hash,
  Type,
  Settings2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogMedia,
  AlertDialogBody,
} from '@/components/ui/alert-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { AIProvider, AIModel } from '@/types';

interface ModelCatalogTabProps {
  providers: AIProvider[];
  models: AIModel[];
  newModel: { provider_id: string; model_identifier: string; display_name: string };
  editingModelId: number | string | null;
  isSaving: boolean;
  onSetNewModel: (updates: any) => void;
  onAddModel: () => void;
  onEditModel: (model: AIModel) => void;
  onDeleteModel: (id: number | string) => void;
  onCancelEdit: () => void;
}

export const ModelCatalogTab: React.FC<ModelCatalogTabProps> = ({
  providers,
  models,
  newModel,
  editingModelId,
  isSaving,
  onSetNewModel,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onCancelEdit
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | string | null>(null);

  const handleOpenAdd = () => {
    onCancelEdit();
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (model: AIModel) => {
    onEditModel(model);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    await onAddModel();
    setIsDialogOpen(false);
  };

  const handleClose = () => {
    setIsDialogOpen(false);
    onCancelEdit();
  };

  const confirmDelete = (id: number | string) => {
    setItemToDelete(id);
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (itemToDelete) {
      await onDeleteModel(itemToDelete);
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">AI Models</h2>
          <p className="text-xs text-muted-foreground">Models saved from provider setup and manual entries.</p>
        </div>
        <Button onClick={handleOpenAdd} size="sm" className="gap-2" disabled={isDialogOpen}>
          <Plus/>
          Register Model
        </Button>
      </div>

      {/* Table Section */}
      <div className="rounded-lg border border-border/60 bg-background overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground border-b border-border/40">
                <th className="px-4 py-3 text-left font-medium text-xs whitespace-nowrap">Provider</th>
                <th className="px-4 py-3 text-left font-medium text-xs whitespace-nowrap">Display Name</th>
                <th className="px-4 py-3 text-left font-medium text-xs whitespace-nowrap">Identifier</th>
                <th className="px-4 py-3 text-right font-medium text-xs whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <Settings2 className="size-12 stroke-1" />
                      <p className="text-sm">No models registered yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                models.map((m) => {
                  const provider = providers.find(p => String(p.id) === String(m.provider_id));
                  return (
                    <tr key={m.id} className="group hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline" className="font-semibold text-[11px] px-2 py-0.5 bg-muted/20 border-border/50">
                          {provider?.name || 'Unknown'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{m.display_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <code className="text-[11px] font-mono bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground border border-border/30">
                          {m.model_identifier}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-background hover:shadow-sm"
                            onClick={() => handleOpenEdit(m)}
                            disabled={isDialogOpen}
                          >
                            <Pencil className="size-3.5 text-muted-foreground hover:text-primary transition-colors" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-destructive/10"
                            onClick={() => confirmDelete(m.id)}
                            disabled={isDialogOpen}
                          >
                            <Trash className="size-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats Footer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <div className="size-1 rounded-full bg-current" />
        {models.length} models
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(val) => !val && handleClose()}>
        <DialogContent className="sm:max-w-110 p-0 overflow-hidden border-border/40 shadow-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 bg-muted/5">
            <DialogTitle className="text-lg font-bold tracking-tight">
              {editingModelId ? 'Edit Model' : 'Register New Model'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure the AI model details below to update the catalog.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-5">
            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                <Bot className="size-3" />
                Provider
              </FieldLabel>
              <Select 
                value={newModel.provider_id} 
                onValueChange={(val) => onSetNewModel({ ...newModel, provider_id: val || '' })}
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue className="w-full">
                    {providers.find(p => String(p.id) === newModel.provider_id)?.name || "Select Provider"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-sm cursor-pointer">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                <Hash className="size-3" />
                Identifier
              </FieldLabel>
              <Input 
                placeholder="e.g. gpt-4o, claude-3"
                value={newModel.model_identifier}
                onChange={(e) => onSetNewModel({ ...newModel, model_identifier: e.target.value })}
                className="h-9 text-sm"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                <Type className="size-3" />
                Display Name
              </FieldLabel>
              <Input 
                placeholder="e.g. GPT-4 Omni"
                value={newModel.display_name}
                onChange={(e) => onSetNewModel({ ...newModel, display_name: e.target.value })}
                className="h-9 text-sm"
              />
            </Field>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-3">
            <Button variant="ghost" onClick={handleClose} disabled={isSaving} className="h-9 px-4 font-medium text-sm">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="h-9 px-5 font-semibold text-sm shadow-sm">
              {isSaving && <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent shrink-0" />}
              <span>{editingModelId ? 'Save Changes' : 'Register Model'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent size="sm" className="max-w-100 p-0 overflow-hidden border-border/40">
          <AlertDialogHeader className="px-6 pt-6 pb-4">
            <AlertDialogMedia className="bg-destructive/10 mb-4">
              <AlertTriangle className="size-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">Delete AI Model?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody className="px-6 pb-6">
            <AlertDialogDescription className="text-sm leading-relaxed">
              This action cannot be undone. This will permanently remove the model from your catalog and may affect existing AI configurations.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter className="px-6 py-4 bg-muted/30 border-t border-border/40 gap-3">
            <AlertDialogCancel className="h-9 px-4 text-sm font-medium">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeDelete}
              className="h-9 px-5 text-sm font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm"
            >
              {isSaving ? 'Deleting...' : 'Delete Model'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
