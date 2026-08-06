import { describe, it, expect } from 'vitest';
import {
  generateAllTablesCode,
  generateAllTablesFiles,
  getExtension,
} from '../sql-generator-all';
import { Node, Edge } from '@xyflow/react';
import { Entity, Column } from '@/types';

function makeNode(
  id: string,
  name: string,
  columns: Partial<Column>[] = [],
): Node<Entity> {
  return {
    id,
    type: 'entity',
    position: { x: 0, y: 0 },
    data: {
      id,
      name,
      x: 0,
      y: 0,
      color: '#6366f1',
      columns: columns.map((c, i) => ({
        id: c.id || String(i),
        name: c.name || `col_${i}`,
        type: 'BIGINT',
        is_pk: false,
        is_nullable: true,
        ...c,
      })) as Column[],
    },
  };
}

function makeEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
  data?: Record<string, unknown>,
): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: sourceHandle || 'col-0-source',
    targetHandle: targetHandle || 'col-0-target',
    type: 'smoothstep',
    data,
  };
}

describe('getExtension', () => {
  it('returns "sql" for MySQL and PostgreSQL', () => {
    expect(getExtension('mysql')).toBe('sql');
    expect(getExtension('postgresql')).toBe('sql');
  });

  it('returns "php" for Laravel formats', () => {
    expect(getExtension('laravel_migration')).toBe('php');
    expect(getExtension('laravel_model')).toBe('php');
  });

  it('returns "ts" for TypeScript and Zod', () => {
    expect(getExtension('typescript')).toBe('ts');
    expect(getExtension('zod')).toBe('ts');
  });

  it('returns "prisma" for Prisma', () => {
    expect(getExtension('prisma')).toBe('prisma');
  });
});

describe('generateAllTablesCode', () => {
  const nodes = [
    makeNode('users', 'users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'name', type: 'VARCHAR(255)' },
    ]),
    makeNode('posts', 'posts', [
      { name: 'id', type: 'BIGINT', is_pk: true },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'user_id', type: 'BIGINT' },
    ]),
  ];

  const edges = [
    makeEdge('posts', 'users', 'col-2-source', 'col-0-target'),
  ];

  it('generates MySQL code with header and FK', () => {
    const code = generateAllTablesCode('mysql', nodes, edges, 'my_erd');
    expect(code).toContain('-- ERD Export: my_erd');
    expect(code).toContain('-- Dialect: MySQL');
    expect(code).toContain('CREATE TABLE `users`');
    expect(code).toContain('CREATE TABLE `posts`');
    expect(code).toContain('ALTER TABLE');
  });

  it('generates PostgreSQL code with header and FK', () => {
    const code = generateAllTablesCode('postgresql', nodes, edges, 'my_erd');
    expect(code).toContain('-- ERD Export: my_erd');
    expect(code).toContain('-- Dialect: PostgreSQL');
    expect(code).toContain('CREATE TABLE "users"');
    expect(code).toContain('CREATE TABLE "posts"');
    expect(code).toContain('ALTER TABLE');
  });

  it('exports FK actions and custom constraint names', () => {
    const code = generateAllTablesCode('postgresql', nodes, [
      makeEdge('posts', 'users', 'col-2-source', 'col-0-target', {
        on_delete: 'CASCADE',
        on_update: 'SET NULL',
        constraint_name: 'posts_user_id_fk',
      }),
    ], 'my_erd');
    expect(code).toContain('ADD CONSTRAINT "posts_user_id_fk"');
    expect(code).toContain('ON DELETE CASCADE ON UPDATE SET NULL');
  });

  it('generates Prisma code with generator and datasource blocks', () => {
    const code = generateAllTablesCode('prisma', nodes, edges, 'my_erd');
    expect(code).toContain('generator client');
    expect(code).toContain('datasource db');
    expect(code).toContain('model User');
    expect(code).toContain('model Post');
  });

  it('generates TypeScript interfaces', () => {
    const code = generateAllTablesCode('typescript', nodes, edges, 'my_erd');
    expect(code).toContain('export interface User');
    expect(code).toContain('export interface Post');
  });

  it('generates Laravel migrations', () => {
    const code = generateAllTablesCode('laravel_migration', nodes, edges, 'my_erd');
    expect(code).toContain('Schema::create');
  });

  it('generates Laravel models', () => {
    const code = generateAllTablesCode('laravel_model', nodes, edges, 'my_erd');
    expect(code).toContain('class User extends Model');
    expect(code).toContain('class Post extends Model');
  });

  it('generates Zod schemas', () => {
    const code = generateAllTablesCode('zod', nodes, edges, 'my_erd');
    expect(code).toContain('export const userSchema = z.object({');
    expect(code).toContain('export const postSchema = z.object({');
  });
});

describe('generateAllTablesFiles', () => {
  const nodes = [
    makeNode('users', 'users', [
      { name: 'id', type: 'BIGINT', is_pk: true },
    ]),
  ];

  it('returns single .sql file for MySQL', () => {
    const files = generateAllTablesFiles('mysql', nodes, [], 'my_erd');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('my_erd.sql');
  });

  it('returns single .sql file for PostgreSQL', () => {
    const files = generateAllTablesFiles('postgresql', nodes, [], 'my_erd');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('my_erd.sql');
  });

  it('returns one .php file per entity for Laravel models', () => {
    const files = generateAllTablesFiles('laravel_model', nodes, [], 'my_erd');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toContain('.php');
  });

  it('returns one .ts file per entity for TypeScript', () => {
    const files = generateAllTablesFiles('typescript', nodes, [], 'my_erd');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toContain('.ts');
  });

  it('returns one .ts file per entity for Zod', () => {
    const files = generateAllTablesFiles('zod', nodes, [], 'my_erd');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toContain('Schema.ts');
  });

  it('returns single .prisma file for Prisma', () => {
    const files = generateAllTablesFiles('prisma', nodes, [], 'my_erd');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('schema.prisma');
  });

  it('returns per-table migration files with timestamps', () => {
    const nodes2 = [
      makeNode('users', 'users', [
        { name: 'id', type: 'BIGINT', is_pk: true },
      ]),
      makeNode('posts', 'posts', [
        { name: 'id', type: 'BIGINT', is_pk: true },
      ]),
    ];

    const files = generateAllTablesFiles('laravel_migration', nodes2, [], 'my_erd');
    expect(files).toHaveLength(2);
    expect(files[0].filename).toContain('create_users_table.php');
    expect(files[1].filename).toContain('create_posts_table.php');
    // Both should be in migrations/ subfolder
    expect(files[0].filename).toMatch(/^migrations\/.*\.php$/);
  });

  it('includes FK constraints in migration', () => {
    const nodes2 = [
      makeNode('users', 'users', [
        { name: 'id', type: 'BIGINT', is_pk: true },
      ]),
      makeNode('posts', 'posts', [
        { name: 'id', type: 'BIGINT', is_pk: true },
        { name: 'user_id', type: 'BIGINT' },
      ]),
    ];

    const edges2 = [
      makeEdge('posts', 'users', 'col-1-source', 'col-0-target'),
    ];

    const files = generateAllTablesFiles('laravel_migration', nodes2, edges2, 'my_erd');
    // Find the posts migration
    const postsMigration = files.find(f => f.filename.includes('posts'))!;
    expect(postsMigration.content).toContain('foreign(');
    expect(postsMigration.content).toContain('references(');
    expect(postsMigration.content).toContain('on(');
  });
});
