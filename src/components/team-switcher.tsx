import { Check, ChevronsUpDown, Database, Plus, Settings2, UsersRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type SwitcherTeam = {
  id: string;
  name: string;
  license?: { status?: string };
};

function statusLabel(team: SwitcherTeam): string {
  const status = team.license?.status;
  if (status === "expired") return "License expired";
  if (status === "active") return "Team";
  return "License unavailable";
}

export function TeamSwitcher({
  teams,
  activeTeamId,
  enabled,
  canManageTeams,
  onSelect,
  onAdd,
  onManage,
}: {
  teams: SwitcherTeam[];
  activeTeamId: string | null;
  enabled: boolean;
  canManageTeams: boolean;
  onSelect: (teamId: string | null) => void;
  onAdd: () => void;
  onManage: (team: SwitcherTeam) => void;
}) {
  const { isMobile } = useSidebar();
  const activeTeam = teams.find((team) => team.id === activeTeamId) || null;
  const title = activeTeam?.name || "ERD Builder Pro";
  const subtitle = activeTeam ? statusLabel(activeTeam) : "Personal";

  const trigger = (
    <SidebarMenuButton
      size="lg"
      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
    >
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand text-white">
        {activeTeam ? <UsersRound className="size-4" /> : <Database className="size-4" />}
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{title}</span>
        <span className="truncate text-xs">{subtitle}</span>
      </div>
      <ChevronsUpDown className="ml-auto size-4" />
    </SidebarMenuButton>
  );

  if (!enabled) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" onClick={() => onSelect(null)}>
            <Database className="size-4" />
            <span>ERD Builder Pro</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent
            className="min-w-64"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Personal</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSelect(null)} className="cursor-pointer">
                <Database className="size-4" />
                <span>ERD Builder Pro</span>
                {!activeTeamId && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            {teams.length > 0 && <DropdownMenuSeparator />}
            {teams.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Teams</DropdownMenuLabel>
                {teams.map((team) => (
                  <DropdownMenuItem
                    key={team.id}
                    onClick={() => onSelect(team.id)}
                    className="cursor-pointer"
                  >
                    <UsersRound className="size-4" />
                    <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    {activeTeamId === team.id && <Check className="size-4" />}
                    <button
                      type="button"
                      aria-label={`Manage ${team.name}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onManage(team);
                      }}
                    >
                      <Settings2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}

            {canManageTeams && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onAdd} className="cursor-pointer">
                    <Plus className="size-4" />
                    <span>Add Team</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
