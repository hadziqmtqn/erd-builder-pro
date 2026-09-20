import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import { extractPlanQuestion } from '@/components/ai/plan-question-utils';
import { callAiStream } from '../callAiStream';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

describe('callAiStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels the remaining stream after a complete Plan question', async () => {
    const question = 'Ready.\n```plan-question\n{"question":"Scope?","type":"single","options":["MVP","Full"],"recommendedOption":"MVP"}\n```';
    const chunks = [question, '\nThis trailing response should not be awaited.'];
    let cancelled = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const content = chunks.shift();
        if (content) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
        else controller.close();
      },
      cancel() { cancelled = true; },
    });
    vi.mocked(apiFetch).mockResolvedValue(new Response(body));

    const result = await callAiStream(
      undefined,
      undefined,
      undefined,
      [],
      new AbortController().signal,
      () => {},
      undefined,
      content => Boolean(extractPlanQuestion(content)),
    );

    expect(result).toBe(question);
    expect(cancelled).toBe(true);
  });

  it('keeps the last UTF-8 token when an SSE frame has no trailing newline', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'jawaban 🌏' } }] })}`);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, bytes.length - 2));
        controller.enqueue(bytes.slice(bytes.length - 2));
        controller.close();
      },
    });
    vi.mocked(apiFetch).mockResolvedValue(new Response(body));

    const result = await callAiStream(
      undefined,
      undefined,
      undefined,
      [],
      new AbortController().signal,
      () => {},
    );

    expect(result).toBe('jawaban 🌏');
  });
});
