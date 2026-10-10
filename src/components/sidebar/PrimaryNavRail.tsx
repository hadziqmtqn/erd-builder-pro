import type { AppView } from "@/types"
import {
  Database,
  DatabaseZap,
  ExternalLink,
  FileText,
  Folder,
  LayoutDashboard,
  Network,
  PenTool,
  Shield,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { NavUser } from "@/components/nav-user"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar,
  useSidebar,
} from "@/components/ui/sidebar"

type FeatureClick = (title: string, capability: string, onOpen: () => void) => void

interface PrimaryNavRailProps {
  activeFeatureView: AppView | "db-client" | null
  canManageInstance: boolean
  cloudFeatureLocked: (capability: string) => boolean
  isOnline: boolean
  isSelfHosted: boolean
  onFeatureClick: FeatureClick
  onLogout: () => void
  onOpenFeedback: () => void
  onViewChange: (view: AppView, showTable?: boolean, workspaceUid?: string | null) => void
  ssoPortalUrl?: string | null
  user: any
  showDbClient: boolean
}

function RailAction({
  label,
  icon: Icon,
  active = false,
  locked = false,
  disabled = false,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  locked?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const accessibleLabel = locked ? `${label}. Paid Cloud plan required.` : label

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        disabled={disabled}
        aria-label={accessibleLabel}
        className={cn(
          "relative mx-auto !size-8 !justify-center !p-0",
          locked && "cursor-not-allowed",
        )}
        tooltip={{ children: locked ? `${label} · PRO` : label, hidden: false }}
        onClick={onClick}
      >
        <Icon
          aria-hidden="true"
          className={locked ? "text-muted-foreground" : undefined}
        />
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function PrimaryNavRail({
  activeFeatureView,
  canManageInstance,
  cloudFeatureLocked,
  isOnline,
  isSelfHosted,
  onFeatureClick,
  onLogout,
  onOpenFeedback,
  onViewChange,
  ssoPortalUrl,
  user,
  showDbClient,
}: PrimaryNavRailProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isMobile } = useSidebar()

  const openSaaS = () => {
    if (!ssoPortalUrl) return

    try {
      window.location.assign(new URL("/dashboard", ssoPortalUrl).toString())
    } catch {
      // Ignore malformed deployment configuration.
    }
  }

  const openDbClient = async () => {
    if (!isOnline) return
    await onViewChange("erd", true)
    navigate("/table/db-client")
  }

  return (
    <Sidebar collapsible="none" className="w-[calc(var(--sidebar-width-icon,3rem)+1px)]! shrink-0 border-r">
      <SidebarHeader className="items-center border-b border-sidebar-border p-2">
        <div className="flex size-8 items-center justify-center" role="img" aria-label="ERD Builder Pro">
          <img src="/img/ERD-Builder-Pro-Light-1.svg" alt="" className="size-full dark:hidden" />
          <img src="/img/ERD-Builder-Pro-Dark-1.svg" alt="" className="hidden size-full dark:block" />
        </div>
      </SidebarHeader>

      <SidebarContent className="items-center overflow-y-auto px-1 py-3">
        <div className="flex w-full flex-col gap-3">
          <SidebarMenu className="gap-1">
            <RailAction
              label="Dashboard"
              icon={LayoutDashboard}
              active={location.pathname === "/"}
              onClick={() => navigate("/")}
            />
            {user?.isSso && ssoPortalUrl && (
              <RailAction
                label="Open ERDBPro SaaS (Cloud SaaS)"
                icon={ExternalLink}
                onClick={openSaaS}
              />
            )}
            {isSelfHosted && canManageInstance && (
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    openOnHover
                    delay={0}
                    closeDelay={120}
                    render={
                      <SidebarMenuButton
                        isActive={location.pathname === "/team-workspaces" || location.pathname === "/users"}
                        aria-label="Instance Administration (Self-Host)"
                        title="Instance Administration (Self-Host)"
                        className="relative mx-auto !size-8 !justify-center !p-0"
                      >
                        <Shield aria-hidden="true" />
                      </SidebarMenuButton>
                    }
                  />
                  <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="start" sideOffset={8}>
                    <DropdownMenuItem onClick={() => navigate("/team-workspaces")}>
                      <Folder aria-hidden="true" />
                      Team
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/users")}>
                      <UsersRound aria-hidden="true" />
                      Users
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )}
          </SidebarMenu>

          <div className="mx-auto h-px w-8 bg-sidebar-border" aria-hidden="true" />

          <SidebarMenu className="gap-1">
            <RailAction
              label="Notes"
              icon={FileText}
              active={activeFeatureView === "notes"}
              locked={cloudFeatureLocked("notes")}
              onClick={() => onFeatureClick("Notes", "notes", () => onViewChange("notes", true))}
            />
            <RailAction
              label="ERD Builder"
              icon={Database}
              active={activeFeatureView === "erd"}
              locked={cloudFeatureLocked("erd_builder")}
              onClick={() => onFeatureClick("ERD Builder", "erd_builder", () => onViewChange("erd", true))}
            />
            {showDbClient && (
              <RailAction
                label="DB Client"
                icon={DatabaseZap}
                active={activeFeatureView === "db-client"}
                disabled={!isOnline}
                onClick={() => { void openDbClient() }}
              />
            )}
            <RailAction
              label="Flowchart"
              icon={Network}
              active={activeFeatureView === "flowchart"}
              locked={cloudFeatureLocked("flowcharts")}
              onClick={() => onFeatureClick("Flowchart", "flowcharts", () => onViewChange("flowchart", true))}
            />
            <RailAction
              label="Drawings"
              icon={PenTool}
              active={activeFeatureView === "drawings"}
              locked={cloudFeatureLocked("drawings")}
              onClick={() => onFeatureClick("Drawings", "drawings", () => onViewChange("drawings", true))}
            />
          </SidebarMenu>
        </div>
      </SidebarContent>

      <SidebarFooter className="items-center border-t border-sidebar-border p-2">
        <NavUser
          user={user}
          onLogout={onLogout}
          onViewChange={onViewChange}
          isOnline={isOnline}
          onOpenFeedback={onOpenFeedback}
          compact
        />
      </SidebarFooter>
    </Sidebar>
  )
}
