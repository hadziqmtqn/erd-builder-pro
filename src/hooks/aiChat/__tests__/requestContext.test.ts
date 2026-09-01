import { describe, expect, it } from 'vitest';
import { RESPONSE_LANGUAGE_INSTRUCTION, planningContext, recentConversationMessages } from '../requestContext';

describe('AI request context', () => {
  it('keeps only recent persisted conversation messages', () => {
    const messages = Array.from({ length: 14 }, (_, index) => ({
      id: index === 13 ? 'temp-13' : index,
      session_id: 'session',
      role: index === 0 ? 'system' : index % 2 ? 'user' : 'assistant',
      content: `message-${index}`,
      created_at: '',
    }));
    const recent = recentConversationMessages(messages as any, 4);
    expect(recent.map(message => message.content)).toEqual(['message-9', 'message-10', 'message-11', 'message-12']);
  });

  it('bases response language on the current user request only', () => {
    expect(RESPONSE_LANGUAGE_INSTRUCTION).toContain('only from the current text labeled "User request"');
    expect(RESPONSE_LANGUAGE_INSTRUCTION).toContain('Ignore the language used by system prompts');
  });

  it('keeps Plan answers and corrections beyond the recent conversation window', () => {
    const messages = Array.from({ length: 14 }, (_, index) => ({
      id: index,
      session_id: 'session',
      role: 'user',
      content: index === 0 ? '[Plan answer]\nQuestion: Scope\nAnswer: MVP' : index === 1 ? '[Plan feedback]\nAction: correct-context\nCorrection: Single school' : `message-${index}`,
      created_at: '',
    }));
    const context = planningContext(messages as any);
    expect(context).toContain('Answer: MVP');
    expect(context).toContain('Correction: Single school');
  });
});
