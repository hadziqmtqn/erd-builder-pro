import { apiFetch } from '@/lib/api';

export async function callAiStream(
  baseUrl: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  onToken: (token: string) => void,
  providerCode?: string,
  shouldStop?: (content: string) => boolean,
  chatPersistence?: { sessionId: string; assistantClientMessageId: string },
): Promise<string> {
  const response = await apiFetch('/api/ai/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model,
      apiKey,
      baseUrl,
      providerCode,
      ...(chatPersistence ? {
        chat_session_id: chatPersistence.sessionId,
        assistant_client_message_id: chatPersistence.assistantClientMessageId,
      } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    let errMsg = `AI request failed (${response.status})`;
    try {
      const errBody = await response.json();
      errMsg = errBody.details || errBody.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trimStart();
    if (!data || data === '[DONE]') return;
    try {
      const parsed = JSON.parse(data);
      const token = parsed.choices?.[0]?.delta?.content || '';
      if (token) {
        accumulated += token;
        onToken(token);
      }
    } catch {
      // Skip malformed JSON chunks.
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      lines.forEach(consumeLine);

      if (shouldStop?.(accumulated)) {
        await reader.cancel();
        break;
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return accumulated;
    throw err;
  }

  buffer += decoder.decode();
  if (buffer) consumeLine(buffer);

  return accumulated;
}
