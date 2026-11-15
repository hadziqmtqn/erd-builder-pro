import { useCallback, useEffect, useRef, useState } from "react";

import { ACTIVE_TEAM_KEY, apiFetch } from "../lib/api";
import { openLiveSocket } from "../lib/live-socket";

export type TeamLicense = {
  valid: boolean;
  status: string;
  id?: string | null;
  codeLastFour?: string | null;
  planCode?: string | null;
  expiresAt?: string | null;
  maxMembers?: number | null;
  maxTeams?: number | null;
  bindingGeneration?: number;
  lastCheckedAt?: string | null;
  errorCode?: string;
};

export type TeamSummary = {
  id: string;
  name: string;
  memberCount?: number;
  canManage?: boolean;
  manageUrl?: string;
  capabilities?: Record<string, boolean>;
  license?: TeamLicense;
  members?: Array<{
    id: string;
    email: string | null;
    name: string | null;
    role: "manager" | "staff";
    status: string;
    joinedAt: string;
  }>;
};

// The key holds "" once the user picks Personal and is missing before any choice, so a reload keeps Personal (BUG-063).
function readActiveTeamId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TEAM_KEY) || null;
  } catch {
    return null;
  }
}

function writeActiveTeamId(teamId: string | null): void {
  try {
    if (teamId === null) localStorage.removeItem(ACTIVE_TEAM_KEY);
    else localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
  } catch {
    // localStorage is optional; the current session still works in memory.
  }
}

/** Opens the Team named by /api/me only while this browser has no workspace choice yet. */
export function seedActiveTeamId(teamId: string | null | undefined): void {
  try {
    if (teamId && localStorage.getItem(ACTIVE_TEAM_KEY) === null) localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
  } catch {
    // localStorage is optional; the current session still works in memory.
  }
}

export function useTeams(isGuest = false, isSso = false, onActiveTeamUnavailable?: () => void) {
  const onUnavailableRef = useRef(onActiveTeamUnavailable);
  onUnavailableRef.current = onActiveTeamUnavailable;
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(readActiveTeamId);
  const [isLoading, setIsLoading] = useState(!isGuest);
  const [isAvailable, setIsAvailable] = useState(false);
  const [licenseRequired, setLicenseRequired] = useState(false);
  const fetchVersion = useRef(0);

  const fetchTeams = useCallback(async (showLoading = false) => {
    const version = ++fetchVersion.current;
    if (isGuest) {
      setIsLoading(false);
      setIsAvailable(false);
      setLicenseRequired(false);
      return [];
    }

    if (showLoading) setIsLoading(true);
    try {
      const response = await apiFetch("/api/teams");
      if (version !== fetchVersion.current) return [];
      if (response.status === 404 || response.status === 403) {
        const body = response.status === 403
          ? await response.json().catch(() => ({})) as { code?: string }
          : {};
        const selected = readActiveTeamId();
        setTeams([]);
        setActiveTeamId(null);
        if (selected) {
          writeActiveTeamId(null);
          onUnavailableRef.current?.();
        }
        setIsAvailable(false);
        setLicenseRequired(["INSTANCE_LICENSE_REQUIRED", "LICENSE_EXPIRED_OR_INVALID"].includes(body.code || ""));
        return [];
      }
      if (!response.ok) throw new Error("Failed to fetch teams");

      const body = await response.json();
      const nextTeams = Array.isArray(body.data) ? body.data : [];
      if (version !== fetchVersion.current) return nextTeams;
      setTeams(nextTeams);
      setIsAvailable(true);
      setLicenseRequired(false);
      const selected = readActiveTeamId();
      if (selected && nextTeams.some((team: TeamSummary) => String(team.id) === selected)) {
        setActiveTeamId(selected);
      } else if (selected) {
        setActiveTeamId(null);
        writeActiveTeamId(null);
        onUnavailableRef.current?.();
      }
      return nextTeams;
    } catch (error) {
      if (version !== fetchVersion.current) return [];
      console.error("Failed to fetch teams:", error);
      setTeams([]);
      setIsAvailable(false);
      setLicenseRequired(false);
      return [];
    } finally {
      if (showLoading && version === fetchVersion.current) setIsLoading(false);
    }
  }, [isGuest]);

  useEffect(() => {
    void fetchTeams(true);
  }, [fetchTeams]);

  useEffect(() => {
    if (isGuest) return;

    const refreshWhenVisible = () => {
      if (!document.hidden) void fetchTeams();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchTeams, isGuest]);

  useEffect(() => {
    const clearQuarantinedTeam = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string; status?: string }>).detail;
      const teamId = detail?.teamId;
      if (!teamId) return;
      if (teamId === activeTeamId && detail?.status !== "active") {
        setActiveTeamId(null);
        writeActiveTeamId(null);
        onActiveTeamUnavailable?.();
      }
      void fetchTeams();
    };
    window.addEventListener("team-quarantined", clearQuarantinedTeam);
    window.addEventListener("team-status-changed", clearQuarantinedTeam);
    return () => {
      window.removeEventListener("team-quarantined", clearQuarantinedTeam);
      window.removeEventListener("team-status-changed", clearQuarantinedTeam);
    };
  }, [activeTeamId, fetchTeams, onActiveTeamUnavailable]);

  useEffect(() => {
    if (isGuest || !isSso || !activeTeamId) return;
    return openLiveSocket("/api/cloud/live-sync", { team_id: activeTeamId }, {
      onReconnect: () => {
        void fetchTeams();
        window.dispatchEvent(new CustomEvent("cloud-live-sync-reconnected", { detail: { teamId: activeTeamId } }));
      },
      onEvent: (event) => {
        if (event.teamId !== activeTeamId || event.eventType !== "cloud.workspace.sync" || typeof event.revision !== "string" || !event.revision) return;
        void fetchTeams();
        window.dispatchEvent(new CustomEvent("cloud-workspace-sync", { detail: event }));
      },
    });
  }, [activeTeamId, fetchTeams, isGuest, isSso]);

  const selectTeam = useCallback((teamId: string | null) => {
    setActiveTeamId(teamId);
    writeActiveTeamId(teamId ?? "");
  }, []);

  const createTeam = useCallback(async (input: { name: string }) => {
    const response = await apiFetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || "Failed to create team") as Error & { code?: string };
      error.code = body.code;
      throw error;
    }

    const team = body;
    setTeams((current) => [team, ...current.filter((item) => item.id !== team.id)]);
    selectTeam(team.id);
    return team as TeamSummary;
  }, [selectTeam]);

  return {
    teams,
    activeTeamId,
    activeTeam: teams.find((team) => team.id === activeTeamId) || null,
    isLoading,
    isAvailable,
    licenseRequired,
    fetchTeams,
    selectTeam,
    createTeam,
  };
}

export type TeamsState = ReturnType<typeof useTeams>;
