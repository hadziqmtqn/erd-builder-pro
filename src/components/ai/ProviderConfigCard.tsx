import React, { useState } from 'react';
import { 
  Globe, 
  Lock, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Save,
  Brain
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '../ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { AIProvider, UserAIConfig, AIModel } from '@/types';

interface ProviderConfigCardProps {
  provider: AIProvider;
  config: UserAIConfig;
  models: AIModel[];
  isSaving: boolean;
  isTesting: boolean;
  onSave: (code: string) => void;
  onTest: (code: string) => void;
  onUpdateProvider: (code: string, updates: Partial<AIProvider>) => void;
  onUpdateConfig: (code: string, updates: Partial<UserAIConfig>) => void;
}

export const ProviderConfigCard: React.FC<ProviderConfigCardProps> = ({
  provider,
  config,
  models,
  isSaving,
  isTesting,
  onSave,
  onTest,
  onUpdateProvider,
  onUpdateConfig
}) => {
  const [showKey, setShowKey] = useState(false);

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur-sm shadow-xl transition-all hover:shadow-purple-500/5">
      <CardHeader className="border-b border-border/30 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl md:text-2xl font-bold">{provider.name}</CardTitle>
              {config?.is_enabled && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20 uppercase tracking-wider">
                  Active
                </span>
              )}
            </div>
            <CardDescription className="text-muted-foreground/70 tracking-tight">
              Configure your {provider.name} API credentials and preferences.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 py-1 bg-muted/30 rounded">
              {config?.is_enabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch 
              id={`${provider.code}-status`}
              checked={config?.is_enabled ?? false}
              onCheckedChange={(val: boolean) => onUpdateConfig(provider.code, { is_enabled: val })}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6 md:space-y-8 p-4 md:p-8">
        {/* Base URL — shown for all providers */}
        <div className="space-y-3">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Base URL</Label>
          <div className="relative group">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-purple-500" />
            <Input 
              placeholder={{
                openai: 'https://api.openai.com/v1',
                gemini: 'https://generativelanguage.googleapis.com/v1beta',
                openai_compatible: 'https://api.your-provider.com/v1',
              }[provider.code] || 'https://api.openai.com/v1'}
              value={provider.base_url || ''} 
              onChange={(e) => onUpdateProvider(provider.code, { base_url: e.target.value })}
              className="pl-10 h-11 bg-muted/10 border-border/50 transition-all focus:ring-purple-500/20 text-sm md:text-base"
            />
          </div>
          <p className="text-[10px] md:text-[11px] text-muted-foreground ml-1">API endpoint URL for this provider. Change if you use a proxy or self-hosted endpoint.</p>
        </div>

        <div className="space-y-3">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">API Key</Label>
          <div className="relative group">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-purple-500" />
            <Input 
              type={showKey ? 'text' : 'password'}
              placeholder={`Enter your ${provider.name} API Key`}
              value={config?.api_key || ''}
              onChange={(e) => onUpdateConfig(provider.code, { api_key: e.target.value })}
              className="pl-10 pr-10 h-11 bg-muted/10 border-border/50 transition-all focus:ring-purple-500/20 text-sm md:text-base"
            />
            <button 
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] md:text-[11px] text-muted-foreground/60 ml-1">
            <Lock className="w-3 h-3" />
            Your API Key is stored securely and never shared.
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Default Model</Label>
          <Select 
            value={config?.selected_model_id ? String(config?.selected_model_id) : ""} 
            onValueChange={(val: string | null) => onUpdateConfig(provider.code, { selected_model_id: val || undefined })}
          >
            <SelectTrigger className="h-11 bg-muted/10 border-border/50 transition-all focus:ring-purple-500/20 text-sm md:text-base">
              <SelectValue>
                {models?.find(m => String(m.id) === String(config?.selected_model_id))?.display_name || "Select a model"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {models?.map(m => (
                <SelectItem key={m.id} value={String(m.id)}>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{m.display_name}</span>
                    <span className="text-[10px] text-muted-foreground">{m.model_identifier}</span>
                  </div>
                </SelectItem>
              ))}
              {(!models || models.length === 0) && (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No models available for this provider.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/5 border-t border-border/30 p-4 md:px-6 md:py-4 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
        <button
          type="button"
          onClick={() => onTest(provider.code)}
          disabled={isTesting}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium whitespace-nowrap transition-colors h-8 px-2.5 bg-background hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none order-2 sm:order-1"
        >
          {isTesting ? (
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
          className="w-full sm:w-auto gap-2 px-6 order-1 sm:order-2"
          disabled={isSaving}
        >
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardFooter>
    </Card>
  );
};
