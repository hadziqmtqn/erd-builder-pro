import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'member' }, isGuest: false },
  session: { id: 1, uid: 'session-1', user_id: 'creator', access_role: 'manager' } as any,
  stateIndex: 0,
  api: vi.fn(),
  listOutbox: vi.fn(),
  saveOutbox: vi.fn(),
  deleteResource: vi.fn(),
}));

vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = mocks.stateIndex++;
    return [index === 0 ? [mocks.session] : index === 1 ? mocks.session : initial, vi.fn()];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
  useEffect: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.api }));
vi.mock('@/lib/localPersistence', () => ({ localPersistence: { deleteResource: mocks.deleteResource } }));
vi.mock('./aiChat/planRecovery', () => ({
  assistantClientMessageId: (id: string) => `assistant-${id}`,
  listPlanOutbox: mocks.listOutbox,
  savePlanOutbox: mocks.saveOutbox,
  removePlanOutbox: vi.fn(),
  updatePlanOutbox: vi.fn(),
}));

import { useAIChat } from './useAIChat';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stateIndex = 0;
  mocks.auth = { user: { id: 'member' }, isGuest: false };
  mocks.session = { id: 1, uid: 'session-1', user_id: 'creator', access_role: 'manager' };
  mocks.api.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  mocks.listOutbox.mockResolvedValue([]);
  mocks.deleteResource.mockResolvedValue(undefined);
  vi.stubGlobal('sessionStorage', { getItem: () => null });
});

describe('SH-002 AI conversation ownership', () => {
  it('blocks a non-creator Manager before network or Plan outbox writes', async () => {
    const chat = useAIChat();
    expect(chat.canManageSession(mocks.session)).toBe(false);
    await chat.sendMessage('Synthetic Plan answer', null, { planMode: true });
    await chat.deleteSession('session-1');
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.listOutbox).not.toHaveBeenCalled();
    expect(mocks.saveOutbox).not.toHaveBeenCalled();
  });

  it('reads shared messages from the server without merging the creator outbox', async () => {
    const chat = useAIChat();
    await chat.selectSession('session-1');
    await chat.selectSession('session-1');
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.listOutbox).not.toHaveBeenCalled();
  });

  it('fails closed when session ownership is missing', async () => {
    mocks.session.user_id = undefined;
    const chat = useAIChat();
    await chat.sendMessage('Not authorized');
    await chat.deleteSession('session-1');
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('preserves creator deletion', async () => {
    mocks.auth.user.id = 'creator';
    const chat = useAIChat();
    expect(chat.canManageSession(mocks.session)).toBe(true);
    await chat.deleteSession('session-1');
    expect(mocks.api).toHaveBeenCalledWith('/api/ai/chat/sessions/session-1', { method: 'DELETE' });
  });

  it('preserves local Guest conversation management', async () => {
    mocks.auth.isGuest = true;
    const chat = useAIChat();
    expect(chat.canManageSession(mocks.session)).toBe(true);
    await chat.deleteSession('session-1');
    expect(mocks.deleteResource).toHaveBeenCalledWith('session-1');
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
