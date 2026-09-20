import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  findMessage: vi.fn(),
  createMessage: vi.fn(),
  findPrompt: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    aiChatSession: { findFirst: mocks.findSession },
    aiChatMessage: { findFirst: mocks.findMessage, create: mocks.createMessage },
    aiSystemPrompt: { findFirst: mocks.findPrompt },
  },
}));

import { createMessage as saveMessage, createTrustedAssistantMessage, getTrustedAssistantMessage, getDefaultPrompt } from './service.js';

beforeEach(() => {
  mocks.findSession.mockReset();
  mocks.findMessage.mockReset();
  mocks.createMessage.mockReset();
  mocks.findPrompt.mockReset();
  mocks.findSession.mockResolvedValue({ id: 10 });
});

describe('AI chat message idempotency', () => {
  it('returns an existing message for the same client message id', async () => {
    mocks.findMessage.mockResolvedValue({ id: 20, clientMessageId: 'client-1', role: 'user', content: 'Answer', isTrustedAssistant: false });

    const result = await saveMessage({
      sessionId: 'session-1',
      userId: 'user-1',
      role: 'user',
      content: 'Answer',
      clientMessageId: 'client-1',
    });

    expect(result).toMatchObject({ id: 20 });
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it('recovers the stored message when concurrent inserts hit the unique index', async () => {
    mocks.findMessage.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 21, clientMessageId: 'client-2', role: 'user', content: 'Answer', isTrustedAssistant: false,
    });
    mocks.createMessage.mockRejectedValue({ code: 'P2002' });

    const result = await saveMessage({
      sessionId: 'session-1',
      userId: 'user-1',
      role: 'user',
      content: 'Answer',
      clientMessageId: 'client-2',
    });

    expect(result).toMatchObject({ id: 21 });
  });

  it('marks assistant messages written by the AI proxy as trusted', async () => {
    mocks.createMessage.mockResolvedValue({ id: 22, role: 'assistant', isTrustedAssistant: true });

    const result = await createTrustedAssistantMessage({
      sessionId: 'session-1',
      userId: 'user-1',
      content: 'Generated answer',
      clientMessageId: 'assistant-1',
    });

    expect(mocks.createMessage).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 10,
        role: 'assistant',
        content: 'Generated answer',
        clientMessageId: 'assistant-1',
        isTrustedAssistant: true,
      }),
    });
    expect(result).toMatchObject({ isTrustedAssistant: true });
  });

  it('only acknowledges a matching server-trusted assistant message', async () => {
    mocks.findMessage.mockResolvedValue({ id: 23, role: 'assistant', content: 'Generated answer', isTrustedAssistant: true });

    const result = await getTrustedAssistantMessage({
      sessionId: 'session-1',
      userId: 'user-1',
      clientMessageId: 'assistant-1',
    });

    expect(mocks.findMessage).toHaveBeenCalledWith({
      where: {
        sessionId: 10,
        clientMessageId: 'assistant-1',
        role: 'assistant',
        isTrustedAssistant: true,
      },
    });
    expect(result).toMatchObject({ id: 23 });
  });
});

describe('active system prompts', () => {
  it('returns the global prompt before the current user prompt', async () => {
    mocks.findPrompt
      .mockResolvedValueOnce({ content: 'Global instruction' })
      .mockResolvedValueOnce({ content: 'Personal instruction' });

    await expect(getDefaultPrompt('user-1')).resolves.toEqual({
      prompts: [
        { scope: 'global', content: 'Global instruction' },
        { scope: 'personal', content: 'Personal instruction' },
      ],
    });
  });
});
