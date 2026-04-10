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
import { Share2, Globe } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShareModal } from "./modals/ShareModal";
import { NavActionsMenu } from "./NavActionsMenu";
import { format } from "date-fns";
interface MainHeaderProps {
  featureLabel: string;
  activeProjectName: string | null | undefined;
  activeFileName: string | null | undefined;
  view: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'trash';
  hasActiveItem: boolean;
  currentSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
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
}

export const MainHeader = React.memo(({
  featureLabel,
  activeProjectName,
  activeFileName,
  view,
  hasActiveItem,
  currentSaveStatus,
  activeFileUid,
  activeFileId,
  initialShareSettings,
  onSettingsSaved,
  isPublicView = false,
  isOnline,
  updatedAt,
  onDelete,
  onRename
}: MainHeaderProps) => {
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);

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
                <div className={`w-1.5 h-1.5 rounded-full ${!isOnline ? 'bg-destructive animate-pulse' : currentSaveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : currentSaveStatus === 'saved' ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                  {!isOnline ? 'Saving Locally' : currentSaveStatus === 'saving' ? 'Saving...' : currentSaveStatus === 'saved' ? 'Saved' : 'Idle'}
                </span>
              </div>
            )}

            <NavActionsMenu 
              onShare={() => isOnline && setIsShareModalOpen(true)}
              onDelete={onDelete}
              onRename={onRename}
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
