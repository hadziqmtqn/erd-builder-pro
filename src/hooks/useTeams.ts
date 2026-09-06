import { useCallback, useEffect, useState } from "react";

import { ACTIVE_TEAM_KEY, apiFetch } from "../lib/api";

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

export function useTeams(isGuest = false, selectFirstTeam = false, onFirstTeamSelected?: () => void | Promise<void>) {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(readActiveTeamId);
  const [isLoading, setIsLoading] = useState(!isGuest);
  const [isAvailable, setIsAvailable] = useState(false);

  const fetchTeams = useCallback(async () => {
    if (isGuest) {
      setIsLoading(false);
      setIsAvailable(false);
      return [];
    }

    setIsLoading(true);
    try {
      const response = await apiFetch("/api/teams");
      if (response.status === 404 || response.status === 403) {
        setTeams([]);
        setActiveTeamId(null);
        writeActiveTeamId(null);
        setIsAvailable(false);
        return [];
      }
      if (!response.ok) throw new Error("Failed to fetch teams");

      const body = await response.json();
      const nextTeams = Array.isArray(body.data) ? body.data : [];
      setTeams(nextTeams);
      setIsAvailable(true);
      const selected = readActiveTeamId();
      if (selected && nextTeams.some((team: TeamSummary) => String(team.id) === selected)) {
        setActiveTeamId(selected);
      } else if (selectFirstTeam && nextTeams[0]) {
        const teamId = String(nextTeams[0].id);
        setActiveTeamId(teamId);
        writeActiveTeamId(teamId);
        await onFirstTeamSelected?.();
      } else if (selected) {
        setActiveTeamId(null);
        writeActiveTeamId(null);
      }
      return nextTeams;
    } catch (error) {
      console.error("Failed to fetch teams:", error);
      setTeams([]);
      setIsAvailable(false);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [isGuest, onFirstTeamSelected, selectFirstTeam]);

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

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
