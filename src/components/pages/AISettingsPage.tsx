import React from 'react';
import { 
  Sparkles, 
  Brain, 
  Settings2, 
  RefreshCw, 
  Lock, 
  Globe,
  Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

import { useAISettings } from '@/hooks/useAISettings';
import { ProviderConfigCard } from '@/components/ai/ProviderConfigCard';
import { ModelCatalogTab } from '@/components/ai/ModelCatalogTab';

const AISettingsPage: React.FC = () => {
  const {
    providers,
    configs,
    models,
    isLoading,
    isSaving,
    isTesting,
    activeTab,
    newModel,
    editingModelId,
    setNewModel,
    handleTabChange,
    handleSaveConfig,
    handleTestConnection,
    handleAddModel,
    handleDeleteModel,
    handleInitializeProviders,
    updateProviderLocal,
    updateConfigLocal,
    startEditingModel,
    cancelEdit
  } = useAISettings();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-10 w-64" />
          </div>
          <Skeleton className="h-5 w-full max-w-md" />
        </div>

        {/* Tabs Skeleton */}
        <div className="space-y-6">
          <div className="flex w-full overflow-x-auto h-12 p-1 bg-muted/10 border border-border/30 rounded-lg gap-2">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-full min-w-[120px] rounded-md" />
            ))}
          </div>

          {/* Card Content Skeleton */}
          <Card className="border-border/30 bg-background/30 backdrop-blur-sm">
            <div className="p-6 border-b border-border/30 flex justify-between items-center">
              <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="p-8 space-y-8">
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            </div>
            <div className="p-6 bg-muted/5 border-t border-border/30 flex justify-between">
              <Skeleton className="h-10 w-36 rounded-md" />
              <Skeleton className="h-10 w-44 rounded-md" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-6 text-center space-y-8">
        <div className="mx-auto w-24 h-24 bg-purple-500/10 rounded-3xl flex items-center justify-center border-2 border-purple-500/20 shadow-2xl shadow-purple-500/10">
          <Brain className="w-12 h-12 text-purple-500" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Setup AI Environment</h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Your AI environment needs to be initialized before you can configure your providers.
          </p>
        </div>
        <Button 
          onClick={handleInitializeProviders}
          className="h-12 px-8 rounded-xl gap-3 text-base font-semibold transition-all"
          disabled={isSaving}
        >
          {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          Initialize AI System
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="max-w-4xl mx-auto py-6 md:py-8 px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-xl">
              <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-purple-500" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Configuration</h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-lg">
            Connect your favorite AI providers to power your ERD generation and suggestions.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div 
            className="w-full overflow-x-auto rounded-lg" 
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <style>{`.w-full.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
            <TabsList className="inline-flex w-max min-w-full h-12 p-1 bg-muted/20 border border-border/50 justify-start md:justify-center items-center rounded-lg">
            {providers.map(p => (
              <TabsTrigger 
                key={p.code} 
                value={p.code} 
                className="whitespace-nowrap flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm rounded-md data-[selected]:bg-background data-[selected]:text-purple-500 data-[selected]:shadow-sm transition-all"
              >
                {p.code === 'openai' && <Lock className="w-4 h-4" />}
                {p.code === 'gemini' && <Brain className="w-4 h-4" />}
                {p.code === 'openai_compatible' && <Globe className="w-4 h-4" />}
                {p.name}
              </TabsTrigger>
            ))}
            <TabsTrigger 
              value="models-mgmt" 
              className="whitespace-nowrap flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm rounded-md data-[selected]:bg-background data-[selected]:text-purple-500 data-[selected]:shadow-sm transition-all"
            >
              <Settings2 className="w-4 h-4" />
              Model Catalog
            </TabsTrigger>
          </TabsList>
        </div>

        {providers.map(provider => (
          <TabsContent key={provider.code} value={provider.code}>
            <ProviderConfigCard 
              provider={provider}
              config={configs[provider.code]}
              models={models[provider.id] || []}
              isSaving={isSaving}
              isTesting={isTesting[provider.code] || false}
              onSave={handleSaveConfig}
              onTest={handleTestConnection}
              onUpdateProvider={updateProviderLocal}
              onUpdateConfig={updateConfigLocal}
            />
          </TabsContent>
        ))}

        <TabsContent value="models-mgmt">
          <ModelCatalogTab 
            providers={providers}
            models={Object.values(models).flat()}
            newModel={newModel}
            editingModelId={editingModelId}
            isSaving={isSaving}
            onSetNewModel={setNewModel}
            onAddModel={handleAddModel}
            onEditModel={startEditingModel}
            onDeleteModel={handleDeleteModel}
            onCancelEdit={cancelEdit}
          />
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-muted/5 border-dashed border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Database className="w-5 h-5 text-blue-500" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Context Awareness</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When enabled, the AI will automatically analyze all notes and diagrams within your project to provide more relevant answers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/5 border-dashed border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Brain className="w-5 h-5 text-purple-500" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Smart Suggestions</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The AI can suggest relationships, table names, and even data types based on your project description.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

        <div className="pt-8 border-t border-border/50 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3 h-3" />
          All configurations are secured with industry-standard encryption.
        </div>
      </div>
    </div>
  );
};

export default AISettingsPage;
