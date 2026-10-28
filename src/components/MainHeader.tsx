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
import { Globe, CloudOff } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from "@/components/ui/badge";
import { ShareModal } from "./modals/ShareModal";
import { NavActionsMenu } from "./NavActionsMenu";
import { useAIAction } from '@/contexts/AIActionContext';

import { AppView } from '@/types';

interface MainHeaderProps {
  featureLabel: string;
  documentPath?: string;
  sidebarDisabled?: boolean;
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
  /** False for a Team file owned by someone else: hides Share (DATA-004). */
  canManage?: boolean;
  onRefresh?: () => void;
  discussionPanel?: React.ReactNode;
  tabsRef?: (element: HTMLDivElement | null) => void;
}

export const MainHeader = React.memo(({
  featureLabel,
  documentPath,
  sidebarDisabled = false,
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
  canManage = true,
  onRefresh,
  discussionPanel,
  tabsRef,
}: MainHeaderProps) => {
  const location = useLocation();
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const { setRightPanelMode } = useAIAction();
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

  const editorPath = documentPath ?? location.pathname;
  const hasTabs = !isPublicView && /^\/(notes|diagrams|drawings|flowcharts|db-client)\/[^/]+$/.test(editorPath);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 w-full overflow-hidden border-b bg-background/50 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:px-4">
        {!isPublicView && (
          <>
            <SidebarTrigger className="-ml-1 shrink-0" disabled={sidebarDisabled} />
            <Separator orientation="vertical" className="h-4 shrink-0 bg-border/50" />
          </>
        )}
        <div ref={tabsRef} className={hasTabs ? "flex min-w-0 flex-1 items-center" : "hidden"} />
        {!hasTabs && <Breadcrumb className="min-w-0 flex items-center">
          <BreadcrumbList className="min-w-0 flex-nowrap items-center">
            {!isPublicView && (() => {
              const path = documentPath ?? location.pathname;
              if (path === '/') {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-semibold text-foreground">Dashboard</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              // The Project page shows its own title; no breadcrumb (COL-008).
              if (path.startsWith('/projects/')) return null;
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
              if (path.startsWith('/trash')) {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-medium text-foreground">Trash</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              if (path.startsWith('/library')) {
                return (
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbPage className="font-medium text-foreground">Library</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              if (path.startsWith('/teams/')) {
                return <>
                  <BreadcrumbItem className="shrink-0 text-muted-foreground">Teams</BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="shrink-0"><BreadcrumbPage className="font-semibold text-foreground">{breadcrumbLabel || 'Team management'}</BreadcrumbPage></BreadcrumbItem>
                </>;
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
        </Breadcrumb>}
      </div>

      {!isOnline && !isPublicView && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in slide-in-from-top-1 duration-500">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Offline Mode: Navigation Disabled</span>
          </div>
      )}

      <div className="flex shrink-0 items-center gap-1 pr-2 sm:pr-4">
        {!!location.pathname.match(/^\/(notes|diagrams|drawings|flowcharts)\/[^/]+$/) && (
          <div className="flex items-center gap-1 sm:gap-2">
            {!isPublicView && syncError && (
              <span role="status" title="Changes saved locally, but cloud sync failed. We'll retry automatically." className="flex shrink-0 items-center gap-1 text-destructive">
                <CloudOff className="size-4" /><span className="hidden lg:inline text-xs">Sync Failed</span>
              </span>
            )}

            {!isPublicView && initialShareSettings?.is_public && <Badge variant="outline" title="This document is shared publicly via a secret link." className="shrink-0 gap-1"><Globe className="size-3" /><span className="hidden lg:inline">Public</span></Badge>}
            {discussionPanel}

            <NavActionsMenu 
              onCopyPath={!isPublicView ? () => copyFilePath(new URLSearchParams(location.search).get('feature') === 'db-client' ? 'DB Client' : ({ notes: 'Notes', erd: 'ERD Builder', flowchart: 'Flowcharts', drawings: 'Drawings' }[view] || featureLabel)) : undefined}
              onShare={canManage ? () => isOnline && setIsShareModalOpen(true) : undefined}
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
              onRefresh={isGuest || isPublicView ? undefined : onRefresh}
              isRefreshing={isRefreshing}
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
