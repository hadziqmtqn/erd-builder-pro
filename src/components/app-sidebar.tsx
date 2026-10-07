import * as React from "react"
import { useState } from "react"
import {
  ArrowUpRight,
  Sparkles,
} from "lucide-react"

import type { SwitcherTeam } from "@/components/team-switcher"
import { PrimaryNavRail } from "@/components/sidebar/PrimaryNavRail"
import { WorkspaceSidebarPanel } from "@/components/sidebar/WorkspaceSidebarPanel"
import { AddTeamDialog } from "@/components/team/AddTeamDialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { isInstalledApp } from "@/lib/api"
import type { Project, AppView } from "../types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[];
  activeFeatureView: AppView | 'db-client' | null;
  globalSearchResults: any[];
  isGlobalSearchLoading: boolean;
  onGlobalSearchResultSelect: (result: any) => void;
  onViewChange: (view: AppView, showTable?: boolean, workspaceUid?: string | null) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number | string, name: string) => void;
  onProjectDelete: (id: number | string) => void;
  onLogout: () => void;
  onWorkspaceFilter: (uid: string | null) => void;
  selectedWorkspaceUid: string | null;
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

export const AppSidebar = React.memo(({
  projects,
  activeFeatureView,
  globalSearchResults,
  isGlobalSearchLoading,
  onGlobalSearchResultSelect,
  onViewChange,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onLogout,
  onWorkspaceFilter,
  selectedWorkspaceUid,
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
  const [isTeamCreateOpen, setIsTeamCreateOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const showDbClient = isInstalledApp();
  const isSelfHosted = !showDbClient && !user?.isSso && (user?.isSuperAdmin !== undefined || user?.is_super_admin !== undefined);
  const showSponsor = user?.isSso === true || showDbClient || (isSelfHosted && licenseRequired);
  const activeTeam = teams.find((team) => team.id === activeTeamId) || null;
  const cloudTeamCapabilities = user?.isSso && activeTeamId && teamsAvailable
    ? activeTeam?.capabilities || {}
    : null;
  const isCloudFeatureLocked = (capability: string) => cloudTeamCapabilities !== null && cloudTeamCapabilities[capability] !== true;

  const openCloudPricing = () => {
    if (!ssoPortalUrl) return;
    try {
      window.location.assign(new URL('/pricing#cloud-saas', ssoPortalUrl).toString());
    } catch {
      // Ignore malformed deployment configuration and keep the dialog open.
    }
  };

  const handleFeatureClick = (title: string, capability: string, onOpen: () => void) => {
    if (isCloudFeatureLocked(capability)) {
      setUpgradeFeature(title);
      return;
    }
    onOpen();
  };

  return (
    <>
      <Sidebar
        collapsible="icon"
        {...props}
        className={cn("overflow-hidden *:data-[sidebar=sidebar]:flex-row", props.className)}
      >
        <div data-sidebar="sidebar" className="flex h-full min-h-0 w-full">
          <PrimaryNavRail
            activeFeatureView={activeFeatureView}
            canManageInstance={Boolean(user?.isSuperAdmin || user?.is_super_admin)}
            cloudFeatureLocked={isCloudFeatureLocked}
            isOnline={isOnline}
            isSelfHosted={isSelfHosted}
            onFeatureClick={handleFeatureClick}
            onLogout={onLogout}
            onOpenFeedback={onOpenFeedback}
            onViewChange={onViewChange}
            ssoPortalUrl={ssoPortalUrl}
            user={user}
            showDbClient={showDbClient}
          />
          <WorkspaceSidebarPanel
            activeTeamId={activeTeamId}
            globalSearchQuery={globalSearchQuery}
            globalSearchResults={globalSearchResults}
            isGlobalSearchLoading={isGlobalSearchLoading}
            isOnline={isOnline}
            isProjectsLoading={isProjectsLoading}
            onGlobalSearchChange={onGlobalSearchChange}
            onGlobalSearchResultSelect={onGlobalSearchResultSelect}
            onTeamAdd={() => setIsTeamCreateOpen(true)}
            onTeamManage={onTeamManage}
            onTeamSelect={onTeamSelect}
            onTeamsRefresh={onTeamsRefresh}
            onProjectCreate={onProjectCreate}
            onProjectDelete={onProjectDelete}
            onProjectUpdate={onProjectUpdate}
            onWorkspaceFilter={onWorkspaceFilter}
            projects={projects}
            selectedWorkspaceUid={selectedWorkspaceUid}
            showDbClient={showDbClient}
            showSponsor={showSponsor}
            teams={teams}
            teamsAvailable={teamsAvailable}
            user={user}
          />
        </div>
      </Sidebar>

      <AddTeamDialog
        open={isTeamCreateOpen}
        onOpenChange={setIsTeamCreateOpen}
        onCreate={onTeamCreate}
        onCreated={onTeamCreated}
      />

      <Dialog open={upgradeFeature !== null} onOpenChange={(open) => { if (!open) setUpgradeFeature(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" aria-hidden="true" />
              </div>
              <DialogTitle>Unlock {upgradeFeature}</DialogTitle>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {upgradeFeature} is available with a paid Cloud plan. Upgrade to keep using this feature in your Team workspace.
            </p>
          </DialogHeader>
          <DialogBody>
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Cloud workspace feature</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Plans, limits, and checkout are managed in ERDBPro SaaS.</p>
              </div>
              <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">PRO</span>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="h-9" />}>Not now</DialogClose>
            <Button className="h-9" onClick={openCloudPricing} disabled={!ssoPortalUrl}>
              View Cloud plans
              <ArrowUpRight className="size-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
