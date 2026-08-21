import React from 'react';
import { 
  Sparkles, 
  Database, 
  History,
  Lock,
  User,
  Palette,
  Settings,
  Brain,
  ListChecks,
  Upload,
  Download,
  HardDrive,
  Keyboard,
  ServerCog,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useAIProviders } from '@/hooks/useAIProviders';
import { useAIModels } from '@/hooks/useAIModels';
import { useAIPrompts } from '@/hooks/useAIPrompts';
import { APISettingsTab } from '@/components/ai/APISettingsTab';
import { ModelCatalogTab } from '@/components/ai/ModelCatalogTab';
import { DefaultPromptsTab } from '@/components/ai/DefaultPromptsTab';
import { AIRulesTab } from '@/components/ai/AIRulesTab';
import { AccountTab } from '@/components/settings/AccountTab';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { BackupsView } from '@/components/views/BackupsView';
import { ChangelogView } from '@/components/views/ChangelogView';
import { DataImport } from '@/components/settings/DataImport';
import { DataExport } from '@/components/settings/DataExport';
import { StorageConfigTab } from '@/components/storage/StorageConfigTab';
import { KeymapTab } from '@/components/settings/KeymapTab';
import { McpServerTab } from '@/components/settings/McpServerTab';
import { useAuth } from '@/hooks/useAuth';

export function SettingsModal() {
  const { 
    isSettingsOpen, 
    setIsSettingsOpen, 
    settingsTab, 
    setSettingsTab 
  } = useWorkspace();

  const isTauriApp = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  const isDesktopApp = isTauriApp ||
    (typeof window !== 'undefined' && (window as any).ERD_INSTALL_MODE === 'cli');
  const [aiSettingsTab, setAiSettingsTab] = React.useState('configuration');

  React.useEffect(() => {
    if (!isTauriApp) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;

      unlisten = await listen('menu-settings', () => {
        setSettingsTab('account');
        setIsSettingsOpen(true);
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isTauriApp, setIsSettingsOpen, setSettingsTab]);

  const {
    providers,
    configs,
    isTesting,
    isSaving: isSavingProviders,
    handleSaveConfig,
    handleTestConnection,
    updateProviderLocal,
    updateConfigLocal,
  } = useAIProviders();

  const { isGuest } = useAuth();

  const {
    models,
    newModel,
    editingModelId,
    isSaving: isSavingModels,
    setNewModel,
    handleAddModel,
    handleDeleteModel,
    ensureModel,
    startEditingModel,
    cancelEdit,
    refresh: refreshModels,
  } = useAIModels();

  const {
    prompts,
    isSaving: isSavingPrompts,
    handleSavePrompt,
    handleDeletePrompt,
    togglePromptDefault,
  } = useAIPrompts();

  const navGroups = React.useMemo(() => {
    if (isGuest) {
      return [
        {
          label: "General",
          items: [
            { id: 'appearance', label: 'Appearance', icon: <Palette className="size-4" /> },
          ]
        },
        {
          label: "More",
          items: [
            { id: 'keymap', label: 'Keymap', icon: <Keyboard className="size-4" /> },
            { id: 'export-data', label: 'Export Data', icon: <Download className="size-4" /> },
            { id: 'changelog', label: "What's New", icon: <History className="size-4" /> },
          ]
        },
      ];
    }

    return [
      {
        label: "General",
        items: [
          { id: 'account', label: 'Account', icon: <User className="size-4" /> },
          { id: 'appearance', label: 'Appearance', icon: <Palette className="size-4" /> },
          ...(isDesktopApp ? [{ id: 'storage', label: 'Storage', icon: <HardDrive className="size-4" /> }] : []),
        ]
      },
      {
        label: "Feature",
        items: [
          { id: 'ai-config', label: 'AI Configuration', icon: <Sparkles className="size-4" /> },
          ...(isDesktopApp ? [{ id: 'mcp-server', label: 'MCP Integration', icon: <ServerCog className="size-4" /> }] : []),
          { id: 'ai-rules', label: 'AI Rules', icon: <ListChecks className="size-4" /> },
          { id: 'ai-prompts', label: 'System Prompts', icon: <Brain className="size-4" /> },
        ]
      },
      {
        label: "More",
        items: [
          { id: 'keymap', label: 'Keymap', icon: <Keyboard className="size-4" /> },
          { id: 'export-data', label: 'Export Data', icon: <Download className="size-4" /> },
          { id: 'import-data', label: 'Import Data', icon: <Upload className="size-4" /> },
          { id: 'backups', label: 'Database Backup', icon: <Database className="size-4" /> },
          { id: 'changelog', label: "What's New", icon: <History className="size-4" /> },
        ]
      }
    ];
  }, [isGuest, isDesktopApp]);

  const allItems = navGroups.flatMap(g => g.items);
  const getTabLabel = (id: string) => {
    return allItems.find(item => item.id === id)?.label || '';
  };

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="overflow-hidden p-0 md:max-h-150 md:max-w-175 lg:max-w-237.5 bg-background border-border/40 shadow-2xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your application settings and AI configuration.
        </DialogDescription>
        
        <SidebarProvider className="items-start min-h-0! h-full">
          {/* Sidebar */}
          <Sidebar collapsible="none" className="w-55 border-r border-border/40 bg-muted/5 hidden md:flex h-full">
            <SidebarContent className="pt-4 px-2 pb-0">
              <div className="px-4 py-2 mb-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Settings className="size-4" />
                  Settings
                </h2>
              </div>

              {navGroups.map((group) => (
                <SidebarGroup key={group.label} className="py-1">
                  <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-4 mb-0.5">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            isActive={settingsTab === item.id}
                            onClick={() => setSettingsTab(item.id)}
                            className={`transition-all duration-200 px-4 py-2 rounded-md ${
                              settingsTab === item.id 
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' 
                                : 'text-muted-foreground hover:bg-sidebar-accent/50'
                            }`}
                          >
                            {item.icon}
                            <span className="text-xs">{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </Sidebar>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col h-150 overflow-hidden">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 flex-1">
                <Breadcrumb className="hidden md:flex">
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="#" className="text-[11px] text-muted-foreground">Settings</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-[11px] font-semibold">{getTabLabel(settingsTab)}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>

                {/* Mobile Navigation Dropdown */}
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-2 text-xs font-semibold">
                        <Settings className="size-3.5" />
                        {getTabLabel(settingsTab)}
                        <ChevronDown className="size-3 opacity-50" />
                      </Button>
                    } />
                    <DropdownMenuContent align="start" className="w-56">
                      {navGroups.map((group) => (
                        <DropdownMenuGroup key={group.label}>
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2 py-1.5">
                            {group.label}
                          </DropdownMenuLabel>
                          {group.items.map((item) => (
                            <DropdownMenuItem 
                              key={item.id}
                              onClick={() => setSettingsTab(item.id)}
                              className={settingsTab === item.id ? "bg-accent" : ""}
                            >
                              {item.icon}
                              <span className="ml-2">{item.label}</span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </DropdownMenuGroup>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {settingsTab === 'ai-config' && (
                <div className="p-4 md:p-6">
                  {/* Button tabs */}
                  <div className="flex gap-1 bg-muted border border-border rounded-lg p-1 w-full mb-4">
                    <button
                      onClick={() => setAiSettingsTab('configuration')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                        aiSettingsTab === 'configuration'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Configuration
                    </button>
                    <button
                      onClick={() => setAiSettingsTab('models')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                        aiSettingsTab === 'models'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      AI Models
                    </button>
                  </div>

                  {/* Tab content */}
                  {aiSettingsTab === 'configuration' && (
                    <APISettingsTab
                      providers={providers}
                      configs={configs}
                      models={models}
                      isSaving={isSavingProviders}
                      isTesting={isTesting}
                      onSave={handleSaveConfig}
                      onTest={(code) => handleTestConnection(code, Object.values(models).flat())}
                      onUpdateProvider={updateProviderLocal}
                      onUpdateConfig={updateConfigLocal}
                      onEnsureModel={ensureModel}
                      onRefreshModels={refreshModels}
                    />
                  )}
                  {aiSettingsTab === 'models' && (
                    <ModelCatalogTab
                      providers={providers}
                      models={Object.values(models).flat()}
                      newModel={newModel}
                      editingModelId={editingModelId}
                      isSaving={isSavingModels}
                      onSetNewModel={setNewModel}
                      onAddModel={handleAddModel}
                      onEditModel={startEditingModel}
                      onDeleteModel={handleDeleteModel}
                      onCancelEdit={cancelEdit}
                    />
                  )}
                </div>
              )}

              {settingsTab === 'ai-prompts' && (
                <DefaultPromptsTab 
                    prompts={prompts}
                    isSaving={isSavingPrompts}
                    onSave={handleSavePrompt}
                    onDelete={handleDeletePrompt}
                    onToggleDefault={togglePromptDefault}
                  />
              )}

              {settingsTab === 'ai-rules' && (
                <AIRulesTab />
              )}

              {isDesktopApp && settingsTab === 'mcp-server' && (
                <McpServerTab />
              )}

              {settingsTab === 'backups' && (
                <div className="p-6 space-y-6">
                  <BackupsView />
                </div>
              )}

              {settingsTab === 'account' && (
                <AccountTab />
              )}

              {settingsTab === 'changelog' && (
                <div className="p-6 space-y-6">
                  <ChangelogView />
                </div>
              )}

              {settingsTab === 'keymap' && <KeymapTab />}

              {settingsTab === 'export-data' && (
                <div className="p-4 md:p-6 overflow-y-auto h-full">
                  <DataExport />
                </div>
              )}

              {settingsTab === 'import-data' && (
                <div className="p-4 md:p-6 overflow-y-auto h-full">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold">Import Data</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Restore data from a JSON backup or replace the local database from a .db file.
                    </p>
                  </div>
                  <DataImport />
                </div>
              )}

              {settingsTab === 'appearance' && (
                <AppearanceTab />
              )}

              {settingsTab === 'storage' && (
                <StorageConfigTab />
              )}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
