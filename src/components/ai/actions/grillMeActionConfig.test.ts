import { describe, expect, it } from 'vitest';
import { grillMeAction } from './grillMeActionConfig';

describe('Plan AI action', () => {
  it('asks one question at a time and gathers the core planning decisions before concluding', () => {
    expect(grillMeAction.persistent).toBe(true);
    expect(grillMeAction.requiresEntityContext).toBe(false);
    expect(grillMeAction.label).toBe('Plan');
    expect(grillMeAction.buildPrompt({})).toContain('ask exactly one highest-impact question');
    const followUpPrompt = grillMeAction.buildPrompt({ planPhase: 'follow-up' });
    expect(followUpPrompt).toContain('The user has answered the previous question');
    expect(followUpPrompt).toContain('at least three distinct decision areas');
    expect(followUpPrompt).toContain('technical direction');
    expect(followUpPrompt).toContain('not an automatically correct decision');
    expect(followUpPrompt).toContain('ask exactly one clarifying follow-up');
    expect(followUpPrompt).toContain('materially change scope');
    expect(followUpPrompt).toContain('Do not write a final plan while it would contain a material unresolved question');
    expect(grillMeAction.buildPrompt({})).toContain('```plan-question');
    expect(grillMeAction.buildPrompt({})).toContain('do not include a "Open questions" or "Pertanyaan terbuka" section for material decisions');
    expect(grillMeAction.buildPrompt({})).toContain('Treat [Plan feedback] as authoritative');
    expect(grillMeAction.buildPrompt({})).toContain('use the Planning context as the source of user-confirmed decisions');
  });
});
