import { describe, expect, it } from 'vitest';
import { detectCodeBlockConversions } from './ExecutableCodeBlock';

describe('code block conversions', () => {
  it('only exposes ERD conversion for schema-shaped SQL or DBML', () => {
    expect(detectCodeBlockConversions('SELECT * FROM users', 'sql')).toEqual([]);
    expect(detectCodeBlockConversions('CREATE TABLE users (id BIGINT PRIMARY KEY);', 'sql')).toEqual(['erd']);
    expect(detectCodeBlockConversions('Table users {\n  id bigint [pk]\n}', 'dbml')).toEqual(['erd']);
    expect(detectCodeBlockConversions('Table users {\n  id bigint [pk]\n}', 'plaintext')).toEqual(['erd']);
    expect(detectCodeBlockConversions('Enum classes_level {\n  "1"\n}', 'dbml')).toEqual(['erd']);
    expect(detectCodeBlockConversions('not a schema', 'dbml')).toEqual([]);
  });

  it('only exposes Flowchart conversion for JSON with nodes', () => {
    expect(detectCodeBlockConversions('{"nodes":[]}', 'json')).toEqual([]);
    expect(detectCodeBlockConversions('{"nodes":[{"id":"start","label":"Start","type":"start"}],"edges":[]}', 'json')).toEqual(['flowchart']);
  });
});
