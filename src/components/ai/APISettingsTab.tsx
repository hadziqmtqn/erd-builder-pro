import React, { useState, useEffect, useMemo } from 'react';
import { Globe, Lock, Eye, EyeOff, RefreshCw, Save, Zap, Bot, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { AIProvider, UserAIConfig, AIModel } from '@/types';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/SearchableSelect';

interface APISettingsTabProps {
  providers: AIProvider[];
  configs: Record<string, UserAIConfig>;
  models: Record<string, AIModel[]>;
  isSaving: boolean;
  isTesting: Record<string, boolean>;
  onSave: (code: string) => void;
  onTest: (code: string) => void;
  onUpdateProvider: (code: string, updates: Partial<AIProvider>) => void;
  onUpdateConfig: (code: string, updates: Partial<UserAIConfig>) => void;
  onEnsureModel: (model: { provider_id: number | string; model_identifier: string; display_name?: string }) => Promise<AIModel>;
  onRefreshModels: () => Promise<void>;
}

export const APISettingsTab: React.FC<APISettingsTabProps> = ({
  providers,
  configs,
  models,
  isSaving,
  isTesting,
  onSave,
  onTest,
  onUpdateProvider,
  onUpdateConfig,
  onEnsureModel,
  onRefreshModels
}) => {
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [liveModels, setLiveModels] = useState<Record<string, { model_identifier: string; display_name: string }[]>>({});
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [selectedProviderCode, setSelectedProviderCode] = useState<string>(
    () => {
      const sorted = [...providers].sort((a, b) => {
        if (a.code === 'openai_compatible') return -1;
        if (b.code === 'openai_compatible') return 1;
        return 0;
      });
      return sorted.length > 0 ? sorted[0].code : '';
    }
  );

  const selectedProvider = providers.find(p => p.code === selectedProviderCode);
  const selectedConfig = selectedProvider ? configs[selectedProvider.code] : undefined;
  const selectedModels = selectedProvider ? (models[selectedProvider.id] || []) : [];
  const liveOptions = selectedProvider ? (liveModels[selectedProvider.code] || []) : [];
  const combinedModels = useMemo(() => {
    const seen = new Set(selectedModels.map(m => m.model_identifier));
    return [
      ...selectedModels.map(m => ({ id: String(m.id), model_identifier: m.model_identifier, display_name: m.display_name, saved: true })),
      ...liveOptions.filter(m => !seen.has(m.model_identifier)).map(m => ({ id: `live:${m.model_identifier}`, ...m, saved: false })),
    ];
  }, [selectedModels, liveOptions]);

  // Auto-heal: if selected_model_id references a model that no longer exists
  // (e.g. after Docker deploy re-seeded models with new IDs), clear it so
  // user doesn't accidentally save a stale reference.
  useEffect(() => {
    if (!selectedProvider || !selectedConfig?.selected_model_id) return;
    if (selectedModels.length === 0) return; // models still loading, don't clear
    if (!selectedModels.some(m => String(m.id) === String(selectedConfig.selected_model_id))) {
      onUpdateConfig(selectedProvider.code, { selected_model_id: undefined });
    }
  }, [selectedProvider?.code, selectedConfig?.selected_model_id, selectedModels.length]);

  // Sort providers: openai_compatible first, then the rest
  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      if (a.code === 'openai_compatible') return -1;
      if (b.code === 'openai_compatible') return 1;
      return 0;
    });
  }, [providers]);

  useEffect(() => {
    if (sortedProviders.length && !sortedProviders.some(p => p.code === selectedProviderCode)) {
      setSelectedProviderCode(sortedProviders[0].code);
    }
  }, [sortedProviders, selectedProviderCode]);

  const toggleShowKey = (code: string) => {
    setShowKey(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const fetchLiveModels = async () => {
    if (!selectedProvider || selectedProvider.code !== 'openai_compatible') return;
    setIsFetchingModels(true);
    try {
      const res = await apiFetch('/api/ai/settings/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: selectedProvider.id,
          provider_code: selectedProvider.code,
          base_url: selectedProvider.base_url,
          api_key: selectedConfig?.api_key,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch models');
      }
      const fetched = await res.json();
      setLiveModels(prev => ({ ...prev, [selectedProvider.code]: fetched }));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const selectModel = async (value: string) => {
    if (!selectedProvider) return;
    if (!value.startsWith('live:')) {
      onUpdateConfig(selectedProvider.code, { selected_model_id: value });
      return;
    }

    try {
      const identifier = value.slice(5);
      const live = liveOptions.find(m => m.model_identifier === identifier);
      const saved = await onEnsureModel({
        provider_id: selectedProvider.id,
        model_identifier: identifier,
        display_name: live?.display_name || identifier,
      });
      onUpdateConfig(selectedProvider.code, { selected_model_id: saved.id });
      await onRefreshModels();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (providers.length === 0) {
    return (
      <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No AI providers configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Provider tabs — same style as AIRulesTab */}
      <div 
        className="w-full overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`.w-full.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
        <div className="flex gap-1 bg-muted border border-border rounded-lg p-1 w-fit">
          {sortedProviders.map(provider => (
            <button
              key={provider.code}
              onClick={() => setSelectedProviderCode(provider.code)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                selectedProviderCode === provider.code
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {provider.code === 'openai' && <Lock className="w-3.5 h-3.5" />}
              {provider.code === 'gemini' && <Zap className="w-3.5 h-3.5" />}
              {provider.code === 'openai_compatible' && <Globe className="w-3.5 h-3.5" />}
              {provider.name}
              {configs[provider.code]?.is_enabled && (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Active" />
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedProvider && (
        <Card className="border-border/60 shadow-none">
          <CardContent className="space-y-5 p-4 md:p-5">
            <div className="flex items-center gap-3 border-b border-border/40 pb-4">
              {selectedProvider.code === 'openai' && <Lock className="w-6 h-6 text-purple-500" />}
              {selectedProvider.code === 'gemini' && <Zap className="w-6 h-6 text-purple-500" />}
              {selectedProvider.code === 'openai_compatible' && <Globe className="w-6 h-6 text-purple-500" />}
              <div>
                <h2 className="text-base font-semibold">{selectedProvider.name}</h2>
                <p className="text-xs text-muted-foreground">Credentials, endpoint, and default model.</p>
              </div>
            </div>

            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                <Globe className="size-3" />
                Base URL
              </FieldLabel>
              <Input 
                placeholder={{
                  openai: 'https://api.openai.com/v1',
                  gemini: 'https://generativelanguage.googleapis.com/v1beta',
                  openai_compatible: 'https://api.your-provider.com/v1',
                }[selectedProvider.code] || 'https://api.openai.com/v1'}
                value={selectedProvider.base_url || ''} 
                onChange={(e) => onUpdateProvider(selectedProvider.code, { base_url: e.target.value })}
                className="h-9 text-sm"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                <Lock className="size-3" />
                API Key
              </FieldLabel>
              <div className="relative">
                <Input 
                  type={showKey[selectedProvider.code] ? 'text' : 'password'}
                  placeholder={`Enter your ${selectedProvider.name} API Key`}
                  value={selectedConfig?.api_key || ''}
                  onChange={(e) => onUpdateConfig(selectedProvider.code, { api_key: e.target.value })}
                  className="h-9 text-sm pr-10"
                />
                <button 
                  type="button"
                  onClick={() => toggleShowKey(selectedProvider.code)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey[selectedProvider.code] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                <Bot className="size-3" />
                Default Model
              </FieldLabel>
              <SearchableSelect
                value={selectedConfig?.selected_model_id && combinedModels.some(m => m.id === String(selectedConfig.selected_model_id))
                  ? String(selectedConfig.selected_model_id)
                  : ""}
                onChange={selectModel}
                items={combinedModels}
                placeholder={isFetchingModels ? "Fetching models..." : "Select a model"}
                searchPlaceholder="Search models..."
                emptyMessage={isFetchingModels ? "Fetching models..." : "No models available"}
                className="h-9 text-sm"
                getItemValue={(m) => m.id}
                getItemLabel={(m) => m.display_name}
                filterItem={(m, q) => `${m.display_name} ${m.model_identifier}`.toLowerCase().includes(q.toLowerCase())}
                onOpen={fetchLiveModels}
              />
            </Field>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onUpdateConfig(selectedProvider.code, { is_enabled: !selectedConfig?.is_enabled })}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  selectedConfig?.is_enabled 
                    ? 'bg-purple-500 border-purple-500' 
                    : 'border-muted-foreground/40 hover:border-muted-foreground/60'
                }`}
              >
                {selectedConfig?.is_enabled && <Check className="w-3 h-3 text-white" />}
              </button>
              <span className="text-sm font-medium cursor-pointer select-none">
                Enable this provider
              </span>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/5 border-t border-border/30 p-4 md:px-6 md:py-4 flex flex-col sm:flex-row gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => onTest(selectedProvider.code)}
              disabled={isTesting[selectedProvider.code] || !selectedConfig?.api_key}
              className="gap-2 px-6"
            >
              {isTesting[selectedProvider.code] ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isTesting[selectedProvider.code] ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button 
              onClick={() => onSave(selectedProvider.code)}
              className="gap-2 px-6"
              disabled={isSaving}
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};
