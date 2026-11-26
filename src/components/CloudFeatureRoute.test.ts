import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { isSso: true } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useOutletContext: () => mocks.context }));
import { CloudFeatureRoute } from './CloudFeatureRoute';

const render = () => renderToStaticMarkup(createElement(CloudFeatureRoute, { capability: 'erd_builder', children: 'EDITOR' }));

beforeEach(() => {
  mocks.context = { activeTeamId: 'team-1', activeTeam: null, isLoading: false, loadFailed: false, fetchTeams: vi.fn() };
});

it('offers a retry instead of the paywall when the Team plan could not be loaded (BUG-089)', () => {
  mocks.context.loadFailed = true;
  const html = render();
  expect(html).toContain('Could not load the Team plan');
  expect(html).not.toContain('Unlock');
  expect(html).not.toContain('EDITOR');
});

it('still shows the paywall when the loaded Team plan lacks the feature', () => {
  mocks.context.activeTeam = { id: 'team-1', name: 'Acme', capabilities: { erd_builder: false } };
  expect(render()).toContain('Unlock ERD Builder');
});

it('opens the editor when the loaded Team plan includes the feature', () => {
  mocks.context.activeTeam = { id: 'team-1', name: 'Acme', capabilities: { erd_builder: true } };
  expect(render()).toBe('EDITOR');
});
