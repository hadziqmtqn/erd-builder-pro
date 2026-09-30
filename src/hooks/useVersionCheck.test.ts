import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './useVersionCheck';

describe('isNewerVersion', () => {
  it('compares release versions before prerelease labels', () => {
    expect(isNewerVersion('3.4.6', '3.4.7-rc.4')).toBe(false);
    expect(isNewerVersion('3.4.7-rc.4', '3.4.6')).toBe(true);
    expect(isNewerVersion('3.4.7', '3.4.7-rc.4')).toBe(true);
  });

  it('compares prerelease identifiers according to SemVer ordering', () => {
    expect(isNewerVersion('3.4.7-rc.10', '3.4.7-rc.2')).toBe(true);
    expect(isNewerVersion('3.4.7-rc.2', '3.4.7-rc.10')).toBe(false);
    expect(isNewerVersion('3.4.7-rc.beta', '3.4.7-rc.10')).toBe(true);
  });

  it('ignores build metadata and rejects malformed versions', () => {
    expect(isNewerVersion('v3.4.7+build.5', '3.4.7+build.2')).toBe(false);
    expect(isNewerVersion('not-a-version', '3.4.7')).toBe(false);
    expect(isNewerVersion('3.4.7-rc.01', '3.4.7-rc.1')).toBe(false);
  });
});
