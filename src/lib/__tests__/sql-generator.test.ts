import { describe, it, expect } from 'vitest';
import {
  generateMySQL,
  generatePostgreSQL,
  generateLaravelMigration,
  generateTypeScript,
  generatePrisma,
  generateLaravelModel,
  generateZod,
  toPascalCase,
} from '../sql-generator';
import { Entity, Column } from '@/types';

function makeEntity(
  name: string,
  columns: Partial<Column>[],
): Entity {
  return {
    id: name.toLowerCase(),
    name,
    x: 0,
    y: 0,
    color: '#6366f1',
    columns: columns.map((c, i) => ({
      id: `${i}`,
      name: `col_${i}`,
      type: 'VARCHAR(255)',
      is_pk: false,
      is_nullable: true,
      ...c,
    })) as Column[],
  };
}

describe('toPascalCase', () => {
  it('converts snake_case to PascalCase', () => {
    expect(toPascalCase('user_profiles')).toBe('UserProfiles');
  });

  it('converts single word', () => {
    expect(toPascalCase('users')).toBe('Users');
  });

  it('singularizes when flag is true', () => {
    expect(toPascalCase('users', true)).toBe('User');
    expect(toPascalCase('categories', true)).toBe('Category');
    expect(toPascalCase('addresses', true)).toBe('Address');
  });

  it('does not singularize when flag is false', () => {
    expect(toPascalCase('users', false)).toBe('Users');
  });
});

describe('generateMySQL', () => {
  it('generates CREATE TABLE with columns', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'name', type: 'VARCHAR(255)' },
    ]);

    const sql = generateMySQL(entity);
    expect(sql).toContain('CREATE TABLE `users`');
    expect(sql).toContain('`id` BIGINT');
    expect(sql).toContain('`name` VARCHAR(255)');
    expect(sql).toContain('PRIMARY KEY');
    expect(sql).toContain('ENGINE=InnoDB');
  });

  it('marks nullable columns as NULL', () => {
    const entity = makeEntity('test', [
      { name: 'val', type: 'TEXT', is_nullable: true },
    ]);

    const sql = generateMySQL(entity);
    expect(sql).toContain('NULL');
  });

  it('marks NOT NULL columns correctly', () => {
    const entity = makeEntity('test', [
      { name: 'val', type: 'TEXT', is_nullable: false },
    ]);

    const sql = generateMySQL(entity);
    expect(sql).toContain('NOT NULL');
  });

  it('maps type to MySQL equivalents', () => {
    const entity = makeEntity('test', [
      { name: 'is_active', type: 'BOOLEAN' },
      { name: 'meta', type: 'JSON' },
    ]);

    const sql = generateMySQL(entity);
    expect(sql).toContain('TINYINT(1)'); // boolean
    expect(sql).toContain('JSON');
  });

  it('exports column comments and max length', () => {
    const entity = makeEntity('users', [
      { name: 'email', type: 'VARCHAR', is_nullable: false, max_length: 100, comment: 'Harus unik' },
    ]);

    const sql = generateMySQL(entity);
    expect(sql).toContain("`email` VARCHAR(100) NOT NULL COMMENT 'Harus unik'");
  });

  it('exports decimal precision and scale', () => {
    const entity = makeEntity('orders', [
      { name: 'amount', type: 'DECIMAL', is_nullable: false, numeric_precision: 12, numeric_scale: 4 },
    ]);

    const sql = generateMySQL(entity);
    expect(sql).toContain('`amount` DECIMAL(12,4) NOT NULL');
  });
});

describe('generatePostgreSQL', () => {
  it('generates CREATE TABLE with quoted identifiers', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
    ]);

    const sql = generatePostgreSQL(entity);
    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain('BIGSERIAL');
    expect(sql).toContain('PRIMARY KEY');
  });

  it('converts PK BIGINT to BIGSERIAL', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
    ]);

    const sql = generatePostgreSQL(entity);
    expect(sql).toContain('BIGSERIAL');
  });

  it('converts PK INTEGER to SERIAL', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'INTEGER', is_pk: true },
    ]);

    const sql = generatePostgreSQL(entity);
    expect(sql).toContain('SERIAL');
  });

  it('exports PostgreSQL comments and max length', () => {
    const entity = makeEntity('users', [
      { name: 'email', type: 'VARCHAR', is_nullable: false, max_length: 100, comment: 'Harus unik' },
    ]);

    const sql = generatePostgreSQL(entity);
    expect(sql).toContain('"email" VARCHAR(100) NOT NULL');
    expect(sql).toContain('COMMENT ON COLUMN "users"."email" IS \'Harus unik\';');
  });

  it('handles ENUM with CHECK constraint', () => {
    const entity = makeEntity('users', [
      { name: 'status', type: 'ENUM', enum_values: 'active, inactive, pending' },
    ]);

    const sql = generatePostgreSQL(entity);
    expect(sql).toContain('CHECK');
    expect(sql).toContain("'active'");
    expect(sql).toContain("'inactive'");
    expect(sql).toContain("'pending'");
  });

  it('maps boolean to BOOLEAN', () => {
    const entity = makeEntity('test', [
      { name: 'flag', type: 'BOOLEAN' },
    ]);

    const sql = generatePostgreSQL(entity);
    expect(sql).toContain('BOOLEAN');
  });
});

describe('generateLaravelMigration', () => {
  it('generates Schema::create with id()', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'name', type: 'VARCHAR(255)' },
    ]);

    const migration = generateLaravelMigration(entity);
    expect(migration).toContain("Schema::create('users'");
    expect(migration).toContain('$table->id()');
    expect(migration).toContain('$table->string(');
  });

  it('adds timestamps() when no created_at column', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
    ]);

    const migration = generateLaravelMigration(entity);
    expect(migration).toContain('timestamps()');
  });

  it('skips timestamps() when created_at exists', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'created_at', type: 'TIMESTAMP' },
    ]);

    const migration = generateLaravelMigration(entity);
    expect(migration).not.toContain('$table->timestamps()');
  });

  it('adds softDeletes when deleted_at column exists', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'deleted_at', type: 'TIMESTAMP' },
    ]);

    const migration = generateLaravelMigration(entity);
    expect(migration).toContain('softDeletes()');
  });

  it('includes FK constraints when provided', () => {
    const entity = makeEntity('posts', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'user_id', type: 'BIGINT' },
    ]);

    const fkConstraints = [
      { column: 'user_id', references: 'id', on: 'users' },
    ];

    const migration = generateLaravelMigration(entity, fkConstraints);
    expect(migration).toContain("foreign('user_id')");
    expect(migration).toContain("references('id')");
    expect(migration).toContain("on('users')");
  });
});

describe('generateTypeScript', () => {
  it('generates interface with correct name', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
    ]);

    const ts = generateTypeScript(entity);
    expect(ts).toContain('export interface User');
  });

  it('maps BIGINT to number', () => {
    const entity = makeEntity('test', [
      { name: 'count', type: 'BIGINT', is_nullable: false },
    ]);

    const ts = generateTypeScript(entity);
    expect(ts).toContain('count: number');
  });

  it('maps BOOLEAN to boolean', () => {
    const entity = makeEntity('test', [
      { name: 'flag', type: 'BOOLEAN', is_nullable: false },
    ]);

    const ts = generateTypeScript(entity);
    expect(ts).toContain('flag: boolean');
  });

  it('makes nullable properties optional', () => {
    const entity = makeEntity('test', [
      { name: 'bio', type: 'TEXT', is_nullable: true },
    ]);

    const ts = generateTypeScript(entity);
    expect(ts).toContain('bio?: string | null');
  });

  it('adds created_at/updated_at when missing', () => {
    const entity = makeEntity('test', [
      { name: 'id', type: 'BIGINT' },
    ]);

    const ts = generateTypeScript(entity);
    expect(ts).toContain('created_at: string;');
    expect(ts).toContain('updated_at: string;');
  });
});

describe('generatePrisma', () => {
  it('generates model with correct name', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false },
    ]);

    const prisma = generatePrisma(entity);
    expect(prisma).toContain('model User');
    expect(prisma).toContain('id BigInt @id');
  });

  it('adds @default(autoincrement()) for Int PK', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'INT', is_pk: true },
    ]);

    const prisma = generatePrisma(entity);
    expect(prisma).toContain('@id @default(autoincrement())');
  });

  it('adds DateTime for timestamp types', () => {
    const entity = makeEntity('test', [
      { name: 'created_at', type: 'TIMESTAMP' },
    ]);

    const prisma = generatePrisma(entity);
    expect(prisma).toContain('created_at DateTime');
  });

  it('appends created_at/updated_at when missing', () => {
    const entity = makeEntity('test', [
      { name: 'id', type: 'INT', is_pk: true },
    ]);

    const prisma = generatePrisma(entity);
    expect(prisma).toContain('created_at DateTime @default(now())');
    expect(prisma).toContain('updated_at DateTime @updatedAt');
  });

  it('generates enum for ENUM type', () => {
    const entity = makeEntity('test', [
      { name: 'status', type: 'ENUM', enum_values: 'active, inactive' },
    ]);

    const prisma = generatePrisma(entity);
    expect(prisma).toContain('enum Statu');
    expect(prisma).toContain('ACTIVE');
    expect(prisma).toContain('INACTIVE');
  });
});

describe('generateLaravelModel', () => {
  it('generates model class with fillable', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'name', type: 'VARCHAR(255)' },
    ]);

    const model = generateLaravelModel(entity);
    expect(model).toContain('class User extends Model');
    expect(model).toContain('$fillable');
    expect(model).toContain("'name'");
  });

  it('adds explicit $table when name differs from PascalCase', () => {
    const entity = makeEntity('user_profiles', [
      { name: 'id', type: 'BIGINT', is_pk: true },
    ]);

    const model = generateLaravelModel(entity);
    expect(model).toContain("$table = 'user_profiles'");
  });

  it('does not add $table when name matches PascalCase', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
    ]);

    const model = generateLaravelModel(entity);
    expect(model).not.toContain('$table');
  });

  it('adds casts for datetime and json columns', () => {
    const entity = makeEntity('test', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'meta', type: 'JSON' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ]);

    const model = generateLaravelModel(entity);
    expect(model).toContain("'meta' => 'array'");
    expect(model).toContain("'created_at' => 'datetime'");
  });

  it('adds hashed cast for password column', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'password', type: 'VARCHAR(255)' },
    ]);

    const model = generateLaravelModel(entity);
    expect(model).toContain("'password' => 'hashed'");
  });
});

describe('generateZod', () => {
  it('generates z.object schema', () => {
    const entity = makeEntity('users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'email', type: 'VARCHAR(255)' },
    ]);

    const zod = generateZod(entity);
    expect(zod).toContain("import { z } from 'zod'");
    expect(zod).toContain('export const userSchema = z.object({');
    expect(zod).toContain('export type User = z.infer<typeof userSchema>');
  });

  it('maps UUID to z.string().uuid()', () => {
    const entity = makeEntity('test', [
      { name: 'id', type: 'UUID', is_pk: true },
    ]);

    const zod = generateZod(entity);
    expect(zod).toContain('z.string().uuid()');
  });

  it('maps INTEGER to z.number().int()', () => {
    const entity = makeEntity('test', [
      { name: 'count', type: 'INTEGER' },
    ]);

    const zod = generateZod(entity);
    expect(zod).toContain('z.number().int()');
  });

  it('maps BOOLEAN to z.boolean()', () => {
    const entity = makeEntity('test', [
      { name: 'flag', type: 'BOOLEAN' },
    ]);

    const zod = generateZod(entity);
    expect(zod).toContain('z.boolean()');
  });

  it('adds .nullable().optional() for nullable columns', () => {
    const entity = makeEntity('test', [
      { name: 'bio', type: 'TEXT', is_nullable: true },
    ]);

    const zod = generateZod(entity);
    expect(zod).toContain('.nullable().optional()');
  });

  it('generates z.enum for ENUM type', () => {
    const entity = makeEntity('test', [
      { name: 'status', type: 'ENUM', enum_values: 'active, inactive' },
    ]);

    const zod = generateZod(entity);
    expect(zod).toContain("z.enum(['active', 'inactive'])");
  });
});
