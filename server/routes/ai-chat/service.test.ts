import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findSession, findMessage, createMessage } = vi.hoisted(() => ({
  findSession: vi.fn(),
  findMessage: vi.fn(),
  createMessage: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    aiChatSession: { findFirst: findSession },
    aiChatMessage: { findFirst: findMessage, create: createMessage },
  },
}));

import { createMessage as saveMessage } from './service.js';

describe('AI chat message idempotency', () => {
  beforeEach(() => {
    findSession.mockReset();
    findMessage.mockReset();
    createMessage.mockReset();
    findSession.mockResolvedValue({ id: 10 });
  });

  it('returns an existing message for the same client message id', async () => {
    findMessage.mockResolvedValue({ id: 20, clientMessageId: 'client-1' });

    const result = await saveMessage({
      sessionId: 'session-1',
      userId: 'user-1',
      role: 'user',
      content: 'Answer',
      clientMessageId: 'client-1',
    });

    expect(result).toMatchObject({ id: 20 });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('recovers the stored message when concurrent inserts hit the unique index', async () => {
    findMessage.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 21, clientMessageId: 'client-2' });
    createMessage.mockRejectedValue({ code: 'P2002' });

    const result = await saveMessage({
      sessionId: 'session-1',
      userId: 'user-1',
      role: 'user',
      content: 'Answer',
      clientMessageId: 'client-2',
    });

    expect(result).toMatchObject({ id: 21 });
  });
});
