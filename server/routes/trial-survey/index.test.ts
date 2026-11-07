import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ssoMode: true,
  scope: { mode: "team", teamId: "team-1" } as { mode: string; teamId: string | null },
  teamFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  surveyFindUnique: vi.fn(),
  surveyUpsert: vi.fn(),
  saasFetch: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  isSsoAuthMode: () => mocks.ssoMode,
  getCloudFeedbackConfig: () => ({ issuerUrl: "https://account.example.com", clientId: "feedback-machine", clientSecret: "feedback-secret" }),
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    team: { findUnique: mocks.teamFindUnique },
    user: { findUnique: mocks.userFindUnique },
    userTrialSurvey: { findUnique: mocks.surveyFindUnique, upsert: mocks.surveyUpsert },
  },
}));
vi.mock("../../lib/team-scope.js", () => ({ currentTeamScope: () => mocks.scope }));
vi.mock("../../lib/middleware.js", () => ({ authenticate: mocks.authenticate }));
vi.mock("../../lib/cloud-ai.js", () => ({ getCloudMachineToken: async () => "machine-token", fetchWithTimeout: mocks.saasFetch }));

import router, { nextWibMidnight, shouldShowTrialSurvey, trialSurveyOpensAt } from "./index.js";

// Starts 6 Nov 12:24 WIB, so day 10 begins 15 Nov 00:00 WIB (14 Nov 17:00 UTC).
const trial = { survey_key: "beta_trial" as const, starts_at: "2026-11-06T05:24:55Z", ends_at: "2026-11-20T05:24:55Z" };
const DAY_10 = new Date("2026-11-14T17:00:00Z");
const answers = { disappointment: "very_disappointed", primary_use: "team_collaboration", main_blocker: "none" };

describe("Trial survey schedule", () => {
  it("opens at 00:00 WIB on day 10 counted from the WIB date of starts_at", () => {
    expect(trialSurveyOpensAt(trial).toISOString()).toBe("2026-11-14T17:00:00.000Z");
    // 01:00 WIB on 6 Nov is still 5 Nov in UTC; day 1 is the WIB date.
    expect(trialSurveyOpensAt({ ...trial, starts_at: "2026-11-05T18:00:00Z" }).toISOString()).toBe("2026-11-14T17:00:00.000Z");
  });

  it("is hidden before day 10 and shown from day 10", () => {
    expect(shouldShowTrialSurvey(trial, null, new Date(DAY_10.getTime() - 1))).toBe(false);
    expect(shouldShowTrialSurvey(trial, null, DAY_10)).toBe(true);
  });

  it("hides after later or close until the next 00:00 WIB, then returns", () => {
    const closedAt = new Date("2026-11-15T10:00:00Z"); // 17:00 WIB
    const hiddenUntil = nextWibMidnight(closedAt);
    expect(hiddenUntil.toISOString()).toBe("2026-11-15T17:00:00.000Z");
    expect(nextWibMidnight(new Date("2026-11-15T17:30:00Z")).toISOString()).toBe("2026-11-16T17:00:00.000Z");
    const state = { hiddenUntil, submittedAt: null };
    expect(shouldShowTrialSurvey(trial, state, new Date("2026-11-15T16:59:59Z"))).toBe(false);
    expect(shouldShowTrialSurvey(trial, state, hiddenUntil)).toBe(true);
  });

  it("stops after an answer or when the Trial ends", () => {
    const later = new Date("2026-11-18T00:00:00Z");
    expect(shouldShowTrialSurvey(trial, { hiddenUntil: null, submittedAt: DAY_10 }, later)).toBe(false);
    expect(shouldShowTrialSurvey(trial, null, new Date(trial.ends_at))).toBe(false);
    expect(shouldShowTrialSurvey({ ...trial, ends_at: null }, null, new Date("2027-01-01T00:00:00Z"))).toBe(true);
    expect(shouldShowTrialSurvey(null, null, later)).toBe(false);
  });
});

function handler(method: "get" | "post", path: string) {
  const layer = (router as any).stack.find((item: any) => item.route?.path === path && item.route.methods[method]);
  return layer.route.stack.at(-1).handle as (req: Request, res: Response) => Promise<void>;
}

async function call(method: "get" | "post", path: string, body: unknown = {}) {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler(method, path)({ body, user: { id: "local-user" } } as unknown as Request, res as unknown as Response);
  return res;
}

const storedTeam = (overrides: Record<string, unknown> = {}) => ({
  status: "active",
  ssoOrganizationId: "saas-team-uuid",
  cloudEntitlement: JSON.stringify({ product_type: "cloud", revision: "a".repeat(64), capabilities: {}, limits: { max_members: 5 }, trial }),
  ...overrides,
});

describe("Trial survey routes (CLD-013.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    mocks.ssoMode = true;
    mocks.scope = { mode: "team", teamId: "team-1" };
    mocks.teamFindUnique.mockReset().mockResolvedValue(storedTeam());
    mocks.userFindUnique.mockReset().mockResolvedValue({ ssoSubject: "saas-user-uuid" });
    mocks.surveyFindUnique.mockReset().mockResolvedValue(null);
    mocks.surveyUpsert.mockReset().mockResolvedValue({});
    mocks.saasFetch.mockReset().mockResolvedValue({ status: 201 });
    mocks.authenticate.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("shows the survey of the active Team's Trial on day 10", async () => {
    const res = await call("get", "/cloud/trial-survey");

    expect(res.json).toHaveBeenCalledWith({ show: true, survey_key: "beta_trial" });
    expect(mocks.surveyFindUnique).toHaveBeenCalledWith({
      where: { userId_teamId_surveyKey: { userId: "local-user", teamId: "team-1", surveyKey: "beta_trial" } },
      select: { hiddenUntil: true, submittedAt: true },
    });
  });

  it.each([
    ["Personal Workspace", () => { mocks.scope = { mode: "personal", teamId: null }; }],
    ["locked Team", () => { mocks.teamFindUnique.mockResolvedValue(storedTeam({ status: "locked" })); }],
    ["Team without a Trial", () => { mocks.teamFindUnique.mockResolvedValue(storedTeam({ cloudEntitlement: JSON.stringify({ revision: "a".repeat(64), capabilities: {}, limits: { max_members: 5 } }) })); }],
    ["submitted survey", () => { mocks.surveyFindUnique.mockResolvedValue({ hiddenUntil: null, submittedAt: DAY_10 }); }],
  ])("shows nothing for a %s", async (_case, arrange) => {
    arrange();

    expect((await call("get", "/cloud/trial-survey")).json).toHaveBeenCalledWith({ show: false });
  });

  it("stores later until the next 00:00 WIB in the user's server-side state", async () => {
    const res = await call("post", "/cloud/trial-survey/dismiss");

    const key = { userId: "local-user", teamId: "team-1", surveyKey: "beta_trial" };
    const hiddenUntil = new Date("2026-11-15T17:00:00Z");
    expect(mocks.surveyUpsert).toHaveBeenCalledWith({ where: { userId_teamId_surveyKey: key }, create: { ...key, hiddenUntil }, update: { hiddenUntil } });
    expect(res.json).toHaveBeenCalledWith({ hidden_until: "2026-11-15T17:00:00.000Z" });
  });

  it("sends the answers as trial_survey v1 and records the submission", async () => {
    const res = await call("post", "/cloud/trial-survey", { answers: { ...answers, open_answer: "  More templates  ", extra: "x" }, organization_id: "spoofed" });

    expect(JSON.parse(mocks.saasFetch.mock.calls[0][1].body)).toEqual({
      user_id: "saas-user-uuid",
      organization_id: "saas-team-uuid",
      kind: "trial_survey",
      survey_key: "beta_trial",
      survey_version: 1,
      answers: { ...answers, open_answer: "More templates" },
    });
    expect(mocks.surveyUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: { submittedAt: new Date("2026-11-15T10:00:00Z") } }));
    expect(res.json).toHaveBeenCalledWith({ status: "ok" });
  });

  it("treats the SaaS answer to a repeat (200) as stored", async () => {
    mocks.saasFetch.mockResolvedValue({ status: 200 });

    expect((await call("post", "/cloud/trial-survey", { answers })).json).toHaveBeenCalledWith({ status: "ok" });
    expect(mocks.surveyUpsert).toHaveBeenCalledOnce();
  });

  it("keeps the survey open when SaaS refuses it", async () => {
    mocks.saasFetch.mockResolvedValue({ status: 422 });

    expect((await call("post", "/cloud/trial-survey", { answers })).status).toHaveBeenCalledWith(502);
    expect(mocks.surveyUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing answer", { answers: { disappointment: "very_disappointed", primary_use: "other" } }, 400],
    ["a value outside v1", { answers: { ...answers, main_blocker: "price" } }, 400],
    ["an open answer over 1,000 characters", { answers: { ...answers, open_answer: "x".repeat(1001) } }, 400],
  ])("refuses %s before calling SaaS", async (_case, body, status) => {
    expect((await call("post", "/cloud/trial-survey", body)).status).toHaveBeenCalledWith(status);
    expect(mocks.saasFetch).not.toHaveBeenCalled();
  });

  it("has no survey to answer before day 10 or after the Trial", async () => {
    vi.setSystemTime(new Date(DAY_10.getTime() - 1));
    expect((await call("post", "/cloud/trial-survey", { answers })).status).toHaveBeenCalledWith(404);
    vi.setSystemTime(new Date(trial.ends_at));
    expect((await call("post", "/cloud/trial-survey", { answers })).status).toHaveBeenCalledWith(404);
    expect(mocks.saasFetch).not.toHaveBeenCalled();
  });

  it("does not send an answered survey again", async () => {
    mocks.surveyFindUnique.mockResolvedValue({ hiddenUntil: null, submittedAt: DAY_10 });

    expect((await call("post", "/cloud/trial-survey", { answers })).json).toHaveBeenCalledWith({ status: "ok" });
    expect(mocks.saasFetch).not.toHaveBeenCalled();
  });

  it("exists only in Cloud and requires a session there", () => {
    const guard = (router as any).stack[0].route.stack[0].handle;
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();

    guard({}, res, next);
    expect(mocks.authenticate).toHaveBeenCalledOnce();

    mocks.ssoMode = false;
    guard({}, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});
