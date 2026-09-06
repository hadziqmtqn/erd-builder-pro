import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTIVE_TEAM_KEY, apiFetch } from "./api";

afterEach(() => vi.unstubAllGlobals());

function useActiveTeam(teamId = "team-1") {
  const values = new Map([[ACTIVE_TEAM_KEY, teamId]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
}

describe("apiFetch Team scope", () => {
  it("sends the active Team only to Team-scoped data endpoints", async () => {
    useActiveTeam();
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/notes");
    await apiFetch("/api/ai/rules/erd");

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Team-Id")).toBe("team-1");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-Team-Id")).toBeNull();
  });
});
