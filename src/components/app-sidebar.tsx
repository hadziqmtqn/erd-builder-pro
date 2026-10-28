import * as React from "react"
import { useState } from "react"
import { ExternalLink, Folder, LayoutDashboard, Library, Shield, UsersRound } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { NavUser } from "@/components/nav-user"
import { SponsorCarousel } from "@/components/SponsorCarousel"
import { TeamSwitcher, type SwitcherTeam } from "@/components/team-switcher"
import { SpotlightSearch } from "@/components/sidebar/SpotlightSearch"
import { WorkspaceSidebarPanel } from "@/components/sidebar/WorkspaceSidebarPanel"
import { AddTeamDialog } from "@/components/team/AddTeamDialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isInstalledApp } from "@/lib/api"
import type { Project, AppView } from "../types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[];
  globalSearchResults: any[];
  isGlobalSearchLoading: boolean;
  onGlobalSearchResultSelect: (result: any) => void;
  onViewChange: (view: AppView, showTable?: boolean, workspaceUid?: string | null) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number | string, name: string) => void;
  onProjectDelete: (id: number | string) => void;
  onLogout: () => void;
  globalSearchQuery: string;
  onGlobalSearchChange: (query: string) => void;
  isProjectsLoading?: boolean;
  user: any;
  isOnline: boolean;
  onOpenFeedback: () => void;
  teams: SwitcherTeam[];
  teamsAvailable: boolean;
  licenseRequired: boolean;
  activeTeamId: string | null;
  onTeamsRefresh: () => void;
  onTeamSelect: (teamId: string | null) => void;
  onTeamManage: (team: SwitcherTeam) => void;
  onTeamCreate: (input: { name: string }) => Promise<unknown>;
  onTeamCreated: (team: any) => void;
  ssoPortalUrl?: string | null;
}

/** The single app sidebar: workspace, search, Dashboard and Projects (COL-008). */
export const AppSidebar = React.memo(({
  projects,
  globalSearchResults,
  isGlobalSearchLoading,
  onGlobalSearchResultSelect,
  onViewChange,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onLogout,
  globalSearchQuery,
  onGlobalSearchChange,
  isProjectsLoading,
  user,
  isOnline,
  onOpenFeedback,
  teams,
  teamsAvailable,
  licenseRequired,
  activeTeamId,
  onTeamsRefresh,
  onTeamSelect,
  onTeamManage,
  onTeamCreate,
  onTeamCreated,
  ssoPortalUrl,
  ...props
}: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useSidebar();
  const [isTeamCreateOpen, setIsTeamCreateOpen] = useState(false);
  const showDbClient = isInstalledApp();
  const isSelfHosted = !showDbClient && !user?.isSso && (user?.isSuperAdmin !== undefined || user?.is_super_admin !== undefined);
  const canManageInstance = Boolean(user?.isSuperAdmin || user?.is_super_admin);
  const showSponsor = user?.isSso === true || showDbClient || (isSelfHosted && licenseRequired);

  const openSaaS = () => {
    if (!ssoPortalUrl) return;
    try {
      window.location.assign(new URL("/dashboard", ssoPortalUrl).toString());
    } catch {
      // Ignore malformed deployment configuration.
    }
  };

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="gap-2 border-b border-sidebar-border">
          <TeamSwitcher
            teams={teams}
            activeTeamId={activeTeamId}
            enabled={teamsAvailable || teams.length > 0}
            canManageTeams={canManageInstance}
            onOpen={onTeamsRefresh}
            onSelect={onTeamSelect}
            onAdd={() => setIsTeamCreateOpen(true)}
            onManage={onTeamManage}
          />
          <SpotlightSearch
            query={globalSearchQuery}
            results={globalSearchResults}
            isLoading={isGlobalSearchLoading}
            isOnline={isOnline}
            showDbClient={showDbClient}
            onQueryChange={onGlobalSearchChange}
            onResultSelect={onGlobalSearchResultSelect}
          />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Dashboard" isActive={location.pathname === "/"} onClick={() => navigate("/")}>
                    <LayoutDashboard aria-hidden="true" />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {user?.isSso && ssoPortalUrl && (
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Manage account & billing" onClick={openSaaS}>
                      <ExternalLink aria-hidden="true" />
                      <span>Manage account & billing</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {user?.isSso && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Library"
                      isActive={location.pathname === "/library"}
                      disabled={!isOnline}
                      onClick={() => navigate("/library")}
                    >
                      <Library aria-hidden="true" />
                      <span>Library</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <WorkspaceSidebarPanel
            activeTeamId={activeTeamId}
            isProjectsLoading={isProjectsLoading}
            onProjectCreate={onProjectCreate}
            onProjectDelete={onProjectDelete}
            onProjectUpdate={onProjectUpdate}
            projects={projects}
            user={user}
          />
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          {showSponsor && (
            <div className="group-data-[collapsible=icon]:hidden">
              <SponsorCarousel />
            </div>
          )}
          {isSelfHosted && canManageInstance && (
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuButton
                        tooltip="Instance Administration"
                        isActive={location.pathname === "/team-workspaces" || location.pathname === "/users"}
                      >
                        <Shield aria-hidden="true" />
                        <span>Instance Administration</span>
                      </SidebarMenuButton>
                    }
                  />
                  <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" sideOffset={8}>
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
            </SidebarMenu>
          )}
          <NavUser
            user={user}
            onLogout={onLogout}
            onViewChange={onViewChange}
            isOnline={isOnline}
            onOpenFeedback={onOpenFeedback}
          />
        </SidebarFooter>
      </Sidebar>

      <AddTeamDialog
        open={isTeamCreateOpen}
        onOpenChange={setIsTeamCreateOpen}
        onCreate={onTeamCreate}
        onCreated={onTeamCreated}
      />
    </>
  );
});
