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
import { Globe, CloudOff, Cloud, Save, Check, Search } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShareModal } from "./modals/ShareModal";
import { NavActionsMenu } from "./NavActionsMenu";

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
  onExportPDF?: () => void;
  onExportImage?: () => void;
  onExportMarkdown?: () => void;
  onCopyMarkdown?: () => void;
  onImportMarkdown?: () => void;
  onDuplicate?: () => void;
  isGuest?: boolean;
  fileSearchRef?: React.RefObject<HTMLInputElement | null>;
  fileSearchQuery?: string;
  onFileSearchChange?: (value: string) => void;
  hideFileSearch?: boolean;
  breadcrumbLabel?: string | null;
  noteContent?: string;
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
  onExportPDF,
  onExportImage,
  onExportMarkdown,
  onCopyMarkdown,
  onImportMarkdown,
  onDuplicate,
  isGuest = false,
  fileSearchRef,
  fileSearchQuery = '',
  onFileSearchChange,
  hideFileSearch,
  breadcrumbLabel,
  noteContent,
}: MainHeaderProps) => {
  const location = useLocation();
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const [isMac, setIsMac] = React.useState(false);

  const isTableView = location.pathname.startsWith('/table/');

  React.useEffect(() => {
    setIsMac(window.navigator.userAgent.toLowerCase().includes('mac'));
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 w-full overflow-hidden border-b bg-background/50 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-4 min-w-0 flex-none">
        {!isPublicView && (
          <>
            <SidebarTrigger className="-ml-1 shrink-0" />
            <Separator orientation="vertical" className="h-4 shrink-0 bg-border/50" />
          </>
        )}
        <Breadcrumb className="min-w-0 flex items-center">
          <BreadcrumbList className="flex-nowrap items-center">
            {/* ── URL-driven breadcrumb — always consistent with current route ── */}
            {!isPublicView && (() => {
              const path = location.pathname;

              // Dashboard (index route)
              if (path === '/') {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-semibold text-foreground">Dashboard</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }

              // Table list pages: /table/notes, /table/erd, /table/drawings, /table/flowchart
              if (path.startsWith('/table/')) {
                const tableLabels: Record<string, string> = {
                  notes: 'Notes',
                  erd: 'ERD Builder',
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

              // Document editors
              if (path.startsWith('/notes/') || path.startsWith('/diagrams/') || path.startsWith('/drawings/') || path.startsWith('/flowcharts/')) {
                const editorInfo: Record<string, { label: string; href: string }> = {
                  notes: { label: 'Notes', href: '/table/notes' },
                  diagrams: { label: 'ERD Builder', href: '/table/erd' },
                  drawings: { label: 'Drawings', href: '/table/drawings' },
                  flowcharts: { label: 'Flowcharts', href: '/table/flowchart' },
                };
                const segment = path.split('/')[1];
                const info = editorInfo[segment];
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
                          <BreadcrumbPage className="max-w-[80px] sm:max-w-[150px] md:max-w-[250px] truncate text-muted-foreground">{activeProjectName}</BreadcrumbPage>
                        </BreadcrumbItem>
                        {activeFileName && <BreadcrumbSeparator className="shrink-0" />}
                      </>
                    )}
                    {activeFileName && (
                      <BreadcrumbItem className="min-w-0 shrink flex items-center gap-2">
                        <BreadcrumbPage className="max-w-[120px] sm:max-w-[200px] md:max-w-[300px] truncate font-semibold text-foreground">{activeFileName}</BreadcrumbPage>

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

              // Trash
              if (path.startsWith('/trash')) {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-medium text-foreground">Trash</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }

              // Fallback: breadcrumbLabel override from context, or featureLabel
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
        {/* File search — only in table list view */}
        {!isPublicView && isTableView && !hideFileSearch && (
          <div className="relative flex items-center mr-1 sm:mr-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 select-none text-muted-foreground" />
            <Input
              ref={fileSearchRef}
              type="text"
              placeholder="Search files..."
              value={fileSearchQuery}
              onChange={(e) => onFileSearchChange?.(e.target.value)}
              className="h-8 w-[120px] sm:w-[180px] md:w-[220px] pl-8 pr-8 text-xs"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-0.5 opacity-40">
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground">
                <span className="text-[10px]">{isMac ? '⌘' : 'Ctrl'}</span>K
              </kbd>
            </div>
          </div>
        )}
        {!!location.pathname.match(/^\/(notes|diagrams|drawings|flowcharts)\/[^/]+$/) && (
          <div className="flex items-center gap-1 sm:gap-4">
            {!isPublicView && (
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {isLocalSaving ? (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <div className="flex items-center gap-1.5 p-0.5 sm:px-2 sm:py-1 rounded-md bg-amber-500/10 sm:border sm:border-amber-500/20 text-amber-500 sm:shadow-sm transition-all duration-300">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Saving...</span>
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
                      <TooltipContent side="bottom" className="text-[10px] font-medium max-w-[200px] text-center">
                        Changes saved locally, but cloud sync failed. We'll retry automatically.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : isSyncing ? (
                  <div className="flex items-center gap-1.5 p-0.5 sm:px-2 sm:py-1 rounded-md bg-primary/10 sm:border sm:border-primary/20 text-primary sm:shadow-sm transition-all duration-300">
                    <Cloud className="w-3.5 h-3.5 animate-bounce" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Syncing...</span>
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
                        <div className="flex items-center gap-1.5 p-0.5 sm:px-2 sm:py-1 rounded-md bg-green-500/5 sm:border sm:border-green-500/10 text-green-500/60 sm:shadow-sm transition-all duration-300">
                          <Check className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Synced</span>
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
              onExportPDF={onExportPDF}
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
