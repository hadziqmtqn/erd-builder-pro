import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ noteFindFirst: vi.fn(), canAccessTeam: vi.fn() }));

vi.mock("./prisma.js", () => ({ prisma: { note: { findFirst: mocks.noteFindFirst } } }));
vi.mock("./config.js", () => ({ isLocalPostgres: () => true }));
vi.mock("../routes/teams/service.js", () => ({ canAccessTeam: mocks.canAccessTeam }));

const { fileChangeStream, notifyFileChange, publishFileCollaboration, publishProjectAccessChange } = await import("./file-live-sync.js");
const { runWithTeamScope } = await import("./team-scope.js");
const NOTE = { id: 7, uid: "note-uid", projectId: 3, version: 4 };

describe("file change stream", () => {
  let server: Server;
  let base: string;
  let controller: AbortController;

  beforeEach(async () => {
    mocks.noteFindFirst.mockReset().mockResolvedValue(NOTE);
    mocks.canAccessTeam.mockReset().mockResolvedValue(true);
    controller = new AbortController();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: req.get("x-user") ?? "viewer" };
      runWithTeamScope({ mode: "team", teamId: "team-1" }, next);
    });
    app.get("/notes/:uid/events", fileChangeStream("note"));
    app.put("/notes/:uid", notifyFileChange("note"), (req, res) => { res.status(req.query.fail ? 409 : 200).end(); });
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    controller.abort();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });

  async function open(uid = NOTE.uid) {
    const response = await fetch(`${base}/notes/${uid}/events`, { signal: controller.signal });
    if (!response.ok || !response.body) return { response, next: async () => "" };
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    return { response, next: async () => (await reader.read()).value ?? "" };
  }

  it("signals a successful save by uid or numeric id, never a failed one", async () => {
    const { response, next } = await open();
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await next()).toBe('event: ready\ndata: {"version":4}\n\n');
    await fetch(`${base}/notes/${NOTE.uid}?fail=1`, { method: "PUT" });
    await fetch(`${base}/notes/7`, { method: "PUT", headers: { "x-user": "editor" } });
    expect(await next()).toBe("event: change\ndata: {}\n\n");
    expect(mocks.noteFindFirst).toHaveBeenCalledTimes(2);
  });

  it("signals someone else's comment or discussion change on this file with its Team (BUG-079)", async () => {
    const { next } = await open();
    await next();
    publishFileCollaboration("note", NOTE.uid, "viewer", "team-1");
    publishFileCollaboration("diagram", NOTE.uid, "editor", "team-1");
    publishFileCollaboration("note", "other-note", "editor", "team-1");
    publishFileCollaboration("note", "7", "editor", "team-1");
    expect(await next()).toBe('event: collaboration\ndata: {"teamId":"team-1"}\n\n');
    expect(mocks.noteFindFirst).toHaveBeenCalledTimes(2);
  });

  it("does not signal the user's own save", async () => {
    const { next } = await open();
    await next();
    await fetch(`${base}/notes/${NOTE.uid}`, { method: "PUT" });
    await fetch(`${base}/notes/${NOTE.uid}`, { method: "PUT", headers: { "x-user": "editor" } });
    expect(await next()).toBe("event: change\ndata: {}\n\n");
    expect(mocks.noteFindFirst).toHaveBeenCalledTimes(2);
  });

  it("does not signal a move to another Project as a save (BUG-096)", async () => {
    const { next } = await open();
    await next();
    const put = (body: unknown) => fetch(`${base}/notes/${NOTE.uid}`, {
      method: "PUT", headers: { "x-user": "editor", "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    await put({ project_id: 5 });
    await put({ title: "Plan", content: "<p>edited</p>", project_id: 5 });
    expect(await next()).toBe("event: change\ndata: {}\n\n");
    // One read when the stream opened and one for the content save; the move sent nothing.
    expect(mocks.noteFindFirst).toHaveBeenCalledTimes(2);
  });

  it("returns a generic not-found for a file the user cannot read", async () => {
    mocks.noteFindFirst.mockResolvedValue(null);
    const { response } = await open("someone-else");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Resource not found" });
  });

  it("closes the stream instead of signalling once Team access is revoked", async () => {
    const { next } = await open();
    await next();
    mocks.canAccessTeam.mockResolvedValue(false);
    await fetch(`${base}/notes/${NOTE.uid}`, { method: "PUT", headers: { "x-user": "editor" } });
    expect(await next()).toBe("");
  });

  it("tells only the member whose role changed on the file's Project (BUG-061)", async () => {
    const { next } = await open();
    await next();
    publishProjectAccessChange(3, "someone-else");
    publishProjectAccessChange(4, "viewer");
    publishProjectAccessChange(3, "viewer");
    expect(await next()).toBe("event: access\ndata: {}\n\n");
    expect(mocks.noteFindFirst).toHaveBeenCalledTimes(2);
  });

  it("closes the stream after the access signal when the file is no longer readable", async () => {
    const { next } = await open();
    await next();
    mocks.noteFindFirst.mockResolvedValue(null);
    publishProjectAccessChange(3, "viewer");
    expect(await next()).toBe("event: access\ndata: {}\n\n");
    expect(await next()).toBe("");
  });
});
