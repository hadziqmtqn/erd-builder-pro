import React, { useState } from 'react';
import { 
  Plus, 
  Trash, 
  Pencil, 
  Sparkles,
  MessageSquare,
  Brain,
  Zap,
  Copy,
  Check,
  Settings2,
  Terminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category: 'system' | 'context' | 'format' | 'custom';
  is_default: boolean;
  created_at?: string;
}

interface DefaultPromptsTabProps {
  initialPrompts?: PromptTemplate[];
  onSavePrompts?: (prompts: PromptTemplate[]) => void;
}

const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: 'default-to-the-point',
    name: 'To The Point',
    content: 'You are a concise technical assistant. Give direct answers without unnecessary elaboration. Get to the point immediately. When explaining concepts, use minimal examples. Prioritize clarity and brevity.',
    category: 'system',
    is_default: true,
  },
  {
    id: 'default-er-builder',
    name: 'ERD Builder Expert',
    content: 'You are an expert at designing Entity-Relationship Diagrams. Suggest appropriate table names, columns, data types, and relationships based on user requirements. Keep schemas normalized and practical.',
    category: 'context',
    is_default: false,
  },
];

const CATEGORY_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  system: { label: 'System Instruction', icon: <Brain className="size-3.5" />, color: 'text-purple-500' },
  context: { label: 'Context', icon: <MessageSquare className="size-3.5" />, color: 'text-blue-500' },
  format: { label: 'Format', icon: <Zap className="size-3.5" />, color: 'text-amber-500' },
  custom: { label: 'Custom', icon: <Sparkles className="size-3.5" />, color: 'text-green-500' },
};

export const DefaultPromptsTab: React.FC<DefaultPromptsTabProps> = ({
  initialPrompts,
  onSavePrompts
}) => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>(initialPrompts || DEFAULT_PROMPTS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PromptTemplate>>({
    name: '',
    content: '',
    category: 'system',
    is_default: false,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: '', content: '', category: 'system', is_default: false });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (prompt: PromptTemplate) => {
    setEditingId(prompt.id);
    setFormData({ ...prompt });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name?.trim() || !formData.content?.trim()) {
      toast.error('Please fill in name and content');
      return;
    }

    let updatedPrompts: PromptTemplate[];

    if (editingId) {
      // Update existing
      updatedPrompts = prompts.map(p => 
        p.id === editingId ? { ...p, ...formData as PromptTemplate } : p
      );
    } else {
      // Create new
      const newPrompt: PromptTemplate = {
        id: `prompt-${Date.now()}`,
        name: formData.name!,
        content: formData.content!,
        category: formData.category || 'custom',
        is_default: formData.is_default || false,
        created_at: new Date().toISOString(),
      };
      updatedPrompts = [...prompts, newPrompt];
    }

    // If setting as default, unset others
    if (formData.is_default) {
      updatedPrompts = updatedPrompts.map(p => ({
        ...p,
        is_default: p.id === (editingId || updatedPrompts[updatedPrompts.length-1].id)
      }));
    }

    setPrompts(updatedPrompts);
    setIsDialogOpen(false);
    toast.success(editingId ? 'Prompt updated' : 'Prompt created');
    onSavePrompts?.(updatedPrompts);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;
    const updated = prompts.filter(p => p.id !== id);
    setPrompts(updated);
    toast.success('Prompt deleted');
    onSavePrompts?.(updated);
  };

  const handleCopy = async (prompt: PromptTemplate) => {
    await navigator.clipboard.writeText(prompt.content);
    setCopiedId(prompt.id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Terminal className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">System Prompts</h2>
            <p className="text-xs text-muted-foreground">Define system instructions and context for AI behavior.</p>
          </div>
        </div>
        <Button onClick={handleOpenAdd} size="sm" className="gap-2 h-9">
          <Plus className="size-4" />
          Create Prompt
        </Button>
      </div>

      {/* Prompts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {prompts.length === 0 ? (
          <div className="lg:col-span-2 py-20 text-center border border-dashed rounded-xl border-border/40 bg-muted/5">
            <div className="flex flex-col items-center gap-3 opacity-20">
              <Settings2 className="size-12 stroke-[1]" />
              <p className="text-sm">No prompts configured yet</p>
            </div>
          </div>
        ) : (
          prompts.map((prompt) => {
            const cat = CATEGORY_MAP[prompt.category] || CATEGORY_MAP.custom;
            return (
              <div 
                key={prompt.id}
                className={`group relative flex flex-col justify-between p-3 rounded-xl border transition-all hover:shadow-lg hover:border-primary/30 ${
                  prompt.is_default 
                    ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/10' 
                    : 'bg-background/50 border-border/40'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 p-2.5 rounded-xl bg-background border border-border/40 shadow-sm ${cat.color}`}>
                      {cat.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-sm truncate">{prompt.name}</h3>
                        <span className="shrink-0 px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold bg-muted text-muted-foreground/70 uppercase tracking-tighter">
                          {prompt.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
                        {prompt.content}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/10">
                  <div className="flex items-center">
                    {prompt.is_default ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border shadow-sm text-[11px] font-bold text-foreground">
                        <div className="size-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="size-2.5 text-primary-foreground stroke-[4]" />
                        </div>
                        Active
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          const updated = prompts.map(p => ({ ...p, is_default: p.id === prompt.id }));
                          setPrompts(updated);
                          onSavePrompts?.(updated);
                          toast.success('System prompt activated');
                        }}
                        className="px-4 py-1.5 rounded-full bg-muted/50 hover:bg-muted border border-border/40 text-[11px] font-bold text-muted-foreground transition-colors"
                      >
                        Use prompt
                      </button>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <Button variant="ghost" size="icon" className="size-8 h-8 w-8 hover:bg-background border border-transparent hover:border-border/40" onClick={() => handleCopy(prompt)}>
                      {copiedId === prompt.id ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 h-8 w-8 hover:bg-background border border-transparent hover:border-border/40" onClick={() => handleOpenEdit(prompt)}>
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 h-8 w-8 hover:bg-destructive/10 border border-transparent hover:border-destructive/20" onClick={() => handleDelete(prompt.id)}>
                      <Trash className="size-3.5 text-destructive/70" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-border/40 bg-muted/5">
        <Sparkles className="size-5 text-purple-500 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">Pro Tip: Structures AI Answers</p>
          <p className="text-[11px] text-muted-foreground/70">
            Use system prompts to enforce JSON output or concise technical explanations to save tokens and improve structure.
          </p>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-border/40 shadow-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 bg-muted/5">
            <DialogTitle className="text-lg font-bold tracking-tight">
              {editingId ? 'Edit Prompt' : 'Create New Prompt'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define how the AI should behave and structure its responses.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                  Name
                </FieldLabel>
                <Input 
                  placeholder="e.g. Concise Mode"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                  Category
                </FieldLabel>
                <Select 
                  value={formData.category}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, category: val as any }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue>
                      {formData.category ? CATEGORY_MAP[formData.category].label : "Select Category"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System Instruction</SelectItem>
                    <SelectItem value="context">Context</SelectItem>
                    <SelectItem value="format">Format</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                Instruction Content
              </FieldLabel>
              <Textarea 
                placeholder="You are a helpful assistant..."
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                className="min-h-[160px] text-sm resize-none"
              />
            </Field>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/5">
              <div className="space-y-0.5">
                <FieldLabel className="text-xs font-semibold m-0 p-0 text-foreground">Set as Global Default</FieldLabel>
                <p className="text-[10px] text-muted-foreground">Use this prompt for all AI interactions.</p>
              </div>
              <Switch 
                checked={formData.is_default}
                onCheckedChange={(val) => setFormData(prev => ({ ...prev, is_default: val }))}
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-3">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-9 px-4 font-medium text-sm">
              Cancel
            </Button>
            <Button onClick={handleSave} className="h-9 px-6 font-semibold text-sm shadow-sm">
              {editingId ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
