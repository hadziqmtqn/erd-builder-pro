import { afterEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/plugin-process', () => ({ exit: vi.fn() }));

import { getUpdateInstallLocation, moveToApplicationsMessage } from './update-install-location';

afterEach(() => {
  invoke.mockReset();
});

describe('update install location (BUG-097)', () => {
  it('returns what the Desktop shell reports', async () => {
    invoke.mockResolvedValue({ canInstall: false, translocated: true, readOnly: false });

    await expect(getUpdateInstallLocation()).resolves.toEqual({ canInstall: false, translocated: true, readOnly: false });
    expect(invoke).toHaveBeenCalledWith('update_install_location');
  });

  it.each([
    ['the command is missing (older shell or web)', () => invoke.mockRejectedValue(new Error('command update_install_location not found'))],
    ['the answer is not a location', () => invoke.mockResolvedValue(null)],
  ])('lets the updater try when %s', async (_case, arrange) => {
    arrange();

    await expect(getUpdateInstallLocation()).resolves.toEqual({ canInstall: true, translocated: false, readOnly: false });
  });

  it('explains a translocated copy and a read-only volume differently', () => {
    const translocated = moveToApplicationsMessage({ canInstall: false, translocated: true, readOnly: true });
    const diskImage = moveToApplicationsMessage({ canInstall: false, translocated: false, readOnly: true });

    expect(translocated).toContain('temporary read-only location');
    expect(diskImage).toContain('such as the disk image');
    for (const message of [translocated, diskImage]) {
      expect(message).toContain('drag it into the Applications folder in Finder');
    }
  });
});
