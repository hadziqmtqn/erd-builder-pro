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
  it.each(["GET", "DELETE"])("scopes %s Trash requests to the active Team", async (method) => {
    useActiveTeam();
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/trash", { method });

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Team-Id")).toBe("team-1");
  });

  it.each(["personal", "desktop", "cli"])("does not attach a Team to Trash in %s mode", async (mode) => {
    useActiveTeam(mode === "personal" ? "" : "team-1");
    if (mode === "desktop") vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    if (mode === "cli") vi.stubGlobal("window", { ERD_INSTALL_MODE: "cli" });
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/trash");

    expect(new Headers(fetchMock.mock.calls[0][1].headers).has("X-Team-Id")).toBe(false);
  });

  it("sends the active Team with Cloud Feedback", async () => {
    useActiveTeam();
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/feedback", { method: "POST" });

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Team-Id")).toBe("team-1");
  });

  it("sends the active Team to all Team-scoped AI endpoints", async () => {
    useActiveTeam();
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/notes");
    await apiFetch("/api/projects?limit=100&offset=0");
    await apiFetch("/api/ai/rules/erd");
    await apiFetch("/api/ai/proxy");
    await apiFetch("/api/ai/settings/prompts");

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Team-Id")).toBe("team-1");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-Team-Id")).toBe("team-1");
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("X-Team-Id")).toBe("team-1");
    expect(new Headers(fetchMock.mock.calls[3][1].headers).get("X-Team-Id")).toBe("team-1");
    expect(new Headers(fetchMock.mock.calls[4][1].headers).get("X-Team-Id")).toBe("team-1");
  });
});
