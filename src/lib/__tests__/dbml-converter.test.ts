import { describe, expect, it } from 'vitest';
import { applyDBMLMetadata, dbmlToERD, erdToDBML, findMatchingCanvasEdge, normalizeDBMLIndexSyntax, removeEmptyDBMLIndexes } from '../dbml-converter';
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

  it('accepts the DBML contract required from AI-generated schemas', () => {
    const dbml = `Enum classes_level {
  "1"
  "2"
}

Table classes {
  id BIGINT [pk, increment]
  name VARCHAR(50) [not null]
  level classes_level [not null]
  academic_year VARCHAR(9) [not null]

  Indexes {
    (name, academic_year) [unique]
  }
}

Table students {
  id BIGINT [pk, increment]
  class_id BIGINT [not null]
}

Ref: students.class_id > classes.id`;

    const result = dbmlToERD(dbml);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.nodes.find(node => node.data.name === 'classes')?.data.columns.find(column => column.name === 'level')?.enum_values).toBe('"1", "2"');
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

  it('removes NULL defaults from non-nullable DBML columns', () => {
    const nodes = [{
      id: 'addresses',
      type: 'entity',
      position: { x: 0, y: 0 },
      data: {
        id: 'addresses', name: 'addresses', x: 0, y: 0, color: '#000',
        columns: [{ id: 'created-at', name: 'created_at', type: 'TIMESTAMP', is_pk: false, is_nullable: false, default_value: 'NULL' }],
      },
    }] as any;

    expect(erdToDBML(nodes, [])).toContain('created_at TIMESTAMP [not null]');
    expect(erdToDBML(nodes, [])).not.toContain('default: NULL');
  });

  it('accepts and removes empty Indexes blocks', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  Indexes {
  }
}

Table addresses {
  id BIGINT [pk, not null]
  user_id BIGINT [not null, unique]
  Indexes {
  }
}

Ref "fk_1": addresses.user_id > users.id [delete: cascade]`;

    const result = dbmlToERD(dbml);
    expect(result.nodes).toHaveLength(2);
    expect(removeEmptyDBMLIndexes(dbml)).not.toMatch(/Indexes\s*\{\s*\}/);
    expect(erdToDBML(result.nodes, result.edges)).not.toMatch(/Indexes\s*\{\s*\}/);
  });

  it('parses single-column indexes with DBML parentheses', () => {
    const result = dbmlToERD(`Table users {
  id BIGINT [pk, not null]
  email VARCHAR(255) [not null]
  Indexes {
    (email) [unique, name: "users_email_unique"]
  }
}`);

    expect(result.nodes[0].data.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'users_email_unique', is_unique: true }),
    ]));
    expect(erdToDBML(result.nodes, result.edges)).toContain('(email) [unique, name: "users_email_unique"]');
  });

  it('parses parenthesized indexes across related tables', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  name VARCHAR(255) [not null]
  email VARCHAR(255) [not null, note: 'harus unik']
  created_at TIMESTAMP [not null]
  updated_at TIMESTAMP [not null]
  deleted_at TIMESTAMP [default: NULL]
  Indexes {
    (email) [unique, name: "users_email_unique"]
  }
}

Table addresses {
  id BIGINT [pk, not null]
  user_id BIGINT [not null]
  created_at TIMESTAMP [not null]
  updated_at TIMESTAMP [not null]
  Indexes {
    (user_id) [unique, name: "addresses_user_id_unique"]
  }
}

Ref "fk_1": addresses.user_id > users.id [delete: cascade]`;

    const result = dbmlToERD(dbml);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.nodes.find(node => node.data.name === 'users')?.data.indexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'users_email_unique', is_unique: true })]),
    );
    expect(result.nodes.find(node => node.data.name === 'addresses')?.data.indexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'addresses_user_id_unique', is_unique: true })]),
    );
  });

  it('normalizes legacy single-column index syntax', () => {
    const legacy = `Table users {
  id BIGINT [pk, not null]
  email VARCHAR(255) [not null]
  Indexes {
    email [unique, name: "users_email_unique"]
  }
}`;
    const result = dbmlToERD(legacy);

    expect(normalizeDBMLIndexSyntax(legacy)).toContain('(email) [unique, name: "users_email_unique"]');
    expect(result.nodes[0].data.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'users_email_unique', is_unique: true }),
    ]));
  });

  it('round-trips table metadata, defaults, composite indexes, checks, and FK actions', () => {
    const dbml = `Table users {
  id BIGINT [pk, not null]
  email VARCHAR [not null, default: 'pending']
  Note: 'Account table'
  Checks {
    \`id > 0\` [name: 'users_id_positive']
  }
  Indexes {
    (id, email) [unique, name: "users_id_email_unique"]
  }
}

Table posts {
  id BIGINT [pk]
  user_id BIGINT
}

Ref "posts_user_id_fk": posts.user_id > users.id [delete: cascade, update: cascade]`;

    const result = dbmlToERD(dbml);
    const users = result.nodes.find(node => node.data.name === 'users')!;
    const email = users.data.columns.find(column => column.name === 'email');
    expect(users.data.comment).toBe('Account table');
    expect(email?.default_value).toBe("'pending'");
    expect(users.data.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'check', name: 'users_id_positive', expression: 'id > 0' }),
    ]));
    expect(users.data.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'users_id_email_unique', is_unique: true, column_ids: expect.arrayContaining([expect.any(String)]) }),
    ]));
    expect(result.edges[0].data).toMatchObject({ on_delete: 'cascade', on_update: 'cascade', constraint_name: 'posts_user_id_fk' });

    const roundTrip = erdToDBML(result.nodes, result.edges);
    expect(roundTrip).toContain("Note: 'Account table'");
    expect(roundTrip).toContain('users_id_email_unique');
    expect(roundTrip).toContain('delete: cascade');
    const reparsed = dbmlToERD(roundTrip);
    expect(reparsed.edges[0].data).toMatchObject({ constraint_name: 'posts_user_id_fk', on_delete: 'cascade', on_update: 'cascade' });
  });

  it('round-trips a canvas relation after changing only on delete', () => {
    const nodes = [
      { id: 'posts', data: { name: 'posts', columns: [{ id: 'posts.user_id', name: 'user_id', type: 'BIGINT', is_pk: false, is_nullable: false }] } },
      { id: 'users', data: { name: 'users', columns: [{ id: 'users.id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }] } },
    ] as any;
    const edges = [{
      id: 'posts-users', source: 'posts', target: 'users',
      sourceHandle: 'col-posts.user_id-source', targetHandle: 'col-users.id-target',
      label: '1:N', data: { on_delete: 'CASCADE', on_update: 'NO ACTION' },
    }] as any;

    const dbml = erdToDBML(nodes, edges);
    expect(dbmlToERD(dbml).edges[0].data).toMatchObject({ on_delete: 'cascade', on_update: 'no action' });
  });

  it('matches a DBML relation without replacing its canvas edge side', () => {
    const existing = {
      id: 'orders-users', source: 'orders', target: 'users',
      sourceHandle: 'col-orders.user_id-source-l', targetHandle: 'col-users.id-target-r',
    } as any;

    expect(findMatchingCanvasEdge([existing], 'orders', 'users', 'col-orders.user_id-source', 'col-users.id-target')).toBe(existing);
  });

  it('applies DBML metadata to existing canvas IDs for persistence', () => {
    const nodes = [{
      id: 'users-id',
      type: 'entity',
      position: { x: 10, y: 20 },
      data: {
        id: 'users-id', name: 'users', x: 10, y: 20, color: '#000',
        columns: [
          { id: 'id-current', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false },
          { id: 'email-current', name: 'email', type: 'VARCHAR', is_pk: false, is_nullable: false },
        ],
      },
    }] as any;

    const result = applyDBMLMetadata(nodes, `Table users {
  id BIGINT [pk, not null]
  email VARCHAR [not null, unique, default: 'pending']
}`);

    expect(result[0].data.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'primary_key', column_ids: ['id-current'] }),
    ]));
    expect(result[0].data.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ is_unique: true, column_ids: ['email-current'] }),
    ]));
    expect(result[0].data.columns[1]).toMatchObject({ is_unique: true, default_value: "'pending'" });
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
    const ref = parseDBMLRef('Ref "addresses_users_fk": addresses.user_id > users.id [delete: cascade]', '');

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
