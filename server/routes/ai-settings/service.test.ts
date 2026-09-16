import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    aiSystemPrompt: {
      findFirst: mocks.findFirst,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

import { savePrompt, toggleDefaultPrompt } from './service.js';

beforeEach(() => {
  mocks.findFirst.mockReset();
  mocks.update.mockReset();
  mocks.updateMany.mockReset();
});

describe('system prompt ownership', () => {
  it('rejects a member attempting to edit a global prompt', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'global-1', userId: null, isBuiltIn: false });

    await expect(savePrompt('member-1', {
      id: 'global-1', name: 'Global', content: 'Instruction', is_default: true,
    }, false)).resolves.toEqual({ forbidden: true });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('activates a global prompt without disabling a personal prompt', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'global-1', userId: null });
    mocks.update.mockResolvedValue({ id: 'global-1' });

    await toggleDefaultPrompt('global-1', true, 'admin-1', true);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { not: 'global-1' }, userId: null },
      data: { isDefault: false },
    });
  });
});
