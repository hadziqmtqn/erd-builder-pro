import { apiFetch } from '@/lib/api';

export interface AiConfig {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  providerCode?: string;
}

export async function resolveAiConfig(): Promise<AiConfig> {
  const res = await apiFetch('/api/ai/chat/config');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to resolve AI config');
  }

  return await res.json();
}
