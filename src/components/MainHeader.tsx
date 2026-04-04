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

interface MainHeaderProps {
  featureLabel: string;
  activeProjectName: string | null | undefined;
  activeFileName: string | null | undefined;
  view: string;
  hasActiveItem: boolean;
  currentSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

export function MainHeader({
  featureLabel,
  activeProjectName,
  activeFileName,
  view,
  hasActiveItem,
  currentSaveStatus
}: MainHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium text-foreground">
                {featureLabel}
              </BreadcrumbPage>
            </BreadcrumbItem>
            
            {activeProjectName && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[150px] truncate">{activeProjectName}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}

            {activeFileName && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[200px] truncate">{activeFileName}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ml-auto px-4 flex items-center gap-4">
        {['erd', 'notes', 'drawings'].includes(view) && hasActiveItem && (
          <div className="flex items-center gap-2 mr-4">
            <div className={`w-2 h-2 rounded-full ${currentSaveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : currentSaveStatus === 'saved' ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
            <span className="text-xs text-muted-foreground font-medium">
              {currentSaveStatus === 'saving' ? 'Saving...' : currentSaveStatus === 'saved' ? 'Saved' : 'Idle'}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
