import React, { useState } from 'react';
import {
  Plus,
  Trash,
  Pencil,
  Library,
  Bot,
  Hash,
  Type,
  Settings2
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

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Library className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Model Catalog</h2>
            <p className="text-xs text-muted-foreground">Manage AI models and their identifiers.</p>
          </div>
        </div>
        <Button onClick={handleOpenAdd} size="sm" className="gap-2 h-9" disabled={isDialogOpen}>
          <Plus className="size-4" />
          Register Model
        </Button>
      </div>

      {/* Table Section */}
      <div className="rounded-xl border border-border/40 bg-background/50 overflow-hidden shadow-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground/70 border-b border-border/40">
                <th className="px-6 py-3.5 text-left font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">Provider</th>
                <th className="px-6 py-3.5 text-left font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">Display Name</th>
                <th className="px-6 py-3.5 text-left font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">Identifier</th>
                <th className="px-6 py-3.5 text-right font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <Settings2 className="size-12 stroke-[1]" />
                      <p className="text-sm">No models registered yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                models.map((m) => {
                  const provider = providers.find(p => p.id === m.provider_id);
                  return (
                    <tr key={m.id} className="group hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="outline" className="font-semibold text-[11px] px-2 py-0.5 bg-muted/20 border-border/50">
                          {provider?.name || 'Unknown'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 font-medium whitespace-nowrap">{m.display_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-[11px] font-mono bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground border border-border/30">
                          {m.model_identifier}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                            onClick={() => onDeleteModel(m.id)}
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
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40 uppercase font-bold tracking-widest px-2">
        <div className="size-1 rounded-full bg-current" />
        {models.length} Models in Catalog
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(val) => !val && handleClose()}>
        <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden border-border/40 shadow-2xl">
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
              {isSaving && <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />}
              {editingModelId ? 'Save Changes' : 'Register Model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
