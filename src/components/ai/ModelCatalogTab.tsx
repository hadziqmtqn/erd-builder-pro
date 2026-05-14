import React from 'react';
import { 
  Plus, 
  Trash, 
  Pencil, 
  X, 
  Save 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
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
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form Column */}
      <Card className="lg:col-span-1 border-border/50 bg-background/50 backdrop-blur-sm h-fit">
        <CardHeader>
          <CardTitle className="text-xl">{editingModelId ? 'Edit Model' : 'Add New Model'}</CardTitle>
          <CardDescription>
            {editingModelId ? 'Update existing model details.' : 'Register a new AI model for any provider.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Provider</Label>
            <Select 
              value={newModel.provider_id} 
              onValueChange={(val) => onSetNewModel({ ...newModel, provider_id: val || '' })}
            >
              <SelectTrigger className="h-11 bg-muted/10">
                <SelectValue>
                  {providers.find(p => String(p.id) === newModel.provider_id)?.name || "Select Provider"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {providers.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Model Identifier</Label>
            <Input 
              placeholder="e.g. gpt-4o, llama3"
              value={newModel.model_identifier}
              onChange={(e) => onSetNewModel({ ...newModel, model_identifier: e.target.value })}
              className="h-11 bg-muted/10"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Display Name</Label>
            <Input 
              placeholder="e.g. GPT-4 Omni"
              value={newModel.display_name}
              onChange={(e) => onSetNewModel({ ...newModel, display_name: e.target.value })}
              className="h-11 bg-muted/10"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button 
            className="w-full gap-2"
            onClick={onAddModel}
            disabled={isSaving}
          >
            {editingModelId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingModelId ? 'Update Model' : 'Add to Catalog'}
          </Button>
          {editingModelId && (
            <Button 
              variant="ghost" 
              className="w-full gap-2"
              onClick={onCancelEdit}
            >
              <X className="w-4 h-4" />
              Cancel Edit
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* List Column */}
      <Card className="lg:col-span-2 border-border/50 bg-background/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl">Model List</CardTitle>
          <CardDescription>View and manage all available models in your system.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border/50 overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground font-medium border-b border-border/50">
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">Model ID</th>
                  <th className="px-4 py-3 text-left">Display Name</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {models.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No models found. Add one on the left.
                    </td>
                  </tr>
                ) : (
                  models.map((m: AIModel) => {
                    const provider = providers.find(p => p.id === m.provider_id);
                    return (
                      <tr key={m.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 font-medium">{provider?.name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{m.model_identifier}</td>
                        <td className="px-4 py-3">{m.display_name}</td>
                        <td className="px-4 py-3 text-right flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => onEditModel(m)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => onDeleteModel(m.id)}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
