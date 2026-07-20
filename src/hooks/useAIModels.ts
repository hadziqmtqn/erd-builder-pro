import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { AIModel } from '@/types';
import { toast } from 'sonner';

export const useAIModels = () => {
  const { user, isGuest } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const [models, setModels] = useState<Record<string, AIModel[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingModelId, setEditingModelId] = useState<number | string | null>(null);
  const [newModel, setNewModel] = useState({
    provider_id: '',
    model_identifier: '',
    display_name: ''
  });

  const fetchModelsData = useCallback(async () => {
    if (!userRef.current || isGuest) return;
    try {
      const res = await apiFetch('/api/ai/settings/models');
      if (!res.ok) return;
      const modelData: AIModel[] = await res.json();
      const modelMap: Record<string, AIModel[]> = {};
      modelData.forEach(m => {
        if (!modelMap[m.provider_id]) modelMap[m.provider_id] = [];
        modelMap[m.provider_id].push(m);
      });
      setModels(modelMap);
    } catch {}
  }, [isGuest]);

  useEffect(() => {
    setIsLoading(false);
    fetchModelsData();
  }, [fetchModelsData]);

  const handleAddModel = async () => {
    if (!newModel.provider_id || !newModel.model_identifier || !newModel.display_name) {
      toast.error('Please fill in all model fields');
      return;
    }

    setIsSaving(true);
    try {
      if (editingModelId) {
        const res = await apiFetch(`/api/ai/settings/models/${editingModelId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_id: newModel.provider_id,
            model_identifier: newModel.model_identifier,
            display_name: newModel.display_name,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update model');
        }
        toast.success('Model updated successfully!');
      } else {
        const res = await apiFetch('/api/ai/settings/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_id: newModel.provider_id,
            model_identifier: newModel.model_identifier,
            display_name: newModel.display_name,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add model');
        }
        toast.success('Model added successfully!');
      }

      setNewModel({ provider_id: '', model_identifier: '', display_name: '' });
      setEditingModelId(null);
      await fetchModelsData();
    } catch (error: any) {
      toast.error('Failed to process model: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteModel = async (id: number | string) => {
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/ai/settings/models/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete model');
      }
      toast.success('Model deleted');
      await fetchModelsData();
    } catch (error: any) {
      toast.error('Failed to delete model: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const ensureModel = async (model: { provider_id: number | string; model_identifier: string; display_name?: string }) => {
    const res = await apiFetch('/api/ai/settings/models/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save model');
    }
    const saved: AIModel = await res.json();
    setModels(prev => {
      const key = String(saved.provider_id);
      const current = prev[key] || [];
      return {
        ...prev,
        [key]: current.some(m => String(m.id) === String(saved.id))
          ? current.map(m => String(m.id) === String(saved.id) ? saved : m)
          : [...current, saved].sort((a, b) => a.display_name.localeCompare(b.display_name)),
      };
    });
    return saved;
  };

  const startEditingModel = (model: AIModel) => {
    setEditingModelId(model.id);
    setNewModel({
      provider_id: String(model.provider_id),
      model_identifier: model.model_identifier,
      display_name: model.display_name
    });
  };

  const cancelEdit = () => {
    setEditingModelId(null);
    setNewModel({ provider_id: '', model_identifier: '', display_name: '' });
  };

  return {
    models,
    isLoading,
    isSaving,
    editingModelId,
    newModel,
    setNewModel,
    setEditingModelId,
    handleAddModel,
    handleDeleteModel,
    ensureModel,
    startEditingModel,
    cancelEdit,
    refresh: fetchModelsData,
  };
};
