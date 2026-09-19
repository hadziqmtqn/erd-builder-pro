import type { Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";

import { isSsoAuthMode } from "./config.js";
import { getSession } from "./desktop-auth.js";
import { isUuid } from "./erd-column-id-migration.js";
import { prisma } from "./prisma.js";
import { canAccessTeam } from "../routes/teams/service.js";

export type CloudWorkspaceSyncEvent = {
  teamId: string;
  eventType: "cloud.workspace.sync";
  revision: string;
};

type CloudSession = { token: string; userId: string; teamId: string };
type Publisher = (event: CloudWorkspaceSyncEvent) => Promise<void>;

const publishers = new Set<Publisher>();

function sessionToken(cookieHeader: string | string[] | undefined = ""): string | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join(";") : cookieHeader || "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== "token") continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()) || null; }
    catch { return null; }
  }
  return null;
}

function isSameOrigin(request: import("node:http").IncomingMessage): boolean {
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (!host || !origin) return false;
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const forwardedProtocolHeader = request.headers["x-forwarded-proto"];
    const forwardedProtocol = (typeof forwardedProtocolHeader === "string" ? forwardedProtocolHeader : forwardedProtocolHeader?.[0])?.split(",")[0]?.trim();
    const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : process.env.NODE_ENV === "production" ? "https:" : "http:";
    if (url.protocol !== expectedProtocol) return false;
    if (url.host.toLowerCase() === host.toLowerCase()) return true;
    const requestHostname = new URL(`http://${host}`).hostname;
    const isLoopback = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";
    return process.env.NODE_ENV !== "production" && isLoopback(url.hostname) && isLoopback(requestHostname);
  } catch {
    return false;
  }
}

async function authorize(request: import("node:http").IncomingMessage): Promise<CloudSession | null> {
  if (!isSsoAuthMode() || !isSameOrigin(request)) return null;

  const token = sessionToken(request.headers.cookie);
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const teamId = url.searchParams.get("team_id") || "";
  if (!token || !isUuid(teamId)) return null;

  const session = await getSession(token);
  if (!session || !prisma) return null;
  const [user, team] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { ssoSubject: true } }),
    prisma.team.findFirst({ where: { id: teamId, type: "team", status: "active", ssoOrganizationId: { not: null } }, select: { id: true } }),
  ]);
  if (!user?.ssoSubject || !team || !(await canAccessTeam(teamId, session.userId, false))) return null;
  return { token, userId: session.userId, teamId };
}

export function attachCloudLiveSync(server: Server): () => void {
  if (!isSsoAuthMode()) return () => {};

  const sockets = new Map<WebSocket, CloudSession>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, clientTracking: false });
  const reject = (socket: import("node:net").Socket) => {
    if (socket.destroyed) return;
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
  };

  const onUpgrade = (request: import("node:http").IncomingMessage, socket: import("node:net").Socket, head: Buffer) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname !== "/api/cloud/live-sync") return;

    void authorize(request).then((session) => {
      if (!session || socket.destroyed) return reject(socket);
      wss.handleUpgrade(request, socket, head, (client) => {
        sockets.set(client, session);
        client.on("message", () => client.close(1008, "Read-only notification channel"));
        client.on("close", () => sockets.delete(client));
      });
    }).catch(() => reject(socket));
  };

  const publish: Publisher = async (event) => {
    await Promise.all([...sockets].map(async ([client, session]) => {
      if (session.teamId !== event.teamId || client.readyState !== WebSocket.OPEN) return;
      try {
        const current = await getSession(session.token);
        if (!current || current.userId !== session.userId) {
          client.close(1008, "Session expired");
          return;
        }
        // This socket was authorized while membership was active. A revoke webhook
        // must still deliver one metadata-only invalidation so the client refetches
        // and its normal Team APIs deny access, then the connection is closed.
        client.send(JSON.stringify(event));
        client.close(1000, "Workspace updated");
      } catch {
        client.close(1011, "Workspace refresh required");
      }
    }));
  };

  publishers.add(publish);
  server.on("upgrade", onUpgrade);
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    server.off("upgrade", onUpgrade);
    server.off("close", cleanup);
    publishers.delete(publish);
    for (const client of sockets.keys()) client.close(1001, "Server shutting down");
    wss.close();
  };
  server.once("close", cleanup);
  return cleanup;
}

export async function publishCloudWorkspaceSync(event: CloudWorkspaceSyncEvent): Promise<void> {
  await Promise.all([...publishers].map((publish) => publish(event).catch(() => {})));
}
