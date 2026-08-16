import { describe, expect, it } from 'vitest';
import { siblingRelevanceScore } from '../siblings';

describe('sibling context relevance', () => {
  it('ranks files containing requested schema identifiers first', () => {
    const query = 'Explain users organization_id relationship';
    expect(siblingRelevanceScore('Users ERD: organization_id UUID', query))
      .toBeGreaterThan(siblingRelevanceScore('Payment flow and invoices', query));
  });
});
