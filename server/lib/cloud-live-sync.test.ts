import { createServer } from "node:http";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSsoAuthMode: vi.fn(() => true),
  isLocalPostgres: vi.fn(() => true),
  getSession: vi.fn(),
  canAccessTeam: vi.fn(),
  userFindUnique: vi.fn(),
  teamFindFirst: vi.fn(),
}));

vi.mock("./config.js", () => ({ isSsoAuthMode: mocks.isSsoAuthMode, isLocalPostgres: mocks.isLocalPostgres }));
vi.mock("./desktop-auth.js", () => ({ getSession: mocks.getSession }));
vi.mock("./prisma.js", () => ({ prisma: {
  user: { findUnique: mocks.userFindUnique },
  team: { findFirst: mocks.teamFindFirst },
} }));
vi.mock("../routes/teams/service.js", () => ({ canAccessTeam: mocks.canAccessTeam }));

const { attachCloudLiveSync, publishUserNotification, publishCloudWorkspaceSync } = await import("./cloud-live-sync.js");
const TEAM_ID = "9d7fdad2-d555-4aab-a917-39fb5bac9160";

describe("Cloud live sync WebSocket", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  let detach: () => void;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    mocks.isSsoAuthMode.mockReturnValue(true);
    mocks.isLocalPostgres.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({ userId: "cloud-user" });
    mocks.canAccessTeam.mockResolvedValue(true);
    mocks.userFindUnique.mockResolvedValue({ ssoSubject: "saas-user" });
    mocks.teamFindFirst.mockResolvedValue({ id: TEAM_ID });
    server = createServer();
    detach = attachCloudLiveSync(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("WebSocket test server failed to start");
    baseUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.terminate();
    detach();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.clearAllMocks();
  });

  function connect(options: { cookie?: string; origin?: string; forwardedProtocol?: string; path?: string } = {}): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const client = new WebSocket(`${baseUrl}${options.path ?? `/api/cloud/live-sync?team_id=${TEAM_ID}`}`, {
        headers: {
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.origin ? { Origin: options.origin } : {}),
          ...(options.forwardedProtocol ? { "X-Forwarded-Proto": options.forwardedProtocol } : {}),
        },
      });
      clients.push(client);
      client.once("open", () => resolve(client));
      client.once("error", reject);
    });
  }

  it("authenticates the active Cloud Team and sends metadata only", async () => {
    const origin = baseUrl.replace(/^ws:/, "http:");
    const client = await connect({ cookie: "token=session-cookie", origin });
    const message = new Promise<string>((resolve) => client.once("message", (data) => resolve(data.toString())));
    const event = { teamId: TEAM_ID, eventType: "cloud.workspace.sync" as const, revision: "event-uuid" };
    mocks.canAccessTeam.mockResolvedValue(false);

    await publishCloudWorkspaceSync(event);

    expect(JSON.parse(await message)).toEqual(event);
    expect(mocks.getSession).toHaveBeenCalledWith("session-cookie");
    expect(mocks.canAccessTeam).toHaveBeenCalledWith(TEAM_ID, "cloud-user", false);
    expect(mocks.teamFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: TEAM_ID, status: "active", ssoOrganizationId: { not: null } }),
    }));
  });

  it("attaches no socket where sessions are not local (Desktop, CLI, Supabase)", () => {
    mocks.isLocalPostgres.mockReturnValue(false);
    const desktopServer = createServer();

    const cleanup = attachCloudLiveSync(desktopServer);

    expect(desktopServer.listenerCount("upgrade")).toBe(0);
    cleanup();
    expect(desktopServer.listenerCount("upgrade")).toBe(0);
  });

  it("rejects cross-origin and inactive membership handshakes", async () => {
    await expect(connect({ cookie: "token=session-cookie", origin: "https://attacker.test" })).rejects.toThrow();
    expect(mocks.getSession).not.toHaveBeenCalled();
    await expect(connect({ cookie: "token=session-cookie", origin: baseUrl.replace(/^ws:/, "https:") })).rejects.toThrow();

    mocks.canAccessTeam.mockResolvedValue(false);
    await expect(connect({ cookie: "token=session-cookie", origin: baseUrl.replace(/^ws:/, "http:") })).rejects.toThrow();
  });

  it("accepts an HTTPS origin forwarded to the same Cloud host", async () => {
    const client = await connect({
      cookie: "token=session-cookie",
      origin: baseUrl.replace(/^ws:/, "https:"),
      forwardedProtocol: "https",
    });

    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("accepts an upgrade that Traefik forwards as ws/wss for the page protocol (BUG-054)", async () => {
    const https = await connect({ cookie: "token=session-cookie", origin: baseUrl.replace(/^ws:/, "https:"), forwardedProtocol: "wss" });
    const http = await connect({ cookie: "token=session-cookie", origin: baseUrl.replace(/^ws:/, "http:"), forwardedProtocol: "ws" });

    expect(https.readyState).toBe(WebSocket.OPEN);
    expect(http.readyState).toBe(WebSocket.OPEN);
    // A TLS upgrade cannot come from a plain-HTTP page, and another site stays refused.
    await expect(connect({ cookie: "token=session-cookie", origin: baseUrl.replace(/^ws:/, "http:"), forwardedProtocol: "wss" })).rejects.toThrow();
    await expect(connect({ cookie: "token=session-cookie", origin: "https://attacker.test", forwardedProtocol: "wss" })).rejects.toThrow();
  });

  it("sends metadata invalidation to a removed member, then denies a new authorization", async () => {
    const origin = baseUrl.replace(/^ws:/, "http:");
    const client = await connect({ cookie: "token=session-cookie", origin });
    const message = new Promise<string>((resolve) => client.once("message", (data) => resolve(data.toString())));
    const closed = new Promise<number>((resolve) => client.once("close", (code) => resolve(code)));
    mocks.canAccessTeam.mockResolvedValue(false);

    const event = { teamId: TEAM_ID, eventType: "cloud.workspace.sync" as const, revision: "event-uuid" };
    await publishCloudWorkspaceSync(event);

    expect(JSON.parse(await message)).toEqual(event);
    expect(await closed).toBe(1000);
    await expect(connect({ cookie: "token=session-cookie", origin })).rejects.toThrow();
    expect(mocks.canAccessTeam).toHaveBeenCalledWith(TEAM_ID, "cloud-user", false);
  });

  describe("notification channel (NOT-001.5)", () => {
    const NOTIFICATIONS = "/api/notifications/live";
    const origin = () => baseUrl.replace(/^ws:/, "http:");

    it("sends notification.created to the recipient's notification sockets only, never to Team sockets", async () => {
      const team = await connect({ cookie: "token=session-cookie", origin: origin() });
      const user = await connect({ cookie: "token=session-cookie", origin: origin(), path: NOTIFICATIONS });
      const teamMessages: string[] = [];
      const userMessages: string[] = [];
      team.on("message", (data) => teamMessages.push(data.toString()));
      user.on("message", (data) => userMessages.push(data.toString()));

      await publishUserNotification(["someone-else"]);
      await publishUserNotification([]);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(userMessages).toEqual([]);

      const closed = new Promise<number>((resolve) => user.once("close", (code) => resolve(code)));
      await publishUserNotification(["cloud-user"]);

      expect(await closed).toBe(1000);
      expect(userMessages.map((message) => JSON.parse(message))).toEqual([{ eventType: "notification.created", revision: expect.any(String) }]);
      expect(teamMessages).toEqual([]);
      expect(team.readyState).toBe(WebSocket.OPEN);
      expect(mocks.teamFindFirst).toHaveBeenCalledTimes(1);
    });

    it("opens with a Self-host session, where Team sockets stay refused", async () => {
      mocks.isSsoAuthMode.mockReturnValue(false);
      mocks.userFindUnique.mockResolvedValue({ ssoSubject: null });

      const user = await connect({ cookie: "token=local-session", origin: origin(), path: NOTIFICATIONS });
      const message = new Promise<string>((resolve) => user.once("message", (data) => resolve(data.toString())));
      await publishUserNotification(["cloud-user"]);

      expect(JSON.parse(await message)).toEqual({ eventType: "notification.created", revision: expect.any(String) });
      expect(mocks.getSession).toHaveBeenCalledWith("local-session");
      await expect(connect({ cookie: "token=local-session", origin: origin() })).rejects.toThrow();
    });

    it("refuses another origin, a missing or expired session, a deleted user and a Cloud user without SSO", async () => {
      await expect(connect({ cookie: "token=session-cookie", origin: "https://attacker.test", path: NOTIFICATIONS })).rejects.toThrow();
      await expect(connect({ origin: origin(), path: NOTIFICATIONS })).rejects.toThrow();
      expect(mocks.getSession).not.toHaveBeenCalled();

      mocks.getSession.mockResolvedValueOnce(undefined);
      await expect(connect({ cookie: "token=expired", origin: origin(), path: NOTIFICATIONS })).rejects.toThrow();
      mocks.userFindUnique.mockResolvedValueOnce(null);
      await expect(connect({ cookie: "token=session-cookie", origin: origin(), path: NOTIFICATIONS })).rejects.toThrow();
      mocks.userFindUnique.mockResolvedValueOnce({ ssoSubject: null });
      await expect(connect({ cookie: "token=session-cookie", origin: origin(), path: NOTIFICATIONS })).rejects.toThrow();
    });

    it("closes a socket whose session expired before the event, without sending it", async () => {
      const user = await connect({ cookie: "token=session-cookie", origin: origin(), path: NOTIFICATIONS });
      const messages: string[] = [];
      user.on("message", (data) => messages.push(data.toString()));
      const closed = new Promise<number>((resolve) => user.once("close", (code) => resolve(code)));
      mocks.getSession.mockResolvedValue(undefined);

      await publishUserNotification(["cloud-user"]);

      expect(await closed).toBe(1008);
      expect(messages).toEqual([]);
    });
  });
});
