import { apiFetch } from '@/lib/api';

export async function callAiStream(
  baseUrl: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  onToken: (token: string) => void,
  providerCode?: string,
): Promise<string> {
  const response = await apiFetch('/api/ai/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, apiKey, baseUrl, providerCode }),
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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            accumulated += token;
            onToken(token);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return accumulated;
    throw err;
  }

  return accumulated;
}
