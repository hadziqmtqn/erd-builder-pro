import { describe, expect, it } from 'vitest';
import { buildSchemaFormatOverride, fallbackSystemPrompt } from './buildSystemMessages';

describe('AI DBML contract', () => {
  it('requires parser-valid relationships and composite uniques in every frontend prompt layer', () => {
    for (const prompt of [fallbackSystemPrompt, buildSchemaFormatOverride()]) {
      expect(prompt).toContain('Ref: child.parent_id > parents.id');
      expect(prompt).toContain('Indexes { (column_a, column_b) [unique] }');
      expect(prompt.toLowerCase()).toContain('never use inline [ref: ...]');
    }
    expect(fallbackSystemPrompt).toContain('schema fence language must be exactly dbml');
    expect(fallbackSystemPrompt).toContain('users.access_role must use type users_access_role');
    expect(buildSchemaFormatOverride()).toContain('omit [null]');
    expect(buildSchemaFormatOverride()).toContain('one standalone Ref line only');
    expect(buildSchemaFormatOverride()).toContain('Enum users_access_role');
    expect(buildSchemaFormatOverride()).toContain('status invoices_status [not null, default: \'pending\']');
    expect(buildSchemaFormatOverride()).toContain('Ref: invoices.user_id > users.id');
  });
});
