import { describe, expect, it } from 'vitest';
import { canCommentOnFile, fileAccessRole, isFileCreator, isFileViewer, readOnlyNotice } from './fileOwnership';

const theirs = { userId: 'creator' };
const mine = { user_id: 'me' };

describe('file access role (COL-004)', () => {
  it('makes the creator the owner whatever the Project role says', () => {
    expect(fileAccessRole(mine, 'me', false, 'viewer')).toBe('owner');
    expect(isFileViewer(mine, 'me', false, 'viewer')).toBe(false);
    expect(fileAccessRole({ ...mine, accessRole: 'owner' }, 'me', false, 'commenter')).toBe('owner');
  });

  it('follows the server when it limits a Project creator on their own file (COL-007)', () => {
    expect(fileAccessRole({ ...mine, accessRole: 'viewer' }, 'me')).toBe('viewer');
    expect(isFileViewer({ ...mine, accessRole: 'commenter' }, 'me')).toBe(true);
    expect(canCommentOnFile({ ...mine, access_role: 'viewer' }, 'me')).toBe(false);
  });

  it('prefers the server role for the file, then the Project role', () => {
    expect(fileAccessRole({ ...theirs, accessRole: 'editor' }, 'me', false, 'viewer')).toBe('editor');
    expect(fileAccessRole(theirs, 'me', false, 'editor')).toBe('editor');
    expect(fileAccessRole({ ...theirs, access_role: 'manager' }, 'me')).toBe('manager');
  });

  it('ignores a role it does not know', () => {
    expect(fileAccessRole({ ...theirs, accessRole: 'admin' }, 'me')).toBeNull();
    expect(fileAccessRole(theirs, 'me', false, undefined)).toBeNull();
  });

  it.each([
    ['owner', false],
    ['manager', false],
    ['editor', false],
    ['commenter', true],
    ['viewer', true],
  ])('opens a %s file read-only: %s', (role, readOnly) => {
    expect(isFileViewer({ ...theirs, accessRole: role }, 'me')).toBe(readOnly);
  });

  it('keeps someone else’s file read-only until its role is known, so an unopened row never becomes writable', () => {
    expect(isFileViewer(theirs, 'me')).toBe(true);
    expect(isFileViewer({ id: 1 }, 'me')).toBe(false);
  });

  it('never marks Guest or Desktop files read-only', () => {
    expect(isFileViewer(theirs, 'guest', true)).toBe(false);
    expect(isFileCreator(theirs, 'guest', true)).toBe(true);
  });

  it('lets everyone but an explicit Viewer comment', () => {
    expect(canCommentOnFile({ ...theirs, accessRole: 'viewer' }, 'me')).toBe(false);
    expect(canCommentOnFile(theirs, 'me', false, 'viewer')).toBe(false);
    for (const role of ['owner', 'manager', 'editor', 'commenter']) {
      expect(canCommentOnFile({ ...theirs, accessRole: role }, 'me')).toBe(true);
    }
    expect(canCommentOnFile(theirs, 'me')).toBe(true);
  });

  it('words the notice by role and stays silent for those who can edit', () => {
    expect(readOnlyNotice('viewer', 'Ana')).toContain('View only · Ana owns this file');
    expect(readOnlyNotice('commenter', 'Ana')).toContain('Comment only · Ana owns this file');
    expect(readOnlyNotice(null, 'Ana')).toContain('Comment only');
    expect(readOnlyNotice('editor', 'Ana')).toBeNull();
    expect(readOnlyNotice('owner', 'Ana')).toBeNull();
  });

  it('tells a limited Project creator why their own file is read-only (COL-007)', () => {
    expect(readOnlyNotice('viewer', 'Me', true)).toBe('View only · A Team Manager limited your access to this Project, including the files you created.');
    expect(readOnlyNotice('commenter', 'Me', true)).toContain('Comment only · A Team Manager limited your access');
    expect(readOnlyNotice('owner', 'Me', true)).toBeNull();
  });
});
