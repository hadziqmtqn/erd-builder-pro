import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  getTrustedAssistantMessage: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({ prisma: null }));
vi.mock('./service.js', () => ({
  createMessage: mocks.createMessage,
  getTrustedAssistantMessage: mocks.getTrustedAssistantMessage,
}));

import { createMessage } from './controller.js';

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('AI chat message attribution', () => {
  it('rejects browser-supplied assistant messages that were not saved by the proxy', async () => {
    mocks.getTrustedAssistantMessage.mockResolvedValue(null);
    const res = response();

    await createMessage({
      user: { id: 'member-1' },
      body: { session_id: 'session-1', role: 'assistant', content: 'Forged answer', client_message_id: 'assistant-1' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it('returns the exact trusted assistant message already saved by the proxy', async () => {
    const saved = { id: 12, role: 'assistant', content: 'Generated answer', isTrustedAssistant: true };
    mocks.getTrustedAssistantMessage.mockResolvedValue(saved);
    const res = response();

    await createMessage({
      user: { id: 'member-1' },
      body: { session_id: 'session-1', role: 'assistant', content: 'Generated answer', client_message_id: 'assistant-1' },
    } as any, res);

    expect(res.json).toHaveBeenCalledWith(saved);
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it('continues to persist user messages from the authenticated member', async () => {
    const saved = { id: 13, role: 'user', content: 'Question' };
    mocks.createMessage.mockResolvedValue(saved);
    const res = response();

    await createMessage({
      user: { id: 'member-1' },
      body: { session_id: 'session-1', role: 'user', content: 'Question', client_message_id: 'user-1' },
    } as any, res);

    expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1', userId: 'member-1', role: 'user', content: 'Question',
    }));
    expect(res.json).toHaveBeenCalledWith(saved);
  });
});
