import { describe, expect, it } from 'vitest';
import { progressText } from './format';

describe('updater window text (OPS-009)', () => {
  it('reports percent and megabytes when the size is known', () => {
    expect(progressText(53 * 1024 * 1024, 110 * 1024 * 1024)).toEqual({ percent: 48, label: '53 MB of 110 MB' });
    expect(progressText(120 * 1024 * 1024, 110 * 1024 * 1024).percent).toBe(100);
  });

  it('reports only megabytes when the server sends no size', () => {
    expect(progressText(5 * 1024 * 1024, 0)).toEqual({ percent: null, label: '5 MB downloaded' });
  });
});
