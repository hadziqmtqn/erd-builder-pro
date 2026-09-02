import { describe, expect, it } from 'vitest';
import { collectPlanQuestionEntries, extractPlanQuestion, formatPlanAnswer, formatPlanFeedback, hasSubstantivePlanContent, hidePlanQuestionProtocol, isPlanAnswer, isPlanResponse, parsePlanResponse } from './plan-question-utils';

describe('plan question protocol', () => {
  it('extracts one valid question without showing its JSON to users', () => {
    const result = extractPlanQuestion(`Choose a direction first.\n\n\`\`\`plan-question\n{"id":"scope","question":"Choose scope","type":"single","options":["MVP","Full"],"recommendedOption":"MVP","allowCustom":true}\n\`\`\``);
    expect(result).toMatchObject({
      content: 'Choose a direction first.',
      question: { id: 'scope', type: 'single', recommendedOption: 'MVP', allowCustom: true },
    });
  });

  it('accepts the provider plan fence alias while keeping the protocol hidden', () => {
    const content = 'I need one decision.\n```plan\n{"id":"stack","question":"Choose stack","type":"single","options":["Laravel","Node.js"],"recommendedOption":"Laravel","allowCustom":true}\n```';
    expect(extractPlanQuestion(content)).toMatchObject({
      content: 'I need one decision.',
      question: { id: 'stack', recommendedOption: 'Laravel' },
    });
    expect(hidePlanQuestionProtocol('I need one decision.\n```plan\n{"id":"stack"')).toBe('I need one decision.');
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

  it('restores selected and custom answers from persisted messages', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"multiple","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    const content = formatPlanAnswer(question!, ['A'], 'Custom details');
    expect(parsePlanResponse(content, question!)).toMatchObject({
      kind: 'answer',
      selected: ['A'],
      customAnswer: 'Custom details',
    });
  });

  it('collects all Plan questions into one ordered interview history', () => {
    const messages = [
      { id: 'q1', role: 'assistant', content: '```plan-question\n{"question":"Scope?","type":"single","options":["MVP","Full"],"recommendedOption":"MVP"}\n```' },
      { id: 'a1', role: 'user', content: '[Plan answer]\nQuestion: Scope?\nAnswer: MVP' },
      { id: 'q2', role: 'assistant', content: '```plan-question\n{"question":"Stack?","type":"single","options":["Laravel","React"],"recommendedOption":"Laravel"}\n```' },
    ] as any;
    const entries = collectPlanQuestionEntries(messages);
    expect(entries).toHaveLength(2);
    expect(entries[0].response).toMatchObject({ kind: 'answer', selected: ['MVP'] });
    expect(entries[1].response).toBeNull();
  });

  it('marks Plan feedback as answered and hides an in-progress protocol block', () => {
    const question = extractPlanQuestion('```plan-question\n{"question":"x","type":"single","options":["A","B"],"recommendedOption":"A"}\n```')?.question;
    expect(isPlanResponse(formatPlanFeedback(question!, 'not-relevant'))).toBe(true);
    expect(parsePlanResponse(formatPlanFeedback(question!, 'skip'))).toMatchObject({ kind: 'feedback', action: 'skip' });
    expect(hidePlanQuestionProtocol('Choosing now.\n```plan-question\n{"id":"scope"')).toBe('Choosing now.');
  });

  it('keeps a generated PRD visible when an AI response also asks one next question', () => {
    expect(hasSubstantivePlanContent('Choose a database direction first.')).toBe(false);
    expect(hasSubstantivePlanContent('# PRD Aplikasi SPP\n\n## Stack\n- Laravel\n- PostgreSQL\n\n## RBAC\nAdmin dan bendahara.')).toBe(true);
  });
});
