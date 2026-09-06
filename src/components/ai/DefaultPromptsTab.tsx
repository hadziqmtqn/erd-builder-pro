import React, { useState } from 'react';
import { 
  Plus, 
  Trash, 
  Pencil, 
  Sparkles,
  MessageSquare,
  Copy,
  Check,
  Terminal,
  Search,
  Layout,
  FileText,
  AlertTriangle,
  Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
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
import { AISystemPrompt } from '@/types';
import { useAuth } from '@/hooks/useAuth';

type PromptFormData = Partial<AISystemPrompt> & { is_global?: boolean };

interface DefaultPromptsTabProps {
  prompts: AISystemPrompt[];
  isSaving: boolean;
  onSave: (formData: PromptFormData, editingId: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleDefault: (id: string) => Promise<void>;
}

const CATEGORY_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  system: { label: 'System Instruction', icon: <Terminal className="size-4" />, color: 'text-blue-500' },
  context: { label: 'Context', icon: <Layout className="size-4" />, color: 'text-purple-500' },
  format: { label: 'Format', icon: <FileText className="size-4" />, color: 'text-orange-500' },
  custom: { label: 'Custom', icon: <MessageSquare className="size-4" />, color: 'text-slate-500' }
};

export const DefaultPromptsTab: React.FC<DefaultPromptsTabProps> = ({
  prompts,
  isSaving,
  onSave,
  onDelete,
  onToggleDefault
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { user } = useAuth();
  const isSuperAdmin = Boolean((user as any)?.isSuperAdmin || (user as any)?.is_super_admin);
  const [formData, setFormData] = useState<PromptFormData>({
    name: '',
    content: '',
    category: 'custom',
    is_default: false,
    is_global: false,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPrompts = prompts
    .filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: '', content: '', category: 'custom', is_default: false, is_global: false });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (prompt: AISystemPrompt) => {
    setEditingId(prompt.id);
    setFormData({ ...prompt, is_global: prompt.user_id == null });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.content?.trim()) {
      toast.error('Please fill in name and content');
      return;
    }
    await onSave(formData, editingId);
    setIsDialogOpen(false);
  };

  const handleDeleteClick = (id: string) => {
    setItemToDelete(id);
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (itemToDelete) {
      await onDelete(itemToDelete);
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  const handleCopy = async (prompt: AISystemPrompt) => {
    await navigator.clipboard.writeText(prompt.content);
    setCopiedId(prompt.id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
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
        <Button onClick={handleOpenAdd} size="sm" className="gap-2">
          <Plus/>
          Create Prompt
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 group-focus-within:text-purple-500 transition-colors" />
          <Input 
            placeholder="Search prompts..." 
            className="pl-9 h-10 bg-muted/20 border-border/40 focus:bg-background transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPrompts.length === 0 ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/30 rounded-2xl bg-muted/5">
            <div className="p-4 bg-muted/30 rounded-full mb-4">
              <MessageSquare className="size-8 text-muted-foreground/30" />
            </div>
            <h3 className="font-bold text-muted-foreground/70">No prompts found</h3>
            <p className="text-xs text-muted-foreground/50 mt-1">Try creating a new system prompt to get started.</p>
          </div>
        ) : (
          filteredPrompts.map((prompt) => {
            const cat = CATEGORY_MAP[prompt.category] || CATEGORY_MAP.custom;
            const isGlobal = prompt.user_id == null;
            const canManage = !isGlobal || isSuperAdmin;
            return (
              <div 
                key={prompt.id}
                className={`group relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/5 ${
                  prompt.is_default 
                    ? 'bg-purple-500/3 border-purple-500/30 ring-1 ring-purple-500/10' 
                    : 'bg-background border-border/40 hover:border-purple-500/20'
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
                        <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tighter ${
                          isGlobal ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground/70'
                        }`}>
                          {isGlobal ? 'Global' : 'Personal'}
                        </span>
                        <span className="shrink-0 px-1.5 py-0.5 rounded-lg text-[8px] font-bold bg-muted text-muted-foreground/70 uppercase tracking-tighter">
                          {prompt.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
                        {prompt.content}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/10">
                  <button 
                    onClick={() => onToggleDefault(prompt.id)}
                    disabled={!canManage}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-colors ${
                      prompt.is_default 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {prompt.is_default ? 'Active' : 'Set Active'}
                  </button>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <Button variant="ghost" size="icon" className="size-8 h-8 w-8 hover:bg-background border border-transparent hover:border-border/40" onClick={() => handleCopy(prompt)}>
                      {copiedId === prompt.id ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" disabled={!canManage} className="size-8 h-8 w-8 hover:bg-background border border-transparent hover:border-border/40" onClick={() => handleOpenEdit(prompt)}>
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={!canManage} className="size-8 h-8 w-8 hover:bg-destructive/10 border border-transparent hover:border-destructive/20" onClick={() => handleDeleteClick(prompt.id)}>
                      <Trash className="size-3.5 text-destructive/70" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-125 p-0 overflow-hidden border-border/40 shadow-2xl">
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
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">Name</FieldLabel>
                <Input 
                  placeholder="e.g. Concise Mode"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">Category</FieldLabel>
                <Select 
                  value={formData.category}
                  onValueChange={(val: string | null) => setFormData(prev => ({ ...prev, category: (val || 'custom') as any }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue>{formData.category ? CATEGORY_MAP[formData.category].label : "Select Category"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_MAP).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                Instruction Content
              </FieldLabel>
              <textarea 
                placeholder="You are an expert architect. Always answer in JSON format..."
                className="w-full min-h-37.5 p-3 text-sm rounded-lg bg-muted/20 border border-border/40 focus:bg-background focus:ring-1 focus:ring-purple-500/20 transition-all outline-none"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              />
            </Field>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="space-y-0.5">
                  <FieldLabel className="m-0 p-0 text-xs font-semibold text-foreground">Use in AI Assistant</FieldLabel>
                  <span className="block text-[10px] text-muted-foreground">One active prompt is used from each scope: global and personal.</span>
                </span>
                <Checkbox
                  checked={formData.is_default === true}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_default: checked === true }))}
                  className="size-5 border-foreground/50 bg-background data-checked:border-primary data-checked:bg-primary"
                />
              </label>
            </div>

            {!editingId && isSuperAdmin && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="space-y-0.5">
                    <FieldLabel className="m-0 p-0 text-xs font-semibold text-foreground">Global prompt</FieldLabel>
                    <span className="block text-[10px] text-muted-foreground">Applied to every signed-in user. Only SuperAdmin can create or modify it.</span>
                  </span>
                  <Checkbox
                    checked={formData.is_global === true}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_global: checked === true }))}
                    className="size-5 border-foreground/50 bg-background data-checked:border-primary data-checked:bg-primary"
                  />
                </label>
              </div>
            )}

            {editingId && formData.is_global && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[10px] text-muted-foreground">
                This is a global prompt. Its scope cannot be changed after creation.
              </div>
            )}

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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent size="sm" className="max-w-100 p-0 overflow-hidden border-border/40">
          <AlertDialogHeader className="px-6 pt-6 pb-4">
            <AlertDialogMedia className="bg-destructive/10 mb-4">
              <AlertTriangle className="size-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">Delete System Prompt?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody className="px-6 pb-6">
            <AlertDialogDescription className="text-sm leading-relaxed">
              This action cannot be undone. This will permanently remove this system prompt template.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter className="px-6 py-4 bg-muted/30 border-t border-border/40 gap-3">
            <AlertDialogCancel className="h-9 px-4 text-sm font-medium">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeDelete}
              className="h-9 px-5 text-sm font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
