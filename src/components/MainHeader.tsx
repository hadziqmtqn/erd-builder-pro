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
import { Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ShareModal } from "./modals/ShareModal";
interface MainHeaderProps {
  featureLabel: string;
  activeProjectName: string | null | undefined;
  activeFileName: string | null | undefined;
  view: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'trash';
  hasActiveItem: boolean;
  currentSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  activeFileUid?: string;
  isPublicView?: boolean;
}

export function MainHeader({
  featureLabel,
  activeProjectName,
  activeFileName,
  view,
  hasActiveItem,
  currentSaveStatus,
  activeFileUid,
  isPublicView = false
}: MainHeaderProps) {
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
                <BreadcrumbItem className="min-w-0 shrink">
                  <BreadcrumbPage className="max-w-[120px] sm:max-w-[200px] md:max-w-[300px] truncate font-semibold text-foreground">{activeFileName}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ml-auto px-4 flex items-center gap-2 sm:gap-4">
        {['erd', 'notes', 'drawings', 'flowchart'].includes(view) && hasActiveItem && (
          <>
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsShareModalOpen(true)}
                className="h-8 px-2 sm:px-3 text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-2 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest">Share</span>
              </Button>
              
              {!isPublicView && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`w-2 h-2 rounded-full ${currentSaveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : currentSaveStatus === 'saved' ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                    {currentSaveStatus === 'saving' ? 'Saving...' : currentSaveStatus === 'saved' ? 'Saved' : 'Idle'}
                  </span>
                </div>
              )}
            </div>

            {activeFileUid && (
              <ShareModal 
                isOpen={isShareModalOpen} 
                onOpenChange={setIsShareModalOpen}
                documentType={view as any}
                documentUid={activeFileUid}
                documentTitle={activeFileName || 'Untitled'}
                isPublicView={isPublicView}
              />
            )}
          </>
        )}
      </div>
    </header>
  );
}
