import { describe, expect, it } from 'vitest';
import { stripHtmlComments } from './ChangelogView';

describe('stripHtmlComments', () => {
  it('drops the generated-notes comment so the summary starts at real content', () => {
    const body = "<!-- Release notes generated using configuration in .github/release.yml at master -->\n\n## What's Changed\n* Fix";
    expect(stripHtmlComments(body).split('\n')[0]).toBe("## What's Changed");
  });

  it('removes multi-line comments anywhere and tolerates an empty body', () => {
    expect(stripHtmlComments('a <!-- x\ny --> b')).toBe('a  b');
    expect(stripHtmlComments(null)).toBe('');
  });
});
