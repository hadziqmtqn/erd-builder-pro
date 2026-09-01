import { describe, expect, it } from 'vitest';
import { extractPlanQuestion, formatPlanAnswer, isPlanAnswer } from './plan-question-utils';

describe('plan question protocol', () => {
  it('extracts one valid question without showing its JSON to users', () => {
    const result = extractPlanQuestion(`Choose a direction first.\n\n\`\`\`plan-question\n{"id":"scope","question":"Choose scope","type":"single","options":["MVP","Full"],"recommendedOption":"MVP","allowCustom":true}\n\`\`\``);
    expect(result).toMatchObject({
      content: 'Choose a direction first.',
      question: { id: 'scope', type: 'single', recommendedOption: 'MVP', allowCustom: true },
    });
  });

  it('rejects batches, invalid option counts, and a recommendation outside the options', () => {
    expect(extractPlanQuestion('```plan-question\n{"questions":[]}\n```')).toBeNull();
    expect(extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A"],"recommendedOption":"A"}\n```')).toBeNull();
    expect(extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A","B"],"recommendedOption":"C"}\n```')).toBeNull();
  });

  it('marks interactive answers so historical cards stay disabled after reload', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"multiple","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    expect(question).toBeDefined();
    const answer = formatPlanAnswer(question!, ['A'], 'Custom');
    expect(isPlanAnswer(answer)).toBe(true);
  });

  it('does not include an unselected custom input in the submitted answer', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    expect(formatPlanAnswer(question!, ['A'], '')).toContain('Answer: A');
  });
});
