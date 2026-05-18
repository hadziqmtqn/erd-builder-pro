import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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

  // New Model Form State
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
      return; // Guest: no DB settings to load
    }
    setIsLoading(true);
    try {
      // 1. Fetch Providers
      const { data: provData, error: provError } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('is_active', true)
        .order('id');

      if (provError) throw provError;
      setProviders(provData || []);
      
      // Set default tab if none is active
      if (provData && provData.length > 0 && !activeTab) {
        setActiveTab('api-config');
      }

      // 2. Fetch User Configs (skip for guests - no DB config)
      if (!isGuest) {
        const { data: configData, error: configError } = await supabase
          .from('user_ai_configs')
          .select('*')
          .eq('user_id', user.id);
        
        if (configError) throw configError;
        const configMap: Record<string, UserAIConfig> = {};
        configData?.forEach(c => {
          const provider = provData?.find(p => p.id === c.provider_id);
          if (provider) configMap[provider.code] = c;
        });
        setConfigs(configMap);
      }

      // 3. Fetch Models
      const { data: modelData, error: modelError } = await supabase
        .from('ai_models')
        .select('*')
        .eq('is_active', true);

      if (modelError) throw modelError;
      const modelMap: Record<string, AIModel[]> = {};
      modelData?.forEach(m => {
        if (!modelMap[m.provider_id]) modelMap[m.provider_id] = [];
        modelMap[m.provider_id].push(m);
      });
      setModels(modelMap);

      // 4. Fetch System Prompts
      const { data: promptData, error: promptError } = await supabase
        .from('ai_system_prompts')
        .select('*')
        .order('created_at', { ascending: false });

      if (promptError) throw promptError;
      setPrompts(promptData || []);

    } catch (error: any) {
      toast.error('Failed to load AI settings: ' + error.message);
    } finally {
      setIsLoading(false);
    }
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
      // 1. Update Provider Base URL if needed
      if (provider.code === 'openai_compatible') {
        const { error: pError } = await supabase
          .from('ai_providers')
          .update({ base_url: provider.base_url })
          .eq('id', provider.id);
        if (pError) throw pError;
      }

      // 2. Update User Config
      const { error } = await supabase
        .from('user_ai_configs')
        .upsert({
          user_id: user.id,
          provider_id: provider.id,
          api_key: config.api_key,
          selected_model_id: config.selected_model_id,
          is_enabled: config.is_enabled ?? true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,provider_id' });

      if (error) throw error;
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
        // Clean trailing slashes
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
        const { error } = await supabase
          .from('ai_models')
          .update({
            provider_id: newModel.provider_id,
            model_identifier: newModel.model_identifier,
            display_name: newModel.display_name,
          })
          .eq('id', editingModelId);
        
        if (error) throw error;
        toast.success('Model updated successfully!');
      } else {
        const { error } = await supabase
          .from('ai_models')
          .insert([{
            provider_id: newModel.provider_id,
            model_identifier: newModel.model_identifier,
            display_name: newModel.display_name,
            is_active: true
          }]);

        if (error) throw error;
        toast.success('Model added successfully!');
      }
      
      setNewModel({ provider_id: '', model_identifier: '', display_name: '' });
      setEditingModelId(null);
      await fetchData();
    } catch (error: any) {
      toast.error('Failed to process model: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteModel = async (id: number | string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('ai_models').delete().eq('id', id);
      if (error) throw error;
      toast.success('Model deleted');
      await fetchData();
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
      if (editingId) {
        const { error } = await supabase
          .from('ai_system_prompts')
          .update({
            name: formData.name,
            content: formData.content,
            category: formData.category,
            is_default: formData.is_default,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Prompt updated successfully');
      } else {
        const { error } = await supabase
          .from('ai_system_prompts')
          .insert([{
            name: formData.name,
            content: formData.content,
            category: formData.category,
            is_default: formData.is_default,
            user_id: user.id
          }]);
        if (error) throw error;
        toast.success('Prompt created successfully');
      }
      await fetchData();
    } catch (error: any) {
      toast.error('Failed to save prompt: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('ai_system_prompts').delete().eq('id', id);
      if (error) throw error;
      toast.success('Prompt deleted');
      await fetchData();
    } catch (error: any) {
      toast.error('Failed to delete prompt: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePromptDefault = async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_system_prompts')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
      toast.success('System prompt activated');
      await fetchData();
    } catch (error: any) {
      toast.error('Failed to activate prompt: ' + error.message);
    }
  };

  const handleInitializeProviders = async () => {
    setIsSaving(true);
    try {
      const defaultProviders = [
        { name: 'OpenAI', code: 'openai', base_url: 'https://api.openai.com/v1', is_active: true },
        { name: 'Google Gemini', code: 'gemini', base_url: null, is_active: true },
        { name: 'OpenAI Compatible', code: 'openai_compatible', base_url: 'https://api.sumopod.com/v1', is_active: true }
      ];

      const { data: insertedProviders, error: pError } = await supabase
        .from('ai_providers')
        .insert(defaultProviders)
        .select();

      if (pError) throw pError;

      if (insertedProviders) {
        const modelsToInsert: any[] = [];
        insertedProviders.forEach(p => {
          if (p.code === 'openai') {
            modelsToInsert.push(
              { provider_id: p.id, model_identifier: 'gpt-4o', display_name: 'GPT-4o (Smartest)', is_active: true },
              { provider_id: p.id, model_identifier: 'gpt-4o-mini', display_name: 'GPT-4o Mini (Fast)', is_active: true }
            );
          } else if (p.code === 'gemini') {
            modelsToInsert.push(
              { provider_id: p.id, model_identifier: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro', is_active: true },
              { provider_id: p.id, model_identifier: 'gemini-1.5-flash', display_name: 'Gemini 1.5 Flash', is_active: true }
            );
          }
        });

        if (modelsToInsert.length > 0) {
          const { error: mError } = await supabase.from('ai_models').insert(modelsToInsert);
          if (mError) throw mError;
        }
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
