import { describe, expect, it } from 'vitest';
import { dbmlToERD } from '../dbml-converter';

describe('dbmlToERD', () => {
  it('throws on inline ref type mismatch with the local FK column name', () => {
    const dbml = `Table users {
  id uuid [pk]
}

Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
}`;

    expect(() => dbmlToERD(dbml)).toThrow(/posts\.user_id/);
  });

  it('accepts quoted table and column names in standalone refs', () => {
    const dbml = `Table "User Accounts" {
  "Id" uuid [pk]
}

Table audit_logs {
  id uuid [pk]
  "Actor Id" uuid
}

Ref: audit_logs."Actor Id" > "User Accounts"."Id"`;

    const result = dbmlToERD(dbml);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});
