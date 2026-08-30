import React from 'react';
import { useLocation } from 'react-router-dom';
import { 
  SidebarTrigger 
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Globe, CloudOff, Cloud, Save, Check, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShareModal } from "./modals/ShareModal";
import { NavActionsMenu } from "./NavActionsMenu";
import { useAIAction } from '@/contexts/AIActionContext';

import { AppView } from '@/types';

interface MainHeaderProps {
  featureLabel: string;
  activeProjectName: string | null | undefined;
  activeFileName: string | null | undefined;
  view: AppView;
  hasActiveItem: boolean;
  syncError?: boolean;
  isSyncing?: boolean;
  isRefreshing?: boolean;
  isLocalSaving?: boolean;
  hasPendingSyncs?: boolean;
  activeFileUid?: string;
  activeFileId?: number | string | null;
  initialShareSettings?: {
    is_public: boolean;
    share_token?: string;
    expiry_date?: string;
  };
  onSettingsSaved?: () => void;
  isPublicView?: boolean;
  isOnline: boolean;
  updatedAt?: string;
  onDelete?: () => void;
  onRename?: () => void;
  onSave?: () => void;
  onExportAll?: () => void;
  onExportSQL?: (dialect: 'postgresql' | 'mysql') => void;
  onExportImage?: () => void;
  onExportMarkdown?: () => void;
  onCopyMarkdown?: () => void;
  onImportMarkdown?: () => void;
  onDuplicate?: () => void;
  isGuest?: boolean;
  breadcrumbLabel?: string | null;
  noteContent?: string;
  historyAvailable?: boolean;
}

export const MainHeader = React.memo(({
  featureLabel,
  activeProjectName,
  activeFileName,
  view,
  hasActiveItem,
  syncError,
  isSyncing,
  isRefreshing,
  isLocalSaving = false,
  hasPendingSyncs,
  activeFileUid,
  activeFileId,
  initialShareSettings,
  onSettingsSaved,
  isPublicView = false,
  isOnline,
  updatedAt,
  onDelete,
  onRename,
  onSave,
  onExportAll,
  onExportSQL,
  onExportImage,
  onExportMarkdown,
  onCopyMarkdown,
  onImportMarkdown,
  onDuplicate,
  isGuest = false,
  breadcrumbLabel,
  noteContent,
  historyAvailable = true,
}: MainHeaderProps) => {
  const location = useLocation();
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const { setRightPanelMode } = useAIAction();
  const [isMac, setIsMac] = React.useState(false);
  const historyEntityType = view === 'erd'
    ? 'diagrams'
    : view === 'flowchart'
      ? 'flowcharts'
      : view === 'notes' || view === 'drawings'
        ? view
        : null;
  const historyEnabled = Boolean(
    historyAvailable && historyEntityType && activeFileUid && !isGuest && !isPublicView && isOnline
    && !isLocalSaving && !isSyncing && !hasPendingSyncs,
  );

  const openHistory = React.useCallback(() => setRightPanelMode('history'), [setRightPanelMode]);

  const copyFilePath = React.useCallback((category: string) => {
    navigator.clipboard.writeText(`${category} > ${activeProjectName || 'No Workspace'} > ${activeFileName}`)
      .then(() => toast.success('File path copied'))
      .catch(() => toast.error('Failed to copy file path'));
  }, [activeFileName, activeProjectName]);

  React.useEffect(() => {
    setIsMac(window.navigator.userAgent.toLowerCase().includes('mac'));
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 w-full overflow-hidden border-b bg-background/50 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-4 min-w-0 flex-none">
        {!isPublicView && (
          <>
            <SidebarTrigger className="-ml-1 shrink-0" />
            <Separator orientation="vertical" className="h-4 shrink-0 bg-border/50" />
          </>
        )}
        <Breadcrumb className="min-w-0 flex items-center">
          <BreadcrumbList className="flex-nowrap items-center">
            {!isPublicView && (() => {
              const path = location.pathname;
              if (path === '/') {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-semibold text-foreground">Dashboard</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              if (path.startsWith('/table/')) {
                const tableLabels: Record<string, string> = {
                  notes: 'Notes',
                  erd: 'ERD Builder',
                  'db-client': 'DB Client',
                  drawings: 'Drawings',
                  flowchart: 'Flowcharts',
                };
                const feature = path.match(/^\/table\/([^/]+)$/)?.[1];
                const label = feature ? (tableLabels[feature] || feature) : 'Unknown';
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-medium text-foreground">{label}</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              if (path.startsWith('/notes/') || path.startsWith('/diagrams/') || path.startsWith('/db-client/') || path.startsWith('/drawings/') || path.startsWith('/flowcharts/')) {
                const editorInfo: Record<string, { label: string; href: string }> = {
                    notes: { label: 'Notes', href: '/table/notes' },
                    diagrams: { label: 'ERD Builder', href: '/table/erd' },
                    'db-client': { label: 'DB Client', href: '/table/db-client' },
                  drawings: { label: 'Drawings', href: '/table/drawings' },
                  flowcharts: { label: 'Flowcharts', href: '/table/flowchart' },
                };
                const segment = path.split('/')[1];
                const info = new URLSearchParams(location.search).get('feature') === 'db-client'
                  ? { label: 'DB Client', href: '/table/db-client' }
                  : editorInfo[segment];
                return (
                  <>
                    {info && (
                      <>
                        <BreadcrumbItem className="shrink-0">
                          <BreadcrumbPage className="font-medium text-muted-foreground">{info.label}</BreadcrumbPage>
                        </BreadcrumbItem>
                        {activeProjectName && <BreadcrumbSeparator className="shrink-0" />}
                      </>
                    )}
                    {activeProjectName && (
                      <>
                        <BreadcrumbItem className="min-w-0 shrink">
                          <BreadcrumbPage className="max-w-20 sm:max-w-37.5 md:max-w-62.5 truncate text-muted-foreground">{activeProjectName}</BreadcrumbPage>
                        </BreadcrumbItem>
                        {activeFileName && <BreadcrumbSeparator className="shrink-0" />}
                      </>
                    )}
                    {activeFileName && (
                      <BreadcrumbItem className="min-w-0 shrink flex items-center gap-2">
                        <BreadcrumbPage className="max-w-30 sm:max-w-50 md:max-w-75 truncate font-semibold text-foreground">{activeFileName}</BreadcrumbPage>

                        {info && (
                          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => copyFilePath(info.label)} title="Copy file path" aria-label="Copy file path">
                            <Copy className="size-3.5" />
                          </Button>
                        )}

                        {initialShareSettings?.is_public && !isPublicView && (
                          <TooltipProvider delay={0}>
                            <Tooltip>
                              <TooltipTrigger render={
                                <Badge variant="outline" className="h-5 px-1.5 gap-1.5 bg-green-500/5 text-green-500 border-green-500/20 rounded-full hover:bg-green-500/10 cursor-help shadow-sm">
                                  <Globe className="w-2.5 h-2.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Public</span>
                                  <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse ml-0.5" />
                                </Badge>
                              } />
                              <TooltipContent side="bottom" align="center" className="text-[10px] font-medium">
                                This document is shared publicly via a secret link.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </BreadcrumbItem>
                    )}
                    {!activeFileName && !activeProjectName && (
                      <BreadcrumbItem className="shrink-0">
                        <BreadcrumbPage className="font-medium text-foreground">{info?.label || 'Document'}</BreadcrumbPage>
                      </BreadcrumbItem>
                    )}
                  </>
                );
              }
              if (path.startsWith('/trash')) {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-medium text-foreground">Trash</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              if (breadcrumbLabel) {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-semibold text-foreground">{breadcrumbLabel}</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              return (
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbPage className="font-medium text-muted-foreground">{featureLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              );
            })()}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex-1 flex items-center justify-center px-2">
        {!isOnline && !isPublicView ? (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in slide-in-from-top-1 duration-500">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Offline Mode: Navigation Disabled</span>
          </div>
        ) : null}
      </div>

      <div className="px-2 sm:px-4 flex items-center gap-1 sm:gap-4">
        {!!location.pathname.match(/^\/(notes|diagrams|drawings|flowcharts)\/[^/]+$/) && (
          <div className="flex items-center gap-1 sm:gap-4">
            {!isPublicView && (
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {isLocalSaving ? (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span className="hidden xs:inline">Saving</span>
                        </div>
                      } />
                      <TooltipContent side="bottom" className="text-[10px] font-medium">
                        Saving changes locally...
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : syncError ? (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <div className="flex items-center gap-1.5 p-0.5 sm:px-2 sm:py-1 rounded-md bg-destructive/10 sm:border sm:border-destructive/20 text-destructive cursor-help sm:shadow-sm transition-all duration-300">
                          <CloudOff className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Sync Failed</span>
                        </div>
                      } />
                      <TooltipContent side="bottom" className="text-[10px] font-medium max-w-50 text-center">
                        Changes saved locally, but cloud sync failed. We'll retry automatically.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : isSyncing ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                    <Cloud className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Syncing</span>
                  </div>
                ) : hasPendingSyncs ? (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onSave}
                          disabled={!isOnline}
                          className="h-6 sm:h-7 px-1 sm:px-2 gap-1 sm:gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-foreground border border-primary/20 transition-all duration-300 sm:shadow-sm"
                        >
                          <Save className="w-3.5 h-3.5 animate-in zoom-in-50" />
                          <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Save</span>
                        </Button>
                      } />
                      <TooltipContent side="bottom" className="text-[10px] font-medium">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>Save changes to cloud</span>
                          <span className="opacity-50 text-[9px]">{isMac ? '⌘' : 'Ctrl'} + S</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                          <Check className="w-3.5 h-3.5" />
                          <span className="hidden xs:inline">Saved</span>
                        </div>
                      } />
                      <TooltipContent side="bottom" className="text-[10px] font-medium">
                        All changes are saved and synced
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                
                {isRefreshing && (
                  <div className="flex items-center gap-2 text-primary animate-pulse ml-1 sm:ml-2">
                     <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            <NavActionsMenu 
              onShare={() => isOnline && setIsShareModalOpen(true)}
              onDelete={onDelete}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onExportAll={onExportAll}
              onExportSQL={onExportSQL}
              onExportImage={onExportImage}
              onExportMarkdown={onExportMarkdown}
              onCopyMarkdown={onCopyMarkdown}
              onImportMarkdown={onImportMarkdown}
              isOnline={isOnline}
              isPublicView={isPublicView}
              isPublic={initialShareSettings?.is_public}
              activeFileUid={activeFileUid}
              documentType={view}
              noteContent={noteContent}
              historyEnabled={historyEnabled}
              onOpenHistory={isGuest || isPublicView ? undefined : openHistory}
            />

            {activeFileUid && activeFileId && isOnline && (
              <ShareModal 
                isOpen={isShareModalOpen} 
                onOpenChange={setIsShareModalOpen}
                documentType={view as any}
                documentUid={activeFileUid}
                documentId={activeFileId}
                documentTitle={activeFileName || 'Untitled'}
                isPublicView={isPublicView}
                initialSettings={initialShareSettings}
                onSettingsSaved={onSettingsSaved}
              />
            )}

          </div>
        )}
      </div>
    </header>
  );
});
