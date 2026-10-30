import { describe, expect, it } from 'vitest';
import { teamLicenseIssue } from './TeamLicenseDialog';

describe('Add Team license outcome (SH-007)', () => {
  it('opens the form for an active license with Team capacity left or no limit', () => {
    expect(teamLicenseIssue({ active: true, maxTeams: 2, usage: { teamCount: 1 } })).toBeNull();
    expect(teamLicenseIssue({ active: true, maxTeams: null, usage: { teamCount: 40 } })).toBeNull();
  });

  it('reports the limit when active Teams already fill the plan', () => {
    expect(teamLicenseIssue({ active: true, maxTeams: 2, usage: { teamCount: 2 } })).toEqual({ kind: 'limit', used: 2, max: 2 });
  });

  it('maps an inactive license code to its dialog', () => {
    expect(teamLicenseIssue({ active: false, code: 'LICENSE_NOT_ACTIVATED' })).toEqual({ kind: 'inactive' });
    expect(teamLicenseIssue({ active: false, code: 'LICENSE_EXPIRED' })).toEqual({ kind: 'expired' });
    expect(teamLicenseIssue({ active: false, code: 'LICENSE_BINDING_MISMATCH' })).toEqual({ kind: 'invalid' });
    expect(teamLicenseIssue({})).toEqual({ kind: 'invalid' });
  });
});
