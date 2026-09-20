import { expect, test } from 'vitest';
import { redactLogText, redactLogValue, requestIdFromHeader } from './logger.js';

test('keeps valid request IDs and replaces invalid ones', () => {
  const valid = '11111111-1111-4111-8111-111111111111';

  expect(requestIdFromHeader(valid)).toBe(valid);
  expect(requestIdFromHeader('not-a-uuid')).not.toBe('not-a-uuid');
  expect(requestIdFromHeader(['not-a-uuid', valid])).not.toBe(valid);
});

test('redacts sensitive fields, nested values, credentials, and bearer tokens', () => {
  const result = redactLogValue({
    user_id: 'user-1',
    token: 'secret-token',
    nested: { password: 'secret-password' },
    details: 'Authorization: Bearer live-token password=secret-value',
  });

  expect(result).toMatchObject({
    user_id: 'user-1',
    token: '[REDACTED]',
    nested: { password: '[REDACTED]' },
  });
  expect(JSON.stringify(result)).not.toContain('secret-token');
  expect(JSON.stringify(result)).not.toContain('secret-password');
  expect(redactLogText('Bearer live-token')).toBe('Bearer [REDACTED]');
});
