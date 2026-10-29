import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { setCloudPricingPortal, toastCreateError } from './file-types';

beforeEach(() => { vi.clearAllMocks(); setCloudPricingPortal(null); });

describe('BUG-029 toastCreateError', () => {
  it('adds a pricing action to quota refusals when the SaaS portal is known', () => {
    setCloudPricingPortal('https://saas.example');
    toastCreateError({ error: 'Personal Workspace has reached the limit of 3 Notes files.', code: 'PERSONAL_FILE_QUOTA_EXCEEDED' }, 'Failed');
    expect(toast.error).toHaveBeenCalledWith('Personal Workspace has reached the limit of 3 Notes files.', {
      action: { label: 'View Cloud plans', onClick: expect.any(Function) },
    });
  });

  it('shows a plain error for other failures or without a portal', () => {
    setCloudPricingPortal('https://saas.example');
    toastCreateError({ error: 'A project is required' }, 'Failed');
    toastCreateError(null, 'Failed to create note');
    setCloudPricingPortal(null);
    toastCreateError({ error: 'Limit', code: 'TEAM_FILE_QUOTA_EXCEEDED' }, 'Failed');
    expect(toast.error.mock.calls).toEqual([['A project is required', undefined], ['Failed to create note', undefined], ['Limit', undefined]]);
  });
});
