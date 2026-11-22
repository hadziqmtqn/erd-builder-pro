import { invoke } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';

/**
 * Whether the Desktop updater can replace the running app (BUG-097).
 *
 * macOS runs a quarantined app that was not moved with Finder from a read-only App Translocation
 * copy, and an app opened from a mounted disk image sits on a read-only volume. The updater then
 * downloads the update and fails with "Read-only file system (os error 30)". The Desktop shell
 * reports that case, so the app asks the user to move it to Applications before downloading.
 */
export type UpdateInstallLocation = {
  canInstall: boolean;
  translocated: boolean;
  readOnly: boolean;
};

const INSTALLABLE: UpdateInstallLocation = { canInstall: true, translocated: false, readOnly: false };

/** Any failure keeps the previous behaviour: the updater tries and reports its own error. */
export async function getUpdateInstallLocation(): Promise<UpdateInstallLocation> {
  try {
    const location = await invoke<UpdateInstallLocation>('update_install_location');
    return location && typeof location.canInstall === 'boolean' ? location : INSTALLABLE;
  } catch {
    return INSTALLABLE;
  }
}

export const MOVE_TO_APPLICATIONS_TITLE = 'Move ERD Builder Pro to Applications to update';

export function moveToApplicationsMessage(location: UpdateInstallLocation): string {
  const where = location.translocated
    ? 'macOS opened this copy from a temporary read-only location because it was not moved with Finder.'
    : 'This copy runs from a read-only location, such as the disk image.';
  return `${where} Quit ERD Builder Pro, drag it into the Applications folder in Finder, open it from Applications, and update again.`;
}

export async function quitApp(): Promise<void> {
  await exit(0);
}
