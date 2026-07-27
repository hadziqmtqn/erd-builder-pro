import { describe, it, expect } from 'vitest';
import { parseSqlDdl } from '../sqlParser';

describe('parseSqlDdl', () => {
  it('parses a basic CREATE TABLE with columns', () => {
    const sql = `CREATE TABLE users (
      id BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL
    );`;

    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('users');
    expect(result.tables[0].columns).toHaveLength(3);
  });

  it('parses PRIMARY KEY and NOT NULL constraints', () => {
    const sql = `CREATE TABLE users (
      id BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      bio TEXT
    );`;

    const result = parseSqlDdl(sql);
    const table = result.tables[0];

    const idCol = table.columns.find(c => c.name === 'id')!;
    expect(idCol.is_pk).toBe(true);
    expect(idCol.is_nullable).toBe(false);

    const nameCol = table.columns.find(c => c.name === 'name')!;
    expect(nameCol.is_nullable).toBe(false);

    const bioCol = table.columns.find(c => c.name === 'bio')!;
    expect(bioCol.is_nullable).toBe(true);
  });

  it('parses ALTER TABLE ADD FOREIGN KEY', () => {
    const sql = `ALTER TABLE posts ADD FOREIGN KEY (author_id) REFERENCES users(id);`;

    const result = parseSqlDdl(sql);
    expect(result.alterFks).toHaveLength(1);
    expect(result.alterFks[0].sourceTable).toBe('posts');
    expect(result.alterFks[0].targetTable).toBe('users');
    expect(result.alterFks[0].sourceCols).toEqual(['author_id']);
    expect(result.alterFks[0].targetCols).toEqual(['id']);
  });

  it('parses CREATE TABLE with inline FK', () => {
    const sql = `CREATE TABLE posts (
      id BIGINT PRIMARY KEY,
      author_id BIGINT REFERENCES users(id),
      title VARCHAR(255) NOT NULL
    );`;

    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(1);
    const fk = result.tables[0].constraints.find(c => c.type === 'FOREIGN_KEY');
    expect(fk).toBeDefined();
    expect(fk!.columns).toEqual(['author_id']);
    expect(fk!.refTable).toBe('users');
    expect(fk!.refColumns).toEqual(['id']);
  });

  it('parses table-level FOREIGN KEY constraint', () => {
    const sql = `CREATE TABLE orders (
      id BIGINT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );`;

    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(1);
    const fks = result.tables[0].constraints.filter(c => c.type === 'FOREIGN_KEY');
    expect(fks).toHaveLength(2);
  });

  it('preserves raw types (no normalization at parseSqlDdl level)', () => {
    const sql = `CREATE TABLE test (
      id BIGSERIAL PRIMARY KEY,
      counter SERIAL NOT NULL,
      val VARCHAR(500)
    );`;

    const result = parseSqlDdl(sql);
    const idCol = result.tables[0].columns.find(c => c.name === 'id')!;
    expect(idCol.type).toBe('BIGSERIAL');

    const counterCol = result.tables[0].columns.find(c => c.name === 'counter')!;
    expect(counterCol.type).toBe('SERIAL');

    const valCol = result.tables[0].columns.find(c => c.name === 'val')!;
    expect(valCol.type).toBe('VARCHAR(500)');
  });

  it('parses MySQL column comments and max length', () => {
    const sql = `CREATE TABLE users (
      email VARCHAR(100) NOT NULL COMMENT 'Harus unik'
    );`;

    const result = parseSqlDdl(sql);
    const email = result.tables[0].columns[0];
    expect(email.comment).toBe('Harus unik');
    expect(email.max_length).toBe(100);
  });

  it('does not treat decimal precision as max length', () => {
    const sql = `CREATE TABLE orders (amount DECIMAL(10,2) NOT NULL);`;

    const result = parseSqlDdl(sql);
    const amount = result.tables[0].columns[0];
    expect(amount.max_length).toBeNull();
    expect(amount.numeric_precision).toBe(10);
    expect(amount.numeric_scale).toBe(2);
  });

  it('handles multiple CREATE TABLE statements', () => {
    const sql = `
      CREATE TABLE users (id BIGINT PRIMARY KEY, name VARCHAR(255));
      CREATE TABLE posts (id BIGINT PRIMARY KEY, title VARCHAR(255), author_id BIGINT NOT NULL);
    `;

    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(2);
    expect(result.tables.map(t => t.name)).toEqual(['users', 'posts']);
  });

  it('handles ALTER TABLE ADD COLUMN', () => {
    const sql = `ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);`;

    const result = parseSqlDdl(sql);
    expect(result.alterAddColumns).toHaveLength(1);
    expect(result.alterAddColumns[0].tableName).toBe('users');
    expect(result.alterAddColumns[0].columns).toHaveLength(1);
    expect(result.alterAddColumns[0].columns[0].name).toBe('avatar_url');
    expect(result.alterAddColumns[0].columns[0].type).toBe('VARCHAR(500)');
  });

  it('ignores SQL dialect noise (ENGINE, DEFAULT CHARSET)', () => {
    const sql = `CREATE TABLE users (
      id BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].columns).toHaveLength(2);
  });

  it('stores composite primary key as a table-level constraint', () => {
    const sql = `CREATE TABLE order_items (
      order_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      quantity INT NOT NULL,
      PRIMARY KEY (order_id, product_id)
    );`;

    const result = parseSqlDdl(sql);
    const pkConstraint = result.tables[0].constraints.find(c => c.type === 'PRIMARY_KEY');
    expect(pkConstraint).toBeDefined();
    expect(pkConstraint!.columns).toEqual(['order_id', 'product_id']);
  });

  it('parses inline PK sets is_pk on the column', () => {
    const sql = `CREATE TABLE users (id UUID PRIMARY KEY, name VARCHAR(255));`;

    const result = parseSqlDdl(sql);
    const idCol = result.tables[0].columns[0];
    expect(idCol.type).toBe('UUID');
    expect(idCol.is_pk).toBe(true);
  });

  it('lowercases quoted identifiers', () => {
    const sql = 'CREATE TABLE "Users" ("Id" BIGINT PRIMARY KEY, "Full Name" VARCHAR(255));';
    const result = parseSqlDdl(sql);
    expect(result.tables[0].name).toBe('users');
    expect(result.tables[0].columns.map(c => c.name)).toEqual(['id', 'full name']);
  });

  it('parses ALTER TABLE ... ADD FOREIGN KEY with composite columns', () => {
    const sql = `ALTER TABLE order_items ADD FOREIGN KEY (order_id, product_id) REFERENCES orders(id, product_id);`;
    const result = parseSqlDdl(sql);
    expect(result.alterFks).toHaveLength(1);
    expect(result.alterFks[0].sourceCols).toEqual(['order_id', 'product_id']);
    expect(result.alterFks[0].targetCols).toEqual(['id', 'product_id']);
  });

  it('parses ALTER TABLE without COLUMN keyword', () => {
    const sql = `ALTER TABLE users ADD avatar_url VARCHAR(500);`;
    const result = parseSqlDdl(sql);
    expect(result.alterAddColumns).toHaveLength(1);
    expect(result.alterAddColumns[0].tableName).toBe('users');
  });

  it('handles empty SQL string', () => {
    const result = parseSqlDdl('');
    expect(result.tables).toHaveLength(0);
    expect(result.alterFks).toHaveLength(0);
    expect(result.alterAddColumns).toHaveLength(0);
  });

  it('handles SQL with only comments', () => {
    const result = parseSqlDdl('-- This is a comment\n-- Another comment');
    expect(result.tables).toHaveLength(0);
  });

  it('preserves column order as defined in CREATE TABLE', () => {
    const sql = `CREATE TABLE t (
      a INT, b INT, c INT
    );`;
    const result = parseSqlDdl(sql);
    expect(result.tables[0].columns.map(c => c.name)).toEqual(['a', 'b', 'c']);
  });
});
