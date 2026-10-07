import { Check, ChevronsUpDown, Plus, Settings2, UserRound, UsersRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TeamSummary } from "@/hooks/useTeams";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type SwitcherTeam = TeamSummary;

export function TeamSwitcher({
  teams,
  activeTeamId,
  enabled,
  canManageTeams,
  onOpen,
  onSelect,
  onAdd,
  onManage,
}: {
  teams: SwitcherTeam[];
  activeTeamId: string | null;
  enabled: boolean;
  canManageTeams: boolean;
  onOpen: () => void;
  onSelect: (teamId: string | null) => void;
  onAdd: () => void;
  onManage: (team: SwitcherTeam) => void;
}) {
  const { isMobile } = useSidebar();
  const activeTeam = teams.find((team) => team.id === activeTeamId) || null;
  const workspaceName = activeTeam?.name || (activeTeamId ? "Loading workspace…" : "Personal");

  const trigger = (
    <SidebarMenuButton
      size="lg"
      aria-label={`Switch workspace. Current workspace: ${workspaceName}`}
      title={`Workspace: ${workspaceName}`}
      className="h-9 cursor-pointer px-2 transition-colors hover:bg-accent/50 active:bg-accent/70"
      onClick={enabled ? undefined : () => onSelect(null)}
    >
      <span className="min-w-0 flex-1 truncate text-left font-medium">{workspaceName}</span>
      {enabled && <ChevronsUpDown className="ml-auto size-4 shrink-0" />}
    </SidebarMenuButton>
  );

  if (!enabled) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          {trigger}
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => { if (open) onOpen(); }}>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent
            className="min-w-64 border border-border/70 p-1.5 shadow-xl"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">Team</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => onSelect(null)}
                className={`cursor-pointer gap-2 px-2.5 py-2 transition-colors hover:bg-brand/10 hover:text-foreground focus:bg-brand/10 focus:text-foreground focus:[&>svg]:text-brand ${!activeTeamId ? "bg-brand/10 text-foreground [&>svg]:text-brand" : ""}`}
              >
                <UserRound className="size-4 text-muted-foreground transition-colors" />
                <span>Personal</span>
                {!activeTeamId && <Check className="ml-auto size-4 text-brand" />}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            {teams.length > 0 && <DropdownMenuSeparator className="my-1.5" />}
            {teams.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">Teams</DropdownMenuLabel>
                {teams.map((team) => (
                  <DropdownMenuItem
                    key={team.id}
                    onClick={() => onSelect(team.id)}
                    className={`cursor-pointer gap-2 px-2.5 py-2 transition-colors hover:bg-brand/10 hover:text-foreground focus:bg-brand/10 focus:text-foreground focus:[&>svg]:text-brand ${activeTeamId === team.id ? "bg-brand/10 text-foreground [&>svg]:text-brand" : ""}`}
                  >
                    <UsersRound className="size-4 text-muted-foreground transition-colors" />
                    <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    <span className="ml-auto flex items-center gap-1">
                      {activeTeamId === team.id && <Check className="size-4 text-brand" />}
                      {team.canManage && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                aria-label={`Open Team Management for ${team.name}`}
                                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-muted/50 text-muted-foreground transition-all hover:border-brand/40 hover:bg-brand hover:text-white hover:shadow-sm focus-visible:border-brand focus-visible:bg-brand focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  onManage(team);
                                }}
                              >
                                <Settings2 className="size-3.5" />
                              </button>
                            }
                          />
                          <TooltipContent side="top" className="text-xs">Manage team</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}

            {canManageTeams && (
              <>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onAdd} className="cursor-pointer gap-2 px-2.5 py-2 transition-colors hover:bg-brand/10 hover:text-foreground focus:bg-brand/10 focus:text-foreground focus:[&>svg]:text-brand">
                    <Plus className="size-4 text-muted-foreground transition-colors" />
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
