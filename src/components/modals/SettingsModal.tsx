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
  Library,
  ListChecks,
  Upload,
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
import { AccountTab } from '@/components/ai/AccountTab';
import { AppearanceTab } from '@/components/ai/AppearanceTab';
import { BackupsView } from '@/components/views/BackupsView';
import { ChangelogView } from '@/components/views/ChangelogView';
import { GuestDataManagement } from '@/components/ai/GuestDataManagement';
import { useAuth } from '@/hooks/useAuth';

export function SettingsModal() {
  const { 
    isSettingsOpen, 
    setIsSettingsOpen, 
    settingsTab, 
    setSettingsTab 
  } = useWorkspace();

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
    startEditingModel,
    cancelEdit,
  } = useAIModels();

  const {
    prompts,
    isSaving: isSavingPrompts,
    handleSavePrompt,
    handleDeletePrompt,
    togglePromptDefault,
  } = useAIPrompts();

  const navGroups = [
    {
      label: "General",
      items: [
        { id: 'account', label: 'Account', icon: <User className="size-4" /> },
        { id: 'appearance', label: 'Appearance', icon: <Palette className="size-4" /> },
      ]
    },
    {
      label: "Feature",
      items: [
        { id: 'ai-config', label: 'AI Configuration', icon: <Sparkles className="size-4" /> },
        { id: 'ai-models', label: 'Model Catalog', icon: <Library className="size-4" /> },
        { id: 'ai-rules', label: 'AI Rules', icon: <ListChecks className="size-4" /> },
        { id: 'ai-prompts', label: 'System Prompts', icon: <Brain className="size-4" /> },
      ]
    },
    {
      label: "More",
      items: [
        ...(!isGuest ? [{ id: 'guest-import', label: 'Guest Data Import', icon: <Upload className="size-4" /> }] : []),
        { id: 'backups', label: 'Database Backup', icon: <Database className="size-4" /> },
        { id: 'changelog', label: 'What\'s New', icon: <History className="size-4" /> },
      ]
    }
  ];

  const allItems = navGroups.flatMap(g => g.items);
  const getTabLabel = (id: string) => {
    return allItems.find(item => item.id === id)?.label || '';
  };

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[700px] lg:max-w-[950px] bg-background border-border/40 shadow-2xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your application settings and AI configuration.
        </DialogDescription>
        
        <SidebarProvider className="items-start h-full">
          {/* Sidebar */}
          <Sidebar collapsible="none" className="w-[220px] border-r border-border/40 bg-muted/5 hidden md:flex h-full">
            <SidebarContent className="p-2 pt-4">
              <div className="px-4 py-2 mb-4">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Settings className="size-4" />
                  Settings
                </h2>
              </div>

              {navGroups.map((group) => (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-4 mb-1">
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
          <main className="flex-1 flex flex-col h-[600px] overflow-hidden">
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
                <div className="p-8">
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
                  />
                </div>
              )}

              {settingsTab === 'ai-models' && (
                <div className="p-8">
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
                </div>
              )}

              {settingsTab === 'ai-prompts' && (
                <div className="p-8">
                  <DefaultPromptsTab 
                    prompts={prompts}
                    isSaving={isSavingPrompts}
                    onSave={handleSavePrompt}
                    onDelete={handleDeletePrompt}
                    onToggleDefault={togglePromptDefault}
                  />
                </div>
              )}

              {settingsTab === 'ai-rules' && (
                <AIRulesTab />
              )}

              {settingsTab === 'backups' && (
                <div className="h-full">
                  <BackupsView />
                </div>
              )}

              {settingsTab === 'account' && (
                <AccountTab />
              )}

              {settingsTab === 'changelog' && (
                <div className="h-full">
                  <ChangelogView />
                </div>
              )}

              {settingsTab === 'guest-import' && (
                <div className="p-6 overflow-y-auto h-full">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold">Guest Data Import</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Import data from a Guest Mode export file into your account.
                    </p>
                  </div>
                  <GuestDataManagement />
                </div>
              )}

              {settingsTab === 'appearance' && (
                <AppearanceTab />
              )}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
