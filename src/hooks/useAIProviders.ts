import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { AIProvider, UserAIConfig, AIModel } from '@/types';
import { toast } from 'sonner';

export const useAIProviders = () => {
  const { user, isGuest } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [configs, setConfigs] = useState<Record<string, UserAIConfig>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    if (!userRef.current) return;
    if (isGuest) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const [provRes, configsRes] = await Promise.all([
        apiFetch('/api/ai/settings/providers'),
        apiFetch('/api/ai/settings/configs'),
      ]);

      if (!provRes.ok) throw new Error((await provRes.json()).error || 'Failed to fetch providers');
      const provData: AIProvider[] = await provRes.json();
      setProviders(provData);

      if (configsRes.ok) {
        const configData: UserAIConfig[] = await configsRes.json();
        const configMap: Record<string, UserAIConfig> = {};
        configData.forEach(c => {
          const provider = provData.find(p => String(p.id) === String(c.provider_id));
          if (provider) configMap[provider.code] = c;
        });
        setConfigs(configMap);
      }
    } catch (error: any) {
      toast.error('Failed to load AI settings: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [isGuest]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveConfig = async (providerCode: string) => {
    const config = configs[providerCode];
    const provider = providers.find(p => p.code === providerCode);
    if (!config || !provider || !user) return;

    setIsSaving(true);
    try {
      // Provider URLs are global settings; only an admin may persist them.
      const isAdmin = Boolean((user as any).isSuperAdmin || (user as any).is_super_admin);
      if (isAdmin && provider.base_url !== undefined) {
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

      // Build payload — skip api_key if it's '***' (masked placeholder, already saved)
      const payload: Record<string, any> = {
        provider_id: provider.id,
        selected_model_id: config.selected_model_id ?? null,
        is_enabled: config.is_enabled ?? true,
      };
      if (config.api_key && config.api_key !== '***') {
        payload.api_key = config.api_key;
      }

      const cRes = await apiFetch('/api/ai/settings/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!cRes.ok) {
        const err = await cRes.json();
        throw new Error(err.error || 'Failed to save configuration');
      }

      const cData = await cRes.json();
      if (cData && cData.provider_id) {
        const matchedProvider = providers.find(p => String(p.id) === String(cData.provider_id));
        if (matchedProvider) {
          setConfigs(prev => ({ ...prev, [matchedProvider.code]: cData }));
        }
      }

      toast.success(`${provider.name} configuration saved successfully!`);
    } catch (error: any) {
      toast.error('Failed to save configuration: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (providerCode: string, allModels?: AIModel[]) => {
    const provider = providers.find(p => p.code === providerCode);
    const config = configs[providerCode];
    if (!provider || !config) return;

    const modelObj = allModels?.find(m => String(m.id) === String(config.selected_model_id));
    const modelId = modelObj?.model_identifier;

    setIsTesting(prev => ({ ...prev, [providerCode]: true }));

    try {
      const res = await apiFetch('/api/ai/settings/configs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_code: providerCode, model_identifier: modelId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Connection failed (${res.status})`);
      }

      toast.success(`Connection to ${provider.name} successful!`);
    } catch (error: any) {
      console.error('Test Connection Error:', error);
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setIsTesting(prev => ({ ...prev, [providerCode]: false }));
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
    isLoading,
    isSaving,
    isTesting,
    handleSaveConfig,
    handleTestConnection,
    handleInitializeProviders,
    updateProviderLocal,
    updateConfigLocal,
  };
};
