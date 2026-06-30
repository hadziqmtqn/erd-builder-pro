import { useState } from "react"
import {
  ChevronsUpDown,
  LogOut,
  Github,
  Trash2,
  Settings,
  MessageSquarePlus,
  Download,
  Info,
  ArrowUpCircle,
  BadgeAlert,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useWorkspace } from "../providers/WorkspaceContext"
import { AppView } from "../types"
import { GuestExportDialog } from "@/components/ai/GuestExportDialog"
import { AboutDialog } from "@/components/modals/AboutDialog"

export function NavUser({
  user,
  onLogout,
  onViewChange,
  isOnline,
  onOpenFeedback,
}: {
  user: any
  onLogout: () => void
  onViewChange: (view: AppView) => void
  isOnline: boolean
  onOpenFeedback: () => void
}) {
  const { isMobile } = useSidebar()
  const { isGuest, setIsSettingsOpen, setSettingsTab,
    hasUpdate, latestVersion, isCheckingUpdate, isDownloadingUpdate,
    isWebOutdated, showOutdatedBadge,
    checkForUpdates, downloadUpdate } = useWorkspace();
  const isDesktop = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

  if (!user) return null;

  const email = user.email || "";
  const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || "User";
  const avatar = user.user_metadata?.avatar_url || "";
  const initials = name.substring(0, 2).toUpperCase();

  const handleOpenSettings = (tab: string) => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const [guestExportOpen, setGuestExportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="relative">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={avatar} alt={name} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  {showOutdatedBadge && (
                    <span
                      className="absolute -top-1 -right-1 flex size-3 rounded-full bg-amber-500 ring-2 ring-sidebar"
                      title={isDesktop 
                        ? `Update available: v${latestVersion || '?'}` 
                        : isWebOutdated
                          ? `New version available: v${latestVersion || '?'}. ${
                              (import.meta as any).env?.APP_VERSION 
                                ? `You're on v${(import.meta as any).env.APP_VERSION}.` 
                                : ''
                            } Pull latest Docker image or update your install.`
                          : ''}
                    />
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs">{email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            } />
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <DropdownMenuGroup>
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={avatar} alt={name} />
                        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">{name}</span>
                        <span className="truncate text-xs">{email}</span>
                      </div>
                    </div>
                  </DropdownMenuGroup>
                </DropdownMenuLabel>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                {/* Settings - always shown */}
                <DropdownMenuItem 
                  onClick={() => handleOpenSettings(isGuest ? 'appearance' : 'account')}
                  className="cursor-pointer"
                  disabled={!isGuest && !isOnline}
                >
                  <Settings className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>

                {/* Backup Data - guest only */}
                {isGuest && (
                  <DropdownMenuItem 
                    onClick={() => setGuestExportOpen(true)}
                    className="cursor-pointer"
                  >
                    <Download className="mr-2 size-4" />
                    Backup Data
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem 
                  onClick={() => setAboutOpen(true)}
                  className="cursor-pointer"
                >
                  {hasUpdate ? (
                    <ArrowUpCircle className="mr-2 size-4 text-emerald-400" />
                  ) : isWebOutdated ? (
                    <BadgeAlert className="mr-2 size-4 text-amber-500" />
                  ) : (
                    <Info className="mr-2 size-4" />
                  )}
                  About
                  {showOutdatedBadge && (
                    <span className={`ml-auto flex size-2 rounded-full ${hasUpdate ? 'bg-emerald-400' : 'bg-amber-500'}`} />
                  )}
                </DropdownMenuItem>
              <DropdownMenuItem render={<a href="https://github.com/hadziqmtqn/erd-builder-pro" target="_blank" rel="noopener noreferrer" />} className="cursor-pointer">
                <Github className="mr-2 size-4" />
                Github
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={onOpenFeedback}
                className="cursor-pointer"
              >
                <MessageSquarePlus className="mr-2 size-4" />
                Feedback
              </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              
              <DropdownMenuGroup>
                <DropdownMenuItem 
                  onClick={() => isOnline && onViewChange('trash')}
                  disabled={!isOnline}
                  className={`text-destructive focus:bg-accent focus:text-destructive cursor-pointer ${!isOnline && 'opacity-50 cursor-not-allowed'}`}
                >
                  <Trash2 className="mr-2 size-4" />
                  Trash
                </DropdownMenuItem>
              </DropdownMenuGroup>
              
              <DropdownMenuSeparator />

              {!isDesktop && (
                <DropdownMenuItem 
                  onClick={() => isOnline && onLogout()} 
                  disabled={!isOnline}
                  className={`cursor-pointer ${!isOnline && 'opacity-50 cursor-not-allowed'}`}
                  title={!isOnline ? "Logging out while offline may cause data loss of unsynced changes" : ""}
                >
                  <LogOut className="mr-2 size-4" />
                  Log out
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <GuestExportDialog open={guestExportOpen} onOpenChange={setGuestExportOpen} />
      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        hasUpdate={hasUpdate}
        latestVersion={latestVersion}
        isChecking={isCheckingUpdate}
        isDownloading={isDownloadingUpdate}
        onCheckUpdate={checkForUpdates}
        onDownload={downloadUpdate}
      />
    </>
  )
}
