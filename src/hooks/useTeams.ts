import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../lib/api";

const ACTIVE_TEAM_KEY = "erd-active-team-id";

export type TeamLicense = {
  valid: boolean;
  status: string;
  id?: string | null;
  code_last_four?: string | null;
  plan_code?: string | null;
  expires_at?: string | null;
  max_members?: number | null;
  binding_generation?: number;
  last_checked_at?: string | null;
  error_code?: string;
};

export type TeamSummary = {
  id: string;
  name: string;
  member_count?: number;
  can_manage?: boolean;
  license?: TeamLicense;
  members?: Array<{
    id: string;
    email: string | null;
    name: string | null;
    role: "member";
    status: string;
    joined_at: string;
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

export function useTeams(isGuest = false) {
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
  }, [isGuest]);

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  const selectTeam = useCallback((teamId: string | null) => {
    setActiveTeamId(teamId);
    writeActiveTeamId(teamId);
  }, []);

  const createTeam = useCallback(async (input: { name: string; licenseKey: string }) => {
    const response = await apiFetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, license_key: input.licenseKey }),
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
