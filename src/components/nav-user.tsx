import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Sparkles,
  Github,
  Trash2,
  Database,
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
import React from "react"
import { DatabaseBackupModal } from "./modals/DatabaseBackupModal"

export function NavUser({
  user,
  onLogout,
  onViewChange,
  isOnline,
}: {
  user: any
  onLogout: () => void
  onViewChange: (view: 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog' | 'backups') => void
  isOnline: boolean
}) {
  const { isMobile } = useSidebar()

  if (!user) return null;

  const email = user.email || "";
  const name = user.user_metadata?.full_name || email.split('@')[0] || "User";
  const avatar = user.user_metadata?.avatar_url || "";
  const initials = name.substring(0, 2).toUpperCase();

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
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={avatar} alt={name} />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
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
                <DropdownMenuItem 
                  onClick={() => isOnline && onViewChange('backups')}
                  className="cursor-pointer"
                  disabled={!isOnline}
                >
                  <Database className="mr-2 size-4" />
                  Database Backup
                </DropdownMenuItem>
                <DropdownMenuItem render={<a href="https://github.com/hadziqmtqn/erd-builder-pro" target="_blank" rel="noopener noreferrer" />} className="cursor-pointer">
                  <Github className="mr-2 size-4" />
                  Github
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => isOnline && onViewChange('changelog')}
                  className="cursor-pointer"
                >
                  <Sparkles className="mr-2 size-4" />
                  What's New
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
              <DropdownMenuItem 
                onClick={() => isOnline && onLogout()} 
                disabled={!isOnline}
                className={`cursor-pointer ${!isOnline && 'opacity-50 cursor-not-allowed'}`}
                title={!isOnline ? "Logging out while offline may cause data loss of unsynced changes" : ""}
              >
                <LogOut className="mr-2 size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}
