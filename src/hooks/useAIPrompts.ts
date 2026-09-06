import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { AISystemPrompt } from '@/types';
import { toast } from 'sonner';

type PromptFormData = Partial<AISystemPrompt> & { is_global?: boolean };

export const useAIPrompts = () => {
  const { user, isGuest } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const [prompts, setPrompts] = useState<AISystemPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPromptsData = useCallback(async () => {
    if (!userRef.current || isGuest) return;
    try {
      const res = await apiFetch('/api/ai/settings/prompts');
      if (!res.ok) return;
      const promptData: AISystemPrompt[] = await res.json();
      setPrompts(promptData);
    } catch {}
  }, [isGuest]);

  useEffect(() => {
    setIsLoading(false);
    fetchPromptsData();
  }, [fetchPromptsData]);

  const handleSavePrompt = async (formData: PromptFormData, editingId: string | null) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/ai/settings/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          name: formData.name,
          content: formData.content,
          category: formData.category,
          is_default: formData.is_default,
          is_global: formData.is_global,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save prompt');
      }
      toast.success(editingId ? 'Prompt updated successfully' : 'Prompt created successfully');
      await fetchPromptsData();
    } catch (error: any) {
      toast.error('Failed to save prompt: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/ai/settings/prompts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete prompt');
      }
      toast.success('Prompt deleted');
      await fetchPromptsData();
    } catch (error: any) {
      toast.error('Failed to delete prompt: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePromptDefault = async (id: string) => {
    if (isGuest) return;
    try {
      const current = prompts.find(p => p.id === id);
      const willBeActive = current ? !current.is_default : true;

      const res = await apiFetch(`/api/ai/settings/prompts/${id}/toggle-default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: willBeActive }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update prompt');
      }
      toast.success(willBeActive ? 'System prompt activated' : 'System prompt deactivated');
      await fetchPromptsData();
    } catch (error: any) {
      toast.error('Failed to update prompt: ' + error.message);
    }
  };

  return {
    prompts,
    isLoading,
    isSaving,
    handleSavePrompt,
    handleDeletePrompt,
    togglePromptDefault,
    refresh: fetchPromptsData,
  };
};
