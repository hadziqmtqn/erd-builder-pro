import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "./prisma.js";
import { currentTeamScope, fileIdentifierWhere, runWithTeamScope } from "./team-scope.js";
import { canAccessTeam } from "../routes/teams/service.js";

export type LiveFileModel = "note" | "diagram" | "drawing" | "flowchart";

const changes = new EventEmitter().setMaxListeners(0);
const HEARTBEAT_MS = 25_000;
// The client reconnects through `authenticate`, so a revoked session stops receiving signals within this window.
const MAX_STREAM_MS = 5 * 60_000;

/** Signals that a file's content was saved. Only the identifier travels; viewers refetch through the normal GET. */
export function publishFileChange(model: LiveFileModel, identifier: string): void {
  changes.emit(model, String(identifier));
}

/** Route middleware for content writes: publishes once the response succeeded. */
export function notifyFileChange(model: LiveFileModel) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => { if (res.statusCode < 300) publishFileChange(model, req.params.uid); });
    next();
  };
}

/**
 * Server-sent events for one file (BUG-023). Access is checked like GET /:uid when the stream opens and again
 * before every signal, so a member who loses the Team or the file gets no further events.
 */
export function fileChangeStream(model: LiveFileModel) {
  return async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user as { id: string; isSuperAdmin?: boolean };
    const scope = currentTeamScope();
    const readable = async () => {
      if (scope?.mode === "team" && (!scope.teamId || !(await canAccessTeam(scope.teamId, user.id, Boolean(user.isSuperAdmin))))) return null;
      return (prisma as any)?.[model].findFirst({ where: fileIdentifierWhere(req.params.uid, user.id), select: { id: true, uid: true } });
    };
    const inScope = <T>(callback: () => Promise<T>) => scope ? runWithTeamScope(scope, callback) : callback();
    const file = await readable().catch(() => null);
    if (!file) { res.status(404).json({ error: "Resource not found" }); return; }

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(": ready\n\n");
    const keys = new Set([String(file.uid), String(file.id)]);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat); clearTimeout(expiry);
      changes.off(model, onChange);
      res.end();
    };
    const onChange = (identifier: string) => {
      if (!keys.has(identifier)) return;
      void inScope(readable).then(current => {
        if (closed) return;
        if (!current) close();
        else res.write("event: change\ndata: {}\n\n");
      }, close);
    };
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    const expiry = setTimeout(close, MAX_STREAM_MS);
    changes.on(model, onChange);
    req.on("close", close);
  };
}
