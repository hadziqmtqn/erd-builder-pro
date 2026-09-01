import type { AIChatMessage } from '@/types';
import { isPlanResponse } from '@/components/ai/plan-question-utils';

export interface AIRequestContext {
  contextPrefix?: string;
  actionPrompt?: string;
  planMode?: boolean;
  clientMessageId?: string;
  resumeExisting?: boolean;
  fromOutbox?: boolean;
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

export function planningContext(messages: AIChatMessage[]) {
  const firstRequest = messages.find(message => message.role === 'user' && !isPlanResponse(message.content));
  const responses = messages.filter(message => isPlanResponse(message.content));
  if (!responses.length) return null;

  return `[Planning context — original goal, user-confirmed answers, and corrections. Newer entries override older ones.]
${firstRequest ? `Original goal: ${firstRequest.content.slice(0, 2000)}\n\n` : ''}
${responses.map(message => message.content.slice(0, 800)).join('\n\n')}`;
}
