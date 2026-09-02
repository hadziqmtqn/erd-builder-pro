import { describe, expect, it } from 'vitest';
import { buildSchemaFormatOverride, fallbackSystemPrompt } from './buildSystemMessages';

describe('AI DBML contract', () => {
  it('requires parser-valid relationships and composite uniques in every frontend prompt layer', () => {
    for (const prompt of [fallbackSystemPrompt, buildSchemaFormatOverride()]) {
      expect(prompt).toContain('Ref: child.parent_id > parents.id');
      expect(prompt).toContain('Indexes { (column_a, column_b) [unique] }');
      expect(prompt.toLowerCase()).toContain('never use inline [ref: ...]');
    }
  });
});
