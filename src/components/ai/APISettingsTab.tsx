import React, { useState, useMemo } from 'react';
import { 
  Globe, 
  Lock, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Save,
  Zap,
  Bot,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { AIProvider, UserAIConfig, AIModel } from '@/types';

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
  onUpdateConfig
}) => {
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
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

  // Sort providers: openai_compatible first, then the rest
  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      if (a.code === 'openai_compatible') return -1;
      if (b.code === 'openai_compatible') return 1;
      return 0;
    });
  }, [providers]);

  const toggleShowKey = (code: string) => {
    setShowKey(prev => ({ ...prev, [code]: !prev[code] }));
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
    <div className="space-y-6">
      {/* Provider Tabs as Cards */}
      <Tabs 
        value={selectedProviderCode} 
        onValueChange={setSelectedProviderCode}
        className="w-full"
      >
        <div 
          className="w-full overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style>{`.w-full.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
          <TabsList className="inline-flex w-max min-w-full h-auto p-0 bg-transparent gap-3">
            {sortedProviders.map(provider => (
              <TabsTrigger 
                key={provider.code} 
                value={provider.code}
                className="flex-shrink-0 p-0 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl border border-border/40 bg-muted/5 transition-all 
                              hover:bg-muted/10 hover:border-border/60
                              [[data-selected]_&]:border-purple-500/50 [[data-selected]_&]:bg-background [[data-selected]_&]:shadow-xl [[data-selected]_&]:shadow-purple-500/10 [[data-selected]_&]:scale-[1.02]">
                  {provider.code === 'openai' && <Lock className="w-5 h-5 text-muted-foreground [[data-selected]_&]:text-purple-500 transition-colors" />}
                  {provider.code === 'gemini' && <Zap className="w-5 h-5 text-muted-foreground [[data-selected]_&]:text-purple-500 transition-colors" />}
                  {provider.code === 'openai_compatible' && <Globe className="w-5 h-5 text-muted-foreground [[data-selected]_&]:text-purple-500 transition-colors" />}
                  <span className="font-semibold text-sm text-muted-foreground [[data-selected]_&]:text-white transition-colors">
                    {provider.name}
                  </span>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {sortedProviders.map(provider => {
          const config = configs[provider.code];
          const providerModels = models[provider.id] || [];
          
          return (
            <TabsContent key={provider.code} value={provider.code} className="mt-0">
              <Card className="border border-border/50 bg-background/50 backdrop-blur-sm shadow-lg">
                <CardHeader className="border-b border-border/30 pb-6">
                  <div className="flex items-center gap-3">
                    {provider.code === 'openai' && <Lock className="w-6 h-6 text-purple-500" />}
                    {provider.code === 'gemini' && <Zap className="w-6 h-6 text-purple-500" />}
                    {provider.code === 'openai_compatible' && <Globe className="w-6 h-6 text-purple-500" />}
                    <CardTitle className="text-xl md:text-2xl font-bold">{provider.name}</CardTitle>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-6 p-4 md:p-6">
                  {/* Base URL for OpenAI Compatible */}
                  {provider.code === 'openai_compatible' && (
                    <Field>
                      <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                        <Globe className="size-3" />
                        Base URL
                      </FieldLabel>
                      <Input 
                        placeholder="https://api.your-provider.com/v1" 
                        value={provider.base_url || ''} 
                        onChange={(e) => onUpdateProvider(provider.code, { base_url: e.target.value })}
                        className="h-9 text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground/70 mt-1 px-1">
                        Custom endpoint for OpenAI-compatible providers (Ollama, Groq, etc.)
                      </p>
                    </Field>
                  )}

                  {/* API Key */}
                  <Field>
                    <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                      <Lock className="size-3" />
                      API Key
                    </FieldLabel>
                    <div className="relative">
                      <Input 
                        type={showKey[provider.code] ? 'text' : 'password'}
                        placeholder={`Enter your ${provider.name} API Key`}
                        value={config?.api_key || ''}
                        onChange={(e) => onUpdateConfig(provider.code, { api_key: e.target.value })}
                        className="h-9 text-sm pr-10"
                      />
                      <button 
                        type="button"
                        onClick={() => toggleShowKey(provider.code)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showKey[provider.code] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 px-1">
                      <Lock className="w-3 h-3" />
                      Your API Key is stored securely and never shared.
                    </div>
                  </Field>

                  {/* Default Model */}
                  <Field>
                    <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                      <Bot className="size-3" />
                      Default Model
                    </FieldLabel>
                    <Select 
                      value={config?.selected_model_id ? String(config?.selected_model_id) : ""} 
                      onValueChange={(val: string | null) => onUpdateConfig(provider.code, { selected_model_id: val || undefined })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue>
                          {providerModels.find(m => String(m.id) === String(config?.selected_model_id))?.display_name || "Select a model"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {providerModels.map(m => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{m.display_name}</span>
                              <span className="text-[10px] text-muted-foreground">{m.model_identifier}</span>
                            </div>
                          </SelectItem>
                        ))}
                        {providerModels.length === 0 && (
                          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                            No models available for this provider.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Enable Provider Checkbox - below Default Model */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onUpdateConfig(provider.code, { is_enabled: !config?.is_enabled })}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        config?.is_enabled 
                          ? 'bg-purple-500 border-purple-500' 
                          : 'border-muted-foreground/40 hover:border-muted-foreground/60'
                      }`}
                    >
                      {config?.is_enabled && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="text-sm font-medium cursor-pointer select-none">
                      Enable this provider
                    </span>
                  </div>
                </CardContent>

                <CardFooter className="bg-muted/5 border-t border-border/30 p-4 md:px-6 md:py-4 flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => onTest(provider.code)}
                    disabled={isTesting[provider.code] || !config?.api_key}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium whitespace-nowrap transition-colors h-10 px-4 bg-background hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none"
                  >
                    {isTesting[provider.code] ? (
                      <>
                        <RefreshCw className="w-4 h-4 shrink-0 animate-spin pointer-events-none" />
                        <span className="pointer-events-none">Testing...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 shrink-0 pointer-events-none" />
                        <span className="pointer-events-none">Test Connection</span>
                      </>
                    )}
                  </button>
                  <Button 
                    onClick={() => onSave(provider.code)}
                    className="gap-2 px-6"
                    disabled={isSaving}
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? 'Saving...' : 'Save Configuration'}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};
