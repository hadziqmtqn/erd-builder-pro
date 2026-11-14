import { describe, expect, it } from 'vitest';
import { parseReport } from '../../workers/error-reports/src/index';
import { errorReport } from './report';

describe('Desktop error report (OPS-010)', () => {
  it('builds what the Worker accepts', () => {
    for (const [event, step, code] of [
      ['server-failed', 'exit', 1],
      ['server-failed', 'timeout', null],
      ['server-stopped', 'exit', 137],
      ['update-failed', 'download', null],
    ] as const) {
      const report = errorReport('3.5.1', 'macos', 'aarch64', event, step, code);
      expect(parseReport(report)).toEqual(report);
    }
  });

  it('sends nothing when the version or step is unknown', () => {
    expect(errorReport('unknown', 'macos', 'x86_64', 'server-failed', 'exit', 1)).toBeNull();
    expect(errorReport('3.5.1', 'macos', 'x86_64', 'server-failed', null, null)).toBeNull();
  });
});
