import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ssoMode: true,
  feedbackConfig: { issuerUrl: "https://account.example.com", clientId: "feedback-machine", clientSecret: "feedback-secret" },
  scope: { mode: "team", teamId: "team-1" } as { mode: string; teamId: string | null },
  userFindUnique: vi.fn(),
  teamFindUnique: vi.fn(),
  machineToken: vi.fn(),
  saasFetch: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  isSsoAuthMode: () => mocks.ssoMode,
  getCloudFeedbackConfig: () => mocks.feedbackConfig,
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique }, team: { findUnique: mocks.teamFindUnique } },
}));
vi.mock("../../lib/team-scope.js", () => ({ currentTeamScope: () => mocks.scope }));
vi.mock("../../lib/cloud-ai.js", () => ({ getCloudMachineToken: mocks.machineToken, fetchWithTimeout: mocks.saasFetch }));
vi.mock("../../lib/middleware.js", () => ({ authenticate: mocks.authenticate }));

import { feedbackPagePath, submitFeedback } from "./controller.js";
import router from "./index.js";

function call(body: Record<string, unknown>) {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const req = { body, user: { id: "local-user" } } as unknown as Request;
  return submitFeedback(req, res as unknown as Response).then(() => res);
}

function sentPayload() {
  const [url, init] = mocks.saasFetch.mock.calls[0];
  return { url, headers: init.headers, body: JSON.parse(init.body) };
}

describe("Cloud feedback relay (CLD-013.2)", () => {
  beforeEach(() => {
    mocks.ssoMode = true;
    mocks.scope = { mode: "team", teamId: "team-1" };
    mocks.feedbackConfig = { issuerUrl: "https://account.example.com", clientId: "feedback-machine", clientSecret: "feedback-secret" };
    mocks.userFindUnique.mockReset().mockResolvedValue({ ssoSubject: "saas-user-uuid" });
    mocks.teamFindUnique.mockReset().mockResolvedValue({ ssoOrganizationId: "saas-team-uuid" });
    mocks.machineToken.mockReset().mockResolvedValue("machine-token");
    mocks.saasFetch.mockReset().mockResolvedValue({ status: 201 });
  });

  it("sends the SSO user and the server-verified Team, never ids from the browser", async () => {
    const res = await call({
      content: " Please add dark mode ",
      category: "suggestion",
      page_path: "/project/abc?token=secret#top",
      user_id: "spoofed-user",
      organization_id: "spoofed-team",
      email: "typed@example.com",
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { id: "local-user" }, select: { ssoSubject: true } });
    expect(mocks.teamFindUnique).toHaveBeenCalledWith({ where: { id: "team-1" }, select: { ssoOrganizationId: true } });
    expect(mocks.machineToken).toHaveBeenCalledWith(mocks.feedbackConfig, "cloud:feedback");
    const { url, headers, body } = sentPayload();
    expect(url).toBe("https://account.example.com/api/v1/cloud/feedback");
    expect(headers.Authorization).toBe("Bearer machine-token");
    expect(body).toEqual({
      user_id: "saas-user-uuid",
      organization_id: "saas-team-uuid",
      kind: "general",
      category: "suggestion",
      message: "Please add dark mode",
      page_path: "/project/abc",
    });
  });

  it("sends no Team from the Personal Workspace", async () => {
    mocks.scope = { mode: "personal", teamId: null };

    await call({ content: "Hello", category: "bug", page_path: "relative/path" });

    expect(mocks.teamFindUnique).not.toHaveBeenCalled();
    expect(sentPayload().body).toMatchObject({ organization_id: null, category: "bug", page_path: null });
  });

  it.each([
    [422, 502],
    [500, 502],
    [429, 429],
  ])("answers SaaS HTTP %i with %i so the dialog keeps the message", async (saasStatus, status) => {
    mocks.saasFetch.mockResolvedValue({ status: saasStatus });

    const res = await call({ content: "Hello", category: "other" });

    expect(res.status).toHaveBeenCalledWith(status);
  });

  it("fails without leaking details when SaaS is unreachable", async () => {
    mocks.machineToken.mockRejectedValue(new Error("machine token request failed with HTTP 401"));

    const res = await call({ content: "Hello", category: "other" });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal Server Error" });
  });

  it("refuses before calling SaaS when the feedback client is missing or the message is too long", async () => {
    mocks.feedbackConfig = { ...mocks.feedbackConfig, clientSecret: "" };
    expect((await call({ content: "Hello" })).status).toHaveBeenCalledWith(503);

    mocks.feedbackConfig = { ...mocks.feedbackConfig, clientSecret: "feedback-secret" };
    expect((await call({ content: "x".repeat(2001) })).status).toHaveBeenCalledWith(400);
    expect(mocks.saasFetch).not.toHaveBeenCalled();
  });

  it("refuses a session without an SSO identity", async () => {
    mocks.userFindUnique.mockResolvedValue({ ssoSubject: null });

    expect((await call({ content: "Hello" })).status).toHaveBeenCalledWith(403);
    expect(mocks.saasFetch).not.toHaveBeenCalled();
  });

  it("requires a session only in Cloud", () => {
    const guard = (router as any).stack[0].route.stack[0].handle;
    const next = vi.fn();

    guard({}, {}, next);
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();

    mocks.ssoMode = false;
    guard({}, {}, next);
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("Self-host feedback relay", () => {
  const telegram = vi.fn();

  beforeEach(() => {
    mocks.ssoMode = false;
    mocks.saasFetch.mockReset();
    telegram.mockReset().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", telegram);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "chat-id");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps the Telegram relay and never calls SaaS", async () => {
    const res = await call({ content: "Hello", category: "bug", email: "typed@example.com" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(telegram.mock.calls[0][0]).toBe("https://api.telegram.org/botbot-token/sendMessage");
    expect(JSON.parse(telegram.mock.calls[0][1].body).text).toContain("Email: typed@example.com");
    expect(mocks.saasFetch).not.toHaveBeenCalled();
  });
});

describe("feedbackPagePath", () => {
  it("keeps a path and drops the query and hash", () => {
    expect(feedbackPagePath("/notes/1?x=1#h")).toBe("/notes/1");
    expect(feedbackPagePath("/")).toBe("/");
  });

  it.each([undefined, 42, "", "notes/1", "https://cloud.example.com/notes", "/a b", `/${"a".repeat(255)}`])(
    "rejects %s",
    (value) => expect(feedbackPagePath(value)).toBeUndefined(),
  );
});
