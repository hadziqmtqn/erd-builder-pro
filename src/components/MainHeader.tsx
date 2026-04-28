import React from 'react';
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
import { Share2, Globe, CloudOff, CloudRain, Cloud, Save, Check, History } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShareModal } from "./modals/ShareModal";
import { NavActionsMenu } from "./NavActionsMenu";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface MainHeaderProps {
  featureLabel: string;
  activeProjectName: string | null | undefined;
  activeFileName: string | null | undefined;
  view: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'trash' | 'changelog' | 'backups';
  hasActiveItem: boolean;
  syncError?: boolean;
  isSyncing?: boolean;
  isRefreshing?: boolean;
  hasPendingSyncs?: boolean;
  activeFileUid?: string;
  activeFileId?: number | string;
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
  onExportSQL?: (dialect: 'postgresql' | 'mysql') => void;
  onExportPDF?: () => void;
  onExportImage?: () => void;
  onExportMarkdown?: () => void;
  onImportMarkdown?: () => void;
  onShowHistory?: () => void;
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
  onExportSQL,
  onExportPDF,
  onExportImage,
  onExportMarkdown,
  onImportMarkdown,
  onShowHistory,
}: MainHeaderProps) => {
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const [isMac, setIsMac] = React.useState(false);

  React.useEffect(() => {
    setIsMac(window.navigator.userAgent.toLowerCase().includes('mac'));
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 w-full overflow-hidden border-b bg-background/50 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-4 min-w-0 flex-1">
        {!isPublicView && (
          <>
            <SidebarTrigger className="-ml-1 shrink-0" />
            <Separator orientation="vertical" className="h-4 shrink-0 bg-border/50" />
          </>
        )}
        <Breadcrumb className="min-w-0 flex items-center">
          <BreadcrumbList className="flex-nowrap items-center">
            {!isPublicView && (
              <BreadcrumbItem className="shrink-0 hidden sm:block">
                <BreadcrumbPage className="font-medium text-muted-foreground">
                  {featureLabel}
                </BreadcrumbPage>
              </BreadcrumbItem>
            )}
            
            {!isPublicView && activeProjectName && (
              <>
                <BreadcrumbSeparator className="shrink-0 hidden sm:block" />
                <BreadcrumbItem className="min-w-0 shrink">
                  <BreadcrumbPage className="max-w-[80px] sm:max-w-[150px] md:max-w-[250px] truncate text-muted-foreground">{activeProjectName}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}

            {activeFileName && (
              <>
                {!isPublicView && <BreadcrumbSeparator className="shrink-0" />}
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
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {!isOnline && !isPublicView && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in slide-in-from-top-1 duration-500">
          <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Offline Mode: Navigation Disabled</span>
        </div>
      )}

      <div className="ml-auto px-4 flex items-center gap-2 sm:gap-4">
        {['erd', 'notes', 'drawings', 'flowchart'].includes(view) && hasActiveItem && (
          <div className="flex items-center gap-2 sm:gap-4">
            {!isPublicView && updatedAt && (
              <TooltipProvider delay={200}>
                <Tooltip>
                  <TooltipTrigger 
                    render={
                      <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium cursor-help hover:text-foreground transition-colors">
                        <span className="opacity-50">Edited</span>
                        <span>{format(new Date(updatedAt), 'MMM dd')}</span>
                      </div>
                    }
                  />
                  <TooltipContent side="bottom" className="text-[10px] py-1 px-2 font-mono">
                    {format(new Date(updatedAt), 'eee, dd MMM yyyy HH:mm:ss')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {!isPublicView && (
              <div className="flex items-center gap-2 shrink-0">
                {syncError ? (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 border border-destructive/20 text-destructive cursor-help">
                          <CloudOff className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Sync Failed</span>
                        </div>
                      } />
                      <TooltipContent side="bottom" className="text-[10px] font-medium max-w-[200px] text-center">
                        Your changes are saved safely on this computer, but we couldn't send them to the cloud. We'll automatically retry when possible.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onSave}
                          disabled={!hasPendingSyncs || isSyncing || !isOnline}
                          className={cn(
                            "h-8 px-2 gap-2 transition-all duration-300",
                            hasPendingSyncs ? "text-primary hover:text-primary hover:bg-primary/10" : "text-muted-foreground/40 opacity-50 cursor-default"
                          )}
                        >
                          {isSyncing ? (
                            <>
                              <Cloud className="w-4 h-4 animate-bounce" />
                              <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Syncing...</span>
                            </>
                          ) : hasPendingSyncs ? (
                            <>
                              <Save className="w-4 h-4 animate-in zoom-in-50 duration-300" />
                              <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Save</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 text-green-500/50" />
                              <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Synced</span>
                            </>
                          )}
                        </Button>
                      } />
                      <TooltipContent side="bottom" className="text-[10px] font-medium">
                        {hasPendingSyncs ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span>Save changes to cloud</span>
                            <span className="opacity-50 text-[9px]">{isMac ? '⌘' : 'Ctrl'} + S</span>
                          </div>
                        ) : "All changes are saved and synced"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                
                {isRefreshing && (
                  <div className="flex items-center gap-2 text-primary animate-pulse">
                     <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                     <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Checking Updates...</span>
                  </div>
                )}

                {onShowHistory && (
                  <TooltipProvider delay={0}>
                    <Tooltip>
                      <TooltipTrigger render={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onShowHistory}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                      } />
                      <TooltipContent side="bottom" className="text-[10px] font-medium">
                        Version History
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}

            <NavActionsMenu 
              onShare={() => isOnline && setIsShareModalOpen(true)}
              onDelete={onDelete}
              onRename={onRename}
              onExportSQL={onExportSQL}
              onExportPDF={onExportPDF}
              onExportImage={onExportImage}
              onExportMarkdown={onExportMarkdown}
              onImportMarkdown={onImportMarkdown}
              isOnline={isOnline}
              isPublicView={isPublicView}
              isPublic={initialShareSettings?.is_public}
              activeFileUid={activeFileUid}
              documentType={view}
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
