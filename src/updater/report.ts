// Desktop error report (OPS-010): only these fields, shown in full before the user sends them.
// Contract: erd-builder-pro-architecture contracts/desktop-error-report.md.
export interface ErrorReport {
  app_version: string;
  os: string;
  arch: string;
  event: string;
  step: string;
  exit_code: number | null;
}

const REPORT_URL = import.meta.env.VITE_ERROR_REPORT_URL?.trim() || 'https://reports.erdbuilderpro.com/v1/desktop-error';

/** Null when the window lacks what a report needs, e.g. the version could not be read. */
export function errorReport(
  version: string,
  os: string | undefined,
  arch: string | undefined,
  event: string,
  step: string | null | undefined,
  exitCode: number | null | undefined,
): ErrorReport | null {
  if (!os || !arch || !step || !/^\d+\.\d+\.\d+/.test(version)) return null;
  return { app_version: version, os, arch, event, step, exit_code: exitCode ?? null };
}

export async function sendReport(report: ErrorReport): Promise<boolean> {
  try {
    const response = await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    return response.ok;
  } catch {
    return false;
  }
}
