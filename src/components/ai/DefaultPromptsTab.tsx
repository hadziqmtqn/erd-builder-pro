import React, { useState } from 'react';
import { 
  Plus, 
  Trash, 
  Pencil, 
  X, 
  Save,
  Sparkles,
  MessageSquare,
  Brain,
  Zap,
  Copy,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category: 'system' | 'context' | 'format' | 'custom';
  is_default: boolean;
  created_at?: string;
}

interface DefaultPromptsTabProps {
  // For now, prompts are stored locally - will integrate with DB later
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

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  system: { label: 'System Instruction', icon: <Brain className="w-4 h-4" />, color: 'text-purple-500' },
  context: { label: 'Context', icon: <MessageSquare className="w-4 h-4" />, color: 'text-blue-500' },
  format: { label: 'Format', icon: <Zap className="w-4 h-4" />, color: 'text-amber-500' },
  custom: { label: 'Custom', icon: <Sparkles className="w-4 h-4" />, color: 'text-green-500' },
};

export const DefaultPromptsTab: React.FC<DefaultPromptsTabProps> = ({
  initialPrompts,
  onSavePrompts
}) => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>(initialPrompts || DEFAULT_PROMPTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPrompt, setNewPrompt] = useState<Partial<PromptTemplate>>({
    name: '',
    content: '',
    category: 'custom',
    is_default: false,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSaveNew = () => {
    if (!newPrompt.name?.trim() || !newPrompt.content?.trim()) {
      toast.error('Please fill in name and content');
      return;
    }

    const prompt: PromptTemplate = {
      id: `prompt-${Date.now()}`,
      name: newPrompt.name!,
      content: newPrompt.content!,
      category: newPrompt.category || 'custom',
      is_default: newPrompt.is_default || false,
      created_at: new Date().toISOString(),
    };

    // If setting as default, unset others
    if (prompt.is_default) {
      setPrompts(prev => prev.map(p => ({ ...p, is_default: false })));
    }

    setPrompts(prev => [...prev, prompt]);
    setIsCreating(false);
    setNewPrompt({ name: '', content: '', category: 'custom', is_default: false });
    toast.success('Prompt created successfully');
    
    onSavePrompts?.(prompts);
  };

  const handleUpdatePrompt = (id: string, updates: Partial<PromptTemplate>) => {
    // If setting as default, unset others first
    if (updates.is_default) {
      setPrompts(prev => prev.map(p => ({ ...p, is_default: false })));
    }
    
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setEditingId(null);
    toast.success('Prompt updated');
    
    onSavePrompts?.(prompts);
  };

  const handleDeletePrompt = (id: string) => {
    if (!confirm('Delete this prompt?')) return;
    setPrompts(prev => prev.filter(p => p.id !== id));
    toast.success('Prompt deleted');
    
    onSavePrompts?.(prompts);
  };

  const handleCopyContent = async (prompt: PromptTemplate) => {
    await navigator.clipboard.writeText(prompt.content);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSetDefault = (id: string) => {
    setPrompts(prev => prev.map(p => ({ 
      ...p, 
      is_default: p.id === id 
    })));
    toast.success('Default prompt updated');
    
    onSavePrompts?.(prompts);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Brain className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-xl">Default Prompts</CardTitle>
                <CardDescription>
                  Configure how AI responds. Prompts are prepended to guide the AI's behavior.
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={() => setIsCreating(true)}
              className="gap-2"
              disabled={isCreating}
            >
              <Plus className="w-4 h-4" />
              New Prompt
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* New Prompt Form */}
      {isCreating && (
        <Card className="border-purple-500/30 bg-purple-500/5 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Create New Prompt</CardTitle>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewPrompt({ name: '', content: '', category: 'custom', is_default: false });
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Prompt Name
                </Label>
                <Input 
                  placeholder="e.g. Concise Mode, Technical Expert"
                  value={newPrompt.name || ''}
                  onChange={(e) => setNewPrompt(prev => ({ ...prev, name: e.target.value }))}
                  className="h-11 bg-muted/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Category
                </Label>
                <select
                  value={newPrompt.category || 'custom'}
                  onChange={(e) => setNewPrompt(prev => ({ ...prev, category: e.target.value as any }))}
                  className="w-full h-11 px-3 rounded-md border border-border/50 bg-muted/10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="system">System Instruction</option>
                  <option value="context">Context</option>
                  <option value="format">Format</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Prompt Content
              </Label>
              <Textarea 
                placeholder="Enter your prompt instructions..."
                value={newPrompt.content || ''}
                onChange={(e) => setNewPrompt(prev => ({ ...prev, content: e.target.value }))}
                className="min-h-[120px] bg-muted/10 resize-y"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch 
                id="new-prompt-default"
                checked={newPrompt.is_default || false}
                onCheckedChange={(val) => setNewPrompt(prev => ({ ...prev, is_default: val }))}
              />
              <Label htmlFor="new-prompt-default" className="text-sm cursor-pointer">
                Set as default prompt
              </Label>
            </div>
          </CardContent>
          <CardFooter className="gap-3">
            <Button 
              variant="ghost"
              onClick={() => {
                setIsCreating(false);
                setNewPrompt({ name: '', content: '', category: 'custom', is_default: false });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveNew} className="gap-2">
              <Save className="w-4 h-4" />
              Save Prompt
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Prompts List */}
      <div className="space-y-4">
        {prompts.length === 0 && !isCreating && (
          <Card className="border-dashed border-border/50">
            <CardContent className="py-12 text-center">
              <Brain className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No prompts configured yet.</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Create your first prompt to guide AI behavior.
              </p>
            </CardContent>
          </Card>
        )}

        {prompts.map((prompt) => {
          const categoryInfo = CATEGORY_LABELS[prompt.category] || CATEGORY_LABELS.custom;
          const isEditing = editingId === prompt.id;

          return (
            <Card 
              key={prompt.id} 
              className={`border-border/50 bg-background/50 backdrop-blur-sm transition-all ${
                prompt.is_default ? 'ring-2 ring-purple-500/30' : ''
              }`}
            >
              {isEditing ? (
                // Edit Mode
                <>
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <Input 
                        placeholder="Prompt name"
                        value={prompt.name}
                        onChange={(e) => setPrompts(prev => prev.map(p => 
                          p.id === prompt.id ? { ...p, name: e.target.value } : p
                        ))}
                        className="h-10 bg-muted/10 text-lg font-semibold"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Category
                      </Label>
                      <select
                        value={prompt.category}
                        onChange={(e) => setPrompts(prev => prev.map(p => 
                          p.id === prompt.id ? { ...p, category: e.target.value as any } : p
                        ))}
                        className="w-full h-10 px-3 rounded-md border border-border/50 bg-muted/10 text-sm"
                      >
                        <option value="system">System Instruction</option>
                        <option value="context">Context</option>
                        <option value="format">Format</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Prompt Content
                      </Label>
                      <Textarea 
                        value={prompt.content}
                        onChange={(e) => setPrompts(prev => prev.map(p => 
                          p.id === prompt.id ? { ...p, content: e.target.value } : p
                        ))}
                        className="min-h-[100px] bg-muted/10 resize-y"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="gap-3">
                    <Button 
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => {
                        handleUpdatePrompt(prompt.id, {
                          name: prompt.name,
                          content: prompt.content,
                          category: prompt.category
                        });
                      }}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save Changes
                    </Button>
                  </CardFooter>
                </>
              ) : (
                // View Mode
                <>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${categoryInfo.color} bg-current/10`}>
                          {categoryInfo.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{prompt.name}</CardTitle>
                            {prompt.is_default && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <CardDescription className="text-xs mt-0.5">
                            {categoryInfo.label}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyContent(prompt)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          title="Copy content"
                        >
                          {copiedId === prompt.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditingId(prompt.id)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDeletePrompt(prompt.id)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/10 rounded-lg p-3 text-sm text-muted-foreground/80 whitespace-pre-wrap leading-relaxed">
                      {prompt.content}
                    </div>
                  </CardContent>
                  {!prompt.is_default && (
                    <CardFooter className="pt-0">
                      <button
                        onClick={() => handleSetDefault(prompt.id)}
                        className="text-xs text-purple-500 hover:text-purple-400 transition-colors"
                      >
                        Set as default prompt
                      </button>
                    </CardFooter>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      {/* Tips */}
      <Card className="border-dashed border-border/50 bg-muted/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Tips for effective prompts:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground/80">
                <li>System prompts define the AI's role and behavior</li>
                <li>Context prompts provide background information</li>
                <li>Format prompts control how responses are structured</li>
                <li>Keep prompts concise but clear for best results</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
