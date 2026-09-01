import type { AIAction } from './types';

export const grillMeAction: AIAction = {
  id: 'grill-me',
  label: 'Plan',
  description: 'Create a plan first; ask only blocking questions',
  icon: 'Interview',
  persistent: true,
  requiresEntityContext: false,
  buildPrompt: (context) => {
    const hasAnswer = context.planPhase === 'follow-up';
    return `You are in Plan mode. ${hasAnswer
      ? 'The user has answered the previous question. Treat every selected option or custom answer as input to evaluate, not an automatically correct decision. If it is ambiguous, too broad, internally inconsistent, or misaligned with the stated goal, ask exactly one clarifying follow-up that directly resolves that issue before moving on. Before writing a plan, collect answers for at least three distinct decision areas: release scope, the critical actors or business workflow, and the technical direction (preferred stack, platform, data, integrations, or deployment constraints). Also resolve every domain-specific decision that would materially change scope, user roles, business rules, data model, integrations, security, or architecture. Read the visible conversation, ask exactly one next question for the highest-impact missing or unresolved area, and never repeat information already answered. Do not write a final plan while it would contain a material unresolved question. Only after these areas are covered may you decide whether to ask one further blocking question or write the concise structured plan.'
      : 'For the user\'s first request, ask exactly one highest-impact question before writing the plan. Do not write a long plan yet.'}

Do not present a batch checklist: every response may contain at most one question. If you ask a question, write one short explanatory sentence and append exactly this machine-readable block after it:

\`\`\`plan-question
{"id":"scope","question":"Which scope should the first release cover?","type":"single","options":["Option A","Option B"],"recommendedOption":"Option A","allowCustom":true}
\`\`\`

Use only type "single" or "multiple", two to seven concise options, exactly one question, and a required recommendedOption that exactly matches one listed option. Always set allowCustom to true. If you write the final plan, do not append a plan-question block and do not include a "Open questions" or "Pertanyaan terbuka" section for material decisions; ask those interactively first. Structure the final PRD with: Goal and success outcome, validated decisions, MVP scope (in and out), user roles and main flows, business rules, technical architecture and data/integrations, delivery phases, risks/trade-offs, and explicitly labeled non-blocking assumptions or deferred decisions. Never invent a user decision: state recommendations and assumptions as such. Continue in the user's language.`;
  },
};
