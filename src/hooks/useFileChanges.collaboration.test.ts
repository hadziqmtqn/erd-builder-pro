import { describe, expect, it } from 'vitest';
import { collaborationTeam } from './useFileChanges';

describe('Self-host collaboration signal on the file stream (BUG-079)', () => {
  it('reads the Team whose views should refresh', () => {
    expect(collaborationTeam('event: collaboration\ndata: {"teamId":"team-1"}')).toBe('team-1');
  });

  it('ignores a signal without a usable Team', () => {
    expect(collaborationTeam('event: collaboration\ndata: {}')).toBeNull();
    expect(collaborationTeam('event: collaboration\ndata: {"teamId":""}')).toBeNull();
    expect(collaborationTeam('event: collaboration\ndata: not json')).toBeNull();
    expect(collaborationTeam('event: collaboration')).toBeNull();
  });
});
