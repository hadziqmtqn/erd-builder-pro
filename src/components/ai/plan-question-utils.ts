export type PlanQuestionType = 'single' | 'multiple';

export interface PlanQuestion {
  id: string;
  question: string;
  type: PlanQuestionType;
  options: string[];
  recommendedOption: string;
  allowCustom: boolean;
}

export interface PlanQuestionPayload {
  content: string;
  question: PlanQuestion;
}

export const PLAN_ANSWER_PREFIX = '[Plan answer]';
const QUESTION_BLOCK = /```plan-question\s*\n([\s\S]*?)```/i;

export function extractPlanQuestion(content: string): PlanQuestionPayload | null {
  const match = content.match(QUESTION_BLOCK);
  if (!match) return null;

  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    const options = Array.isArray(value.options)
      ? value.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0).slice(0, 8)
      : [];
    if (
      Array.isArray(value.questions)
      || typeof value.question !== 'string'
      || !['single', 'multiple'].includes(String(value.type))
      || options.length < 2
      || options.length > 7
      || typeof value.recommendedOption !== 'string'
      || !options.includes(value.recommendedOption)
    ) return null;

    return {
      content: content.replace(QUESTION_BLOCK, '').trim(),
      question: {
        id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : 'plan-question',
        question: value.question.trim(),
        type: value.type as PlanQuestionType,
        options,
        recommendedOption: value.recommendedOption,
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

export function formatPlanAnswer(question: PlanQuestion, selected: string[], customAnswer: string) {
  const answers = [...selected, ...(customAnswer.trim() ? [customAnswer.trim()] : [])];
  return `${PLAN_ANSWER_PREFIX}\nQuestion: ${question.question}\nAnswer: ${answers.join('; ')}`;
}
