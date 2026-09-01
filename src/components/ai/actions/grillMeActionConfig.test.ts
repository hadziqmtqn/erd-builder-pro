import { describe, expect, it } from 'vitest';
import { grillMeAction } from './grillMeActionConfig';

describe('Grill Me AI action', () => {
  it('stays active and asks one focused question at a time', () => {
    expect(grillMeAction.persistent).toBe(true);
    expect(grillMeAction.requiresEntityContext).toBe(false);
    expect(grillMeAction.buildPrompt({})).toContain('exactly one high-leverage question at a time');
  });
});
