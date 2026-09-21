import { createServer } from "node:http";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSsoAuthMode: vi.fn(() => true),
  getSession: vi.fn(),
  canAccessTeam: vi.fn(),
  userFindUnique: vi.fn(),
  teamFindFirst: vi.fn(),
}));

vi.mock("./config.js", () => ({ isSsoAuthMode: mocks.isSsoAuthMode }));
vi.mock("./desktop-auth.js", () => ({ getSession: mocks.getSession }));
vi.mock("./prisma.js", () => ({ prisma: {
  user: { findUnique: mocks.userFindUnique },
  team: { findFirst: mocks.teamFindFirst },
} }));
vi.mock("../routes/teams/service.js", () => ({ canAccessTeam: mocks.canAccessTeam }));

const { attachCloudLiveSync, publishCloudWorkspaceSync } = await import("./cloud-live-sync.js");
const TEAM_ID = "9d7fdad2-d555-4aab-a917-39fb5bac9160";

describe("Cloud live sync WebSocket", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  let detach: () => void;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    mocks.isSsoAuthMode.mockReturnValue(true);
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

  function connect(options: { cookie?: string; origin?: string; forwardedProtocol?: string } = {}): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const client = new WebSocket(`${baseUrl}/api/cloud/live-sync?team_id=${TEAM_ID}`, {
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

  it("does not attach a Cloud socket in non-SSO mode", () => {
    mocks.isSsoAuthMode.mockReturnValue(false);
    const selfHostServer = createServer();

    const cleanup = attachCloudLiveSync(selfHostServer);

    expect(selfHostServer.listenerCount("upgrade")).toBe(0);
    cleanup();
    expect(selfHostServer.listenerCount("upgrade")).toBe(0);
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
});
