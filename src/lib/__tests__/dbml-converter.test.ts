import { describe, expect, it } from 'vitest';
import { dbmlToERD, erdToDBML } from '../dbml-converter';
import { dedupeDBMLEnumBlocks, normalizeDBMLTypeName, parseDBMLColumn, parseDBMLRef } from '../dbml-utils';

describe('dbmlToERD', () => {
  it('normalizes DBML type modifiers for editor validation', () => {
    const column = parseDBMLColumn('  amount DECIMAL(10, 2) [not null]');

    expect(column?.type).toBe('DECIMAL(10, 2)');
    expect(normalizeDBMLTypeName(column?.type || '')).toBe('DECIMAL');
  });

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

  it('accepts standalone refs with spaces around the relationship operator', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  name VARCHAR [not null]
}

Table employees {
  id BIGINT [pk, not null]
  user_id BIGINT [not null]
}

Ref: employees.user_id > users.id`;

    const result = dbmlToERD(dbml);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('normalizes AI-style DBML with sized types, inline enums, and local refs', () => {
    const dbml = `Table users {
  id bigint [pk, increment]
  email varchar(255) [not null, unique]
}

Table login_logs {
  id bigint [pk, increment]
  user_id bigint [not null]
  status enum('success', 'failed', 'locked')

  Ref: user_id > users.id
}`;

    const result = dbmlToERD(dbml);
    const loginLogs = result.nodes.find(node => node.data.name === 'login_logs');
    const status = loginLogs?.data.columns.find(column => column.name === 'status');

    expect(result.nodes.map(node => node.data.name).sort()).toEqual(['login_logs', 'users']);
    expect(result.edges).toHaveLength(1);
    expect(status?.type).toBe('ENUM');
    expect(status?.enum_name).toBe('login_logs_status');
    expect(status?.enum_values).toBe('success, failed, locked');
  });

  it('accepts a single remaining table with uppercase DBML types', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  name VARCHAR [not null]
}`;

    const result = dbmlToERD(dbml);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data.name).toBe('users');
    expect(result.nodes[0].data.columns.map(column => column.name)).toEqual(['id', 'name']);
    expect(result.edges).toHaveLength(0);
  });

  it('round-trips column comment and max length through DBML', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  email VARCHAR(100) [not null, note: 'Harus unik']
}`;

    const result = dbmlToERD(dbml);
    const email = result.nodes[0].data.columns.find(column => column.name === 'email');
    expect(email?.comment).toBe('Harus unik');
    expect(email?.max_length).toBe(100);
    expect(erdToDBML(result.nodes, result.edges)).toContain("email VARCHAR(100) [not null, note: 'Harus unik']");
  });

  it('round-trips decimal precision and scale through DBML', () => {
    const dbml = `Table orders {
  amount DECIMAL(10,2) [not null]
}`;

    const result = dbmlToERD(dbml);
    const amount = result.nodes[0].data.columns.find(column => column.name === 'amount');
    expect(amount?.numeric_precision).toBe(10);
    expect(amount?.numeric_scale).toBe(2);
    expect(erdToDBML(result.nodes, result.edges)).toContain('amount DECIMAL(10,2) [not null]');
  });

  it('rejects enum names that do not match table_column', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  role role_type
}

Enum role_type {
  admin
  member
}`;

    expect(() => dbmlToERD(dbml)).toThrow(/must be named "users_role"/);
  });

  it('trims standalone ref columns before validation', () => {
    const ref = parseDBMLRef('Ref: addresses.user_id > users.id', '');

    expect(ref).toMatchObject({
      fkTable: 'addresses',
      fkCol: 'user_id',
      pkTable: 'users',
      pkCol: 'id',
    });
  });

  it('dedupes enum blocks added during DBML panel reverse sync', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  name VARCHAR [not null]
  status users_status
}

Table employees {
  id BIGINT [pk, not null]
  user_id BIGINT [not null]
}

Enum users_status {
  active
  notactive
}

Enum users_status {
  active
  notactive
}
Ref: employees.user_id > users.id`;

    expect(dedupeDBMLEnumBlocks(dbml).match(/Enum users_status/g)).toHaveLength(1);
  });
});
