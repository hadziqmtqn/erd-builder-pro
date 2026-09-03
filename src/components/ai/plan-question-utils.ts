import type { AIChatMessage } from '@/types';

export type PlanQuestionType = 'single' | 'multiple';

export interface PlanQuestion {
  id: string;
  question: string;
  type: PlanQuestionType;
  options: string[];
  recommendedOption: string;
  recommendedOptions: string[];
  allowCustom: boolean;
}

export interface PlanQuestionPayload {
  content: string;
  question: PlanQuestion;
}

export type PlanFeedbackAction = 'skip' | 'not-relevant' | 'undecided' | 'recommend' | 'correct-context' | 'finish-with-assumptions';

export interface PlanAnswerData {
  kind: 'answer';
  question: string;
  selected: string[];
  customAnswer: string;
  summary: string;
}

export interface PlanFeedbackData {
  kind: 'feedback';
  question: string;
  action: PlanFeedbackAction;
  correction: string;
}

export type PlanResponseData = PlanAnswerData | PlanFeedbackData;

export interface PlanQuestionEntry {
  key: string;
  question: PlanQuestion;
  response: PlanResponseData | null;
  responseMessage: AIChatMessage | null;
}

export const PLAN_ANSWER_PREFIX = '[Plan answer]';
export const PLAN_FEEDBACK_PREFIX = '[Plan feedback]';
// Some providers shorten the requested fence to `plan`; accept that transport
// alias but retain the same strict payload validation below.
const QUESTION_BLOCK = /```(?:plan-question|plan)\s*\n([\s\S]*?)```/i;

function unwrapOuterCodeFence(content: string) {
  const trimmed = content.trim();
  const match = trimmed.match(/^(`{3,})[^\r\n]*\r?\n([\s\S]*?)\r?\n\1\s*$/);
  return match ? match[2].trim() : trimmed;
}

export function normalizePlanMarkdown(content: string) {
  const trimmed = content.trim();
  const wrapped = trimmed.match(/^(`{3,})(?:markdown|md)\s*\r?\n([\s\S]*?)\r?\n\1\s*$/i);
  if (wrapped) return wrapped[2].trim();

  // A streaming response may not have emitted the outer closing fence yet.
  return trimmed.replace(/^`{3,}(?:markdown|md)\s*\r?\n/i, '').trim();
}

function resolveRecommendedOption(value: string, options: string[]) {
  const exact = options.find(option => option === value);
  if (exact) return exact;

  // ponytail: accept one unique provider word typo only; structured option IDs are the upgrade path for broader paraphrases.
  const words = value.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length < 3) return null;
  const candidates = options.filter(option => {
    const optionWords = option.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    return optionWords.length === words.length
      && optionWords.filter((word, index) => word !== words[index]).length <= 1;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export function extractPlanQuestion(content: string): PlanQuestionPayload | null {
  const match = content.match(QUESTION_BLOCK);
  if (!match) return null;

  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    const options = Array.isArray(value.options)
      ? value.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0).slice(0, 8)
      : [];
    const type = value.type as PlanQuestionType;
    const recommendedOption = typeof value.recommendedOption === 'string' ? value.recommendedOption.trim() : '';
    const rawRecommendedOptions = options.includes(recommendedOption)
      ? [recommendedOption]
      : type === 'multiple'
        ? recommendedOption.split(';').map(option => option.trim()).filter(Boolean)
        : [recommendedOption];
    const resolvedRecommendedOptions = rawRecommendedOptions.map(option => resolveRecommendedOption(option, options));
    const recommendedOptions = resolvedRecommendedOptions.length === rawRecommendedOptions.length
      && resolvedRecommendedOptions.every((option): option is string => Boolean(option))
      ? resolvedRecommendedOptions
      : [];
    if (
      Array.isArray(value.questions)
      || typeof value.question !== 'string'
      || !['single', 'multiple'].includes(String(type))
      || options.length < 2
      || options.length > 7
      || !recommendedOptions.length
      || recommendedOptions.some(option => !options.includes(option))
    ) return null;

    return {
      content: unwrapOuterCodeFence(content.replace(QUESTION_BLOCK, '')),
      question: {
        id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : 'plan-question',
        question: value.question.trim(),
        type,
        options,
        recommendedOption: recommendedOptions[0],
        recommendedOptions,
        allowCustom: value.allowCustom !== false,
      },
    };
  } catch {
    return null;
  }
}

export function isPlanAnswer(content: string) {
  return content.startsWith(PLAN_ANSWER_PREFIX);
}

export function isPlanResponse(content: string) {
  return isPlanAnswer(content) || content.startsWith(PLAN_FEEDBACK_PREFIX);
}

function readLine(content: string, name: string) {
  return content.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
}

export function parsePlanResponse(content: string, question?: PlanQuestion): PlanResponseData | null {
  if (isPlanAnswer(content)) {
    const storedQuestion = readLine(content, 'Question');
    const summary = content.match(/^Answer:\s*([\s\S]*?)(?:\nData:|$)/m)?.[1]?.trim() ?? '';
    const encoded = readLine(content, 'Data');
    if (encoded) {
      try {
        const data = JSON.parse(encoded) as { selected?: unknown; customAnswer?: unknown };
        return {
          kind: 'answer',
          question: storedQuestion,
          selected: Array.isArray(data.selected) ? data.selected.filter((value): value is string => typeof value === 'string') : [],
          customAnswer: typeof data.customAnswer === 'string' ? data.customAnswer : '',
          summary,
        };
      } catch {}
    }

    const values = summary ? summary.split('; ').map(value => value.trim()).filter(Boolean) : [];
    const selected = question ? values.filter(value => question.options.includes(value)) : values;
    const customAnswer = question ? values.filter(value => !question.options.includes(value)).join('; ') : '';
    return { kind: 'answer', question: storedQuestion, selected, customAnswer, summary };
  }

  if (content.startsWith(PLAN_FEEDBACK_PREFIX)) {
    const action = readLine(content, 'Action') as PlanFeedbackAction;
    if (!['skip', 'not-relevant', 'undecided', 'recommend', 'correct-context', 'finish-with-assumptions'].includes(action)) return null;
    return {
      kind: 'feedback',
      question: readLine(content, 'Question'),
      action,
      correction: content.match(/^Correction:\s*([\s\S]*)$/m)?.[1]?.trim() ?? '',
    };
  }

  return null;
}

export function collectPlanQuestionEntries(messages: AIChatMessage[]): PlanQuestionEntry[] {
  const entries: PlanQuestionEntry[] = [];
  for (const message of messages) {
    if (message.role === 'assistant') {
      const payload = extractPlanQuestion(message.content);
      if (payload) {
        entries.push({
          key: String(message.id),
          question: payload.question,
          response: null,
          responseMessage: null,
        });
      }
      continue;
    }

    if (message.role === 'user' && isPlanResponse(message.content)) {
      const entry = [...entries].reverse().find(item => !item.response);
      if (entry) {
        entry.response = parsePlanResponse(message.content, entry.question);
        entry.responseMessage = message;
      }
    }
  }
  return entries;
}

export function planResponseDisplay(content: string) {
  const response = parsePlanResponse(content);
  if (!response) return null;
  if (response.kind === 'answer') return response.summary;
  if (response.action === 'skip') return 'Skipped';
  if (response.action === 'correct-context') return response.correction;
  return response.action.replaceAll('-', ' ');
}

export function hidePlanQuestionProtocol(content: string) {
  return content.replace(/```(?:plan-question|plan)\b[\s\S]*$/i, '').trimEnd();
}

/** Keep an accidentally combined PRD + next question visible in history. */
export function hasSubstantivePlanContent(content: string) {
  const value = content.trim();
  if (!value) return false;
  return value.length >= 400
    || /^#{1,6}\s/m.test(value)
    || /^\s*(?:[-*+] |\d+\. )/m.test(value)
    || (value.match(/\n\s*\n/g)?.length ?? 0) >= 2;
}

export function formatPlanAnswer(question: PlanQuestion, selected: string[], customAnswer: string) {
  const custom = customAnswer.trim();
  const answers = [...selected, ...(custom ? [custom] : [])];
  const data = JSON.stringify({ selected, customAnswer: custom });
  return `${PLAN_ANSWER_PREFIX}\nQuestion: ${question.question}\nAnswer: ${answers.join('; ')}\nData: ${data}`;
}

export function formatPlanFeedback(
  question: PlanQuestion,
  action: PlanFeedbackAction,
  correction = '',
) {
  return `${PLAN_FEEDBACK_PREFIX}\nQuestion: ${question.question}\nAction: ${action}${correction.trim() ? `\nCorrection: ${correction.trim()}` : ''}`;
}
