import { describe, expect, it } from 'vitest';
import { getAppPageTitle } from './app-page-title';

const activeDocument = {
    activeFileName: 'Test ERD',
    breadcrumbLabel: 'Old workspace',
    featureLabel: 'ERD Builder',
    searchFeature: null,
};

describe('getAppPageTitle', () => {
    it.each([
        ['/', 'Dashboard | ERD Builder Pro'],
        ['/team-workspaces', 'Team Workspaces | ERD Builder Pro'],
        ['/users', 'User Management | ERD Builder Pro'],
        ['/trash', 'Trash | ERD Builder Pro'],
        ['/team-workspaces/', 'Team Workspaces | ERD Builder Pro'],
    ])('uses the page title for %s even if a file was open', (pathname, expected) => {
        expect(getAppPageTitle({ ...activeDocument, pathname })).toBe(expected);
    });

    it('uses the selected Team name on its management page', () => {
        expect(getAppPageTitle({ ...activeDocument, pathname: '/teams/team-1', breadcrumbLabel: 'Engineering' }))
            .toBe('Engineering | ERD Builder Pro');
    });

    it('keeps the file name on document routes', () => {
        expect(getAppPageTitle({ ...activeDocument, pathname: '/diagrams/file-1' }))
            .toBe('Test ERD | ERD Builder Pro');
    });

    it('uses route defaults before the file has loaded', () => {
        expect(getAppPageTitle({ ...activeDocument, pathname: '/diagrams/file-1', activeFileName: null }))
            .toBe('Diagram | ERD Builder Pro');
    });
});
