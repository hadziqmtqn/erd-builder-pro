import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { AIProvider, UserAIConfig, AIModel, AISystemPrompt } from '@/types';
import { toast } from 'sonner';

export const useAISettings = () => {
  const { user, isGuest } = useAuth();
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [configs, setConfigs] = useState<Record<string, UserAIConfig>>({});
  const [models, setModels] = useState<Record<string, AIModel[]>>({});
  const [prompts, setPrompts] = useState<AISystemPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<string>('');

  const [editingModelId, setEditingModelId] = useState<number | string | null>(null);
  const [newModel, setNewModel] = useState({
    provider_id: '',
    model_identifier: '',
    display_name: ''
  });

  const fetchData = async () => {
    if (!user) return;
    if (isGuest) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [provRes, configsRes, modelsRes, promptsRes] = await Promise.all([
        apiFetch('/api/ai/settings/providers'),
        apiFetch('/api/ai/settings/configs'),
        apiFetch('/api/ai/settings/models'),
        apiFetch('/api/ai/settings/prompts'),
      ]);

      if (!provRes.ok) {
        const err = await provRes.json();
        throw new Error(err.error || 'Failed to fetch providers');
      }
      const provData: AIProvider[] = await provRes.json();
      setProviders(provData);

      if (provData.length > 0 && !activeTab) {
        setActiveTab('api-config');
      }

      if (configsRes.ok) {
        const configData: UserAIConfig[] = await configsRes.json();
        const configMap: Record<string, UserAIConfig> = {};
        configData.forEach(c => {
          const provider = provData.find(p => p.id === c.provider_id);
          if (provider) configMap[provider.code] = c;
        });
        setConfigs(configMap);
      }

      if (modelsRes.ok) {
        const modelData: AIModel[] = await modelsRes.json();
        const modelMap: Record<string, AIModel[]> = {};
        modelData.forEach(m => {
          if (!modelMap[m.provider_id]) modelMap[m.provider_id] = [];
          modelMap[m.provider_id].push(m);
        });
        setModels(modelMap);
      }

      if (promptsRes.ok) {
        const promptData: AISystemPrompt[] = await promptsRes.json();
        setPrompts(promptData);
      }
    } catch (error: any) {
      toast.error('Failed to load AI settings: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchModelsData = async () => {
    if (!user || isGuest) return;
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
  };

  const fetchPromptsData = async () => {
    if (!user || isGuest) return;
    try {
      const res = await apiFetch('/api/ai/settings/prompts');
      if (!res.ok) return;
      const promptData: AISystemPrompt[] = await res.json();
      setPrompts(promptData);
    } catch {}
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
  };

  const handleSaveConfig = async (providerCode: string) => {
    const config = configs[providerCode];
    const provider = providers.find(p => p.code === providerCode);
    if (!config || !provider || !user) return;

    setIsSaving(true);
    try {
      if (provider.code === 'openai_compatible' && provider.base_url !== undefined) {
        const pRes = await apiFetch(`/api/ai/settings/providers/${provider.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_url: provider.base_url }),
        });
        if (!pRes.ok) {
          const err = await pRes.json();
          throw new Error(err.error || 'Failed to update provider');
        }
      }

      const cRes = await apiFetch('/api/ai/settings/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: provider.id,
          api_key: config.api_key,
          selected_model_id: config.selected_model_id,
          is_enabled: config.is_enabled ?? true,
        }),
      });

      if (!cRes.ok) {
        const err = await cRes.json();
        throw new Error(err.error || 'Failed to save configuration');
      }
      toast.success(`${provider.name} configuration saved successfully!`);
    } catch (error: any) {
      toast.error('Failed to save configuration: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (providerCode: string) => {
    const provider = providers.find(p => p.code === providerCode);
    const config = configs[providerCode];

    if (!provider || !config || !config.api_key) {
      toast.error('Please enter an API Key first');
      return;
    }

    const modelObj = Object.values(models).flat().find(m => String(m.id) === String(config.selected_model_id));
    const modelId = modelObj?.model_identifier || (providerCode === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');

    setIsTesting(prev => ({ ...prev, [providerCode]: true }));
    
    try {
      if (providerCode === 'openai' || providerCode === 'openai_compatible') {
        let baseUrl = provider.base_url || 'https://api.openai.com/v1';
        baseUrl = baseUrl.replace(/\/+$/, '');
        
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.api_key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5
          })
        }).catch(err => {
          if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            throw new Error('Network error or CORS policy. Ensure your custom provider allows requests from this domain.');
          }
          throw err;
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API Error: ${response.status} ${response.statusText}`);
        }
        toast.success(`Connection to ${provider.name} successful!`);
      } 
      else if (providerCode === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${config.api_key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'hi' }] }]
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API Error: ${response.status} ${response.statusText}`);
        }
        toast.success(`Connection to Google Gemini successful!`);
      }
    } catch (error: any) {
      console.error('Test Connection Error:', error);
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setIsTesting(prev => ({ ...prev, [providerCode]: false }));
    }
  };

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

  const handleSavePrompt = async (formData: Partial<AISystemPrompt>, editingId: string | null) => {
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

  const handleInitializeProviders = async () => {
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/ai/settings/initialize', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to initialize');
      }
      toast.success('AI System initialized!');
      fetchData();
    } catch (error: any) {
      toast.error('Failed to initialize: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateProviderLocal = (providerCode: string, updates: Partial<AIProvider>) => {
    setProviders(prev => prev.map(p => p.code === providerCode ? { ...p, ...updates } : p));
  };

  const updateConfigLocal = (providerCode: string, updates: Partial<UserAIConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [providerCode]: {
        ...(prev[providerCode] || { api_key: '', is_enabled: true, user_id: user?.id, provider_id: providers.find(p => p.code === providerCode)?.id }),
        ...updates
      } as UserAIConfig
    }));
  };

  return {
    providers,
    configs,
    models,
    prompts,
    isLoading,
    isSaving,
    isTesting,
    activeTab,
    newModel,
    editingModelId,
    setNewModel,
    setEditingModelId,
    handleTabChange,
    handleSaveConfig,
    handleTestConnection,
    handleAddModel,
    handleDeleteModel,
    handleSavePrompt,
    handleDeletePrompt,
    togglePromptDefault,
    handleInitializeProviders,
    updateProviderLocal,
    updateConfigLocal,
    startEditingModel: (model: AIModel) => {
      setEditingModelId(model.id);
      setNewModel({
        provider_id: String(model.provider_id),
        model_identifier: model.model_identifier,
        display_name: model.display_name
      });
    },
    cancelEdit: () => {
      setEditingModelId(null);
      setNewModel({ provider_id: '', model_identifier: '', display_name: '' });
    }
  };
};
