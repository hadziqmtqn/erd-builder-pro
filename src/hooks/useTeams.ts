import { useCallback, useEffect, useRef, useState } from "react";

import { ACTIVE_TEAM_KEY, apiFetch, getApiBaseUrl } from "../lib/api";

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

function readActiveTeamId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TEAM_KEY);
  } catch {
    return null;
  }
}

function writeActiveTeamId(teamId: string | null): void {
  try {
    if (teamId) localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
    else localStorage.removeItem(ACTIVE_TEAM_KEY);
  } catch {
    // localStorage is optional; the current session still works in memory.
  }
}

export function useTeams(isGuest = false, isSso = false, onActiveTeamUnavailable?: () => void) {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(readActiveTeamId);
  const [isLoading, setIsLoading] = useState(!isGuest);
  const [isAvailable, setIsAvailable] = useState(false);
  const fetchVersion = useRef(0);

  const fetchTeams = useCallback(async (showLoading = false) => {
    const version = ++fetchVersion.current;
    if (isGuest) {
      setIsLoading(false);
      setIsAvailable(false);
      return [];
    }

    if (showLoading) setIsLoading(true);
    try {
      const response = await apiFetch("/api/teams");
      if (version !== fetchVersion.current) return [];
      if (response.status === 404 || response.status === 403) {
        const selected = readActiveTeamId();
        setTeams([]);
        setActiveTeamId(null);
        writeActiveTeamId(null);
        if (selected) onActiveTeamUnavailable?.();
        setIsAvailable(false);
        return [];
      }
      if (!response.ok) throw new Error("Failed to fetch teams");

      const body = await response.json();
      const nextTeams = Array.isArray(body.data) ? body.data : [];
      if (version !== fetchVersion.current) return nextTeams;
      setTeams(nextTeams);
      setIsAvailable(true);
      const selected = readActiveTeamId();
      if (selected && nextTeams.some((team: TeamSummary) => String(team.id) === selected)) {
        setActiveTeamId(selected);
      } else if (selected) {
        setActiveTeamId(null);
        writeActiveTeamId(null);
        onActiveTeamUnavailable?.();
      }
      return nextTeams;
    } catch (error) {
      if (version !== fetchVersion.current) return [];
      console.error("Failed to fetch teams:", error);
      setTeams([]);
      setIsAvailable(false);
      return [];
    } finally {
      if (showLoading && version === fetchVersion.current) setIsLoading(false);
    }
  }, [isGuest, onActiveTeamUnavailable]);

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
      const teamId = (event as CustomEvent<{ teamId?: string }>).detail?.teamId;
      if (!teamId) return;
      if (teamId === activeTeamId) {
        setActiveTeamId(null);
        writeActiveTeamId(null);
      }
      void fetchTeams();
    };
    window.addEventListener("team-quarantined", clearQuarantinedTeam);
    return () => window.removeEventListener("team-quarantined", clearQuarantinedTeam);
  }, [activeTeamId, fetchTeams]);

  useEffect(() => {
    if (isGuest || !isSso || !activeTeamId) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let retries = 0;
    let refreshOnReconnect = false;
    const connect = () => {
      if (disposed || document.hidden || !navigator.onLine) return;
      const apiUrl = new URL(getApiBaseUrl() || window.location.origin, window.location.origin);
      apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
      apiUrl.pathname = "/api/cloud/live-sync";
      apiUrl.search = new URLSearchParams({ team_id: activeTeamId }).toString();
      const current = new WebSocket(apiUrl.toString());
      socket = current;
      current.onopen = () => {
        if (refreshOnReconnect) {
          refreshOnReconnect = false;
          void fetchTeams();
        }
        retries = 0;
      };
      current.onmessage = (message) => {
        let event: { teamId?: unknown; eventType?: unknown; revision?: unknown };
        try { event = JSON.parse(message.data); }
        catch { return; }
        if (event.teamId !== activeTeamId || event.eventType !== "cloud.workspace.sync" || typeof event.revision !== "string" || !event.revision) return;
        void fetchTeams();
        window.dispatchEvent(new CustomEvent("cloud-workspace-sync", { detail: event }));
      };
      current.onclose = () => {
        if (socket === current) socket = null;
        if (!disposed) {
          refreshOnReconnect = true;
        }
        if (!disposed && !document.hidden && navigator.onLine) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = 0;
            connect();
          }, Math.min(30_000, 1_000 * 2 ** Math.min(retries++, 5)));
        }
      };
      current.onerror = () => current.close();
    };
    const reconnectWhenVisible = () => {
      if (!document.hidden && navigator.onLine && !socket && !reconnectTimer) connect();
    };
    const handleOffline = () => {
      refreshOnReconnect = true;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
      socket?.close(1000, "Network offline");
    };
    const handleOnline = () => {
      refreshOnReconnect = true;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
      if (socket) {
        socket.close(1000, "Network restored");
        return;
      }
      reconnectWhenVisible();
    };
    document.addEventListener("visibilitychange", reconnectWhenVisible);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", reconnectWhenVisible);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      socket?.close();
    };
  }, [activeTeamId, fetchTeams, isGuest, isSso]);

  const selectTeam = useCallback((teamId: string | null) => {
    setActiveTeamId(teamId);
    writeActiveTeamId(teamId);
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
    fetchTeams,
    selectTeam,
    createTeam,
  };
}

export type TeamsState = ReturnType<typeof useTeams>;
