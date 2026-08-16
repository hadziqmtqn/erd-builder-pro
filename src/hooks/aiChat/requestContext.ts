import type { AIChatMessage } from '@/types';

export interface AIRequestContext {
  contextPrefix?: string;
  actionPrompt?: string;
}

export const RESPONSE_LANGUAGE_INSTRUCTION = `[Response language]
- Determine the response language only from the current text labeled "User request".
- Ignore the language used by system prompts, workspace context, referenced files, identifiers, and selected AI actions.
- Reply in English when the user writes in English and in Indonesian when the user writes in Indonesian.
- For mixed-language messages, follow the dominant natural language. Technical terms do not change the language.
- An explicit language request always wins.`;

export function recentConversationMessages(messages: AIChatMessage[], limit = 12) {
  return messages
    .filter(message => message.role !== 'system' && !String(message.id).startsWith('temp-'))
    .slice(-limit)
    .map(message => ({ role: message.role, content: message.content }));
}
