import { describe, expect, it } from 'vitest';
import { isFileCreator } from '../fileOwnership';

describe('file ownership UI guard', () => {
  it('allows only the creator and keeps legacy records fail-closed', () => {
    expect(isFileCreator({ user_id: 'user-1' }, 'user-1')).toBe(true);
    expect(isFileCreator({ userId: 'user-2' }, 'user-1')).toBe(false);
    expect(isFileCreator({ user_id: null }, 'user-1')).toBe(false);
    expect(isFileCreator({ user_id: null }, 'guest', true)).toBe(true);
  });
});
