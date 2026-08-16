import { describe, expect, it } from 'vitest';
import { RESPONSE_LANGUAGE_INSTRUCTION, recentConversationMessages } from '../requestContext';

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
});
