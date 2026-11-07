import { Router, type Request, type Response } from "express";
import { normalizeTrialSurveyAnswers, TRIAL_SURVEY_VERSION } from "../../../shared/trial-survey.js";
import { parseStoredCloudEntitlement, type CloudTrial } from "../../lib/cloud-entitlement.js";
import { isSsoAuthMode } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { authenticate } from "../../lib/middleware.js";
import { prisma } from "../../lib/prisma.js";
import { currentTeamScope } from "../../lib/team-scope.js";
import { relayCloudFeedback } from "../feedback/controller.js";

/**
 * Trial survey panel (CLD-013.3) for every member of the active Cloud Team. The Team comes from the server-checked
 * `X-Team-Id` and the Trial from its stored SaaS entitlement; the per-user state only decides what is shown.
 */
const router = Router();
const notFound = (res: Response) => res.status(404).json({ error: "Resource not found" });

const DAY_MS = 86_400_000;
// shortcut: WIB is fixed UTC+7 (Indonesia has no daylight saving); use a timezone library if another zone is needed.
const WIB_OFFSET_MS = 7 * 3_600_000;

/** 00:00 WIB of the calendar day `days` after the WIB day that contains `at`. */
function wibDayStart(at: Date, days: number): Date {
  return new Date((Math.floor((at.getTime() + WIB_OFFSET_MS) / DAY_MS) + days) * DAY_MS - WIB_OFFSET_MS);
}

/** "Later" and close hide the panel until the next 00:00 WIB. */
export const nextWibMidnight = (now: Date): Date => wibDayStart(now, 1);

/** Day 1 is the WIB date of `starts_at`, so day 10 begins at 00:00 WIB nine days later. */
export const trialSurveyOpensAt = (trial: CloudTrial): Date => wibDayStart(new Date(trial.starts_at), 9);

type SurveyState = { hiddenUntil: Date | null; submittedAt: Date | null } | null;

export function shouldShowTrialSurvey(trial: CloudTrial | null, state: SurveyState, now: Date): boolean {
  if (!trial || state?.submittedAt) return false;
  if (trial.ends_at && now >= new Date(trial.ends_at)) return false;
  if (now < trialSurveyOpensAt(trial)) return false;
  return !state?.hiddenUntil || now >= state.hiddenUntil;
}

async function activeTrial(req: Request) {
  const scope = currentTeamScope();
  if (!prisma || scope?.mode !== "team" || !scope.teamId) return null;
  const team = await prisma.team.findUnique({ where: { id: scope.teamId }, select: { status: true, ssoOrganizationId: true, cloudEntitlement: true } });
  const trial = team?.status === "active" ? parseStoredCloudEntitlement(team.cloudEntitlement)?.trial : null;
  if (!team?.ssoOrganizationId || !trial) return null;
  const key = { userId: (req as any).user.id as string, teamId: scope.teamId, surveyKey: trial.survey_key };
  const state = await prisma.userTrialSurvey.findUnique({ where: { userId_teamId_surveyKey: key }, select: { hiddenUntil: true, submittedAt: true } });
  return { key, trial, state, organizationId: team.ssoOrganizationId };
}

function saveState(key: { userId: string; teamId: string; surveyKey: string }, data: { hiddenUntil?: Date; submittedAt?: Date }) {
  return prisma!.userTrialSurvey.upsert({ where: { userId_teamId_surveyKey: key }, create: { ...key, ...data }, update: data });
}

function cloudOnly(req: Request, res: Response, next: () => void): void {
  if (!isSsoAuthMode()) {
    notFound(res);
    return;
  }
  void authenticate(req, res, next);
}

router.get("/cloud/trial-survey", cloudOnly, async (req: Request, res: Response) => {
  try {
    const context = await activeTrial(req);
    res.setHeader("Cache-Control", "private, no-store");
    res.json(context && shouldShowTrialSurvey(context.trial, context.state, new Date())
      ? { show: true, survey_key: context.trial.survey_key }
      : { show: false });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "[Trial survey] state lookup failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/cloud/trial-survey/dismiss", cloudOnly, async (req: Request, res: Response) => {
  try {
    const context = await activeTrial(req);
    if (!context) return notFound(res);
    const hiddenUntil = nextWibMidnight(new Date());
    await saveState(context.key, { hiddenUntil });
    res.json({ hidden_until: hiddenUntil.toISOString() });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "[Trial survey] dismiss failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/cloud/trial-survey", cloudOnly, async (req: Request, res: Response) => {
  try {
    const context = await activeTrial(req);
    const now = new Date();
    if (!context) return notFound(res);
    if (context.state?.submittedAt) return res.json({ status: "ok" });
    // Outside day 10 to the end of the Trial there is no survey to answer; a "later" does not block an answer.
    if (!shouldShowTrialSurvey(context.trial, null, now)) return notFound(res);
    const answers = normalizeTrialSurveyAnswers(req.body?.answers);
    if (!answers) return res.status(400).json({ error: "Answer every required question" });

    const stored = await relayCloudFeedback(req, res, {
      organization_id: context.organizationId,
      kind: "trial_survey",
      survey_key: context.trial.survey_key,
      survey_version: TRIAL_SURVEY_VERSION,
      answers,
    });
    if (!stored) return;
    // SaaS keeps one answer per user, Team and survey, so a retry after a failed write here is safe.
    await saveState(context.key, { submittedAt: now });
    res.json({ status: "ok" });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "[Trial survey] submit failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
