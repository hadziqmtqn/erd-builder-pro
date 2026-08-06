import { Node, Edge } from '@xyflow/react';
import {
  generateMySQL,
  generatePostgreSQL,
  generateLaravelMigration,
  generateTypeScript,
  generatePrisma,
  generateLaravelModel,
  generateZod,
  generateGoravelModel,
  generateGoravelMigration,
  toPascalCase,
  ForeignKeyConstraint,
} from './sql-generator';
import { Entity } from '@/types';
import { getForeignKeyConstraintName } from './diagram-payload';

export type AllExportFormat =
  | 'mysql'
  | 'postgresql'
  | 'laravel_migration'
  | 'laravel_model'
  | 'typescript'
  | 'prisma'
  | 'zod'
  | 'goravel'
  | 'goravel_migration';

export interface ExportFile {
  filename: string;
  content: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function generateAllTablesCode(
  format: AllExportFormat,
  nodes: Node<Entity>[],
  edges: Edge[],
  fileName: string
): string {
  const entities: Entity[] = nodes.map(n => n.data);
  const headers: string[] = [];
  const body: string[] = [];

  switch (format) {
    case 'mysql': {
      headers.push(`-- ERD Export: ${fileName}`, `-- Dialect: MySQL`, ``);
      entities.forEach(entity => {
        body.push(generateMySQL(entity));
      });
      body.push('');
      body.push(generateAlterTableFKs(entities, edges, 'mysql'));
      break;
    }
    case 'postgresql': {
      headers.push(`-- ERD Export: ${fileName}`, `-- Dialect: PostgreSQL`, ``);
      entities.forEach(entity => {
        body.push(generatePostgreSQL(entity));
      });
      body.push('');
      body.push(generateAlterTableFKs(entities, edges, 'postgresql'));
      break;
    }
    case 'laravel_migration': {
      headers.push(`<?php`, ``, `// ERD Export: ${fileName}`, `// Generate all migrations for each table`, ``);
      const entityFkMap = buildEntityFkMap(entities, edges);
      entities.forEach((entity, i) => {
        if (i > 0) body.push('');
        body.push(generateLaravelMigration(entity, entityFkMap.get(entity.id)));
      });
      break;
    }
    case 'laravel_model': {
      entities.forEach((entity, i) => {
        if (i > 0) body.push('');
        body.push(generateLaravelModel(entity));
      });
      break;
    }
    case 'typescript': {
      headers.push(`// ERD Export: ${fileName}`, `// TypeScript Interfaces`, ``);
      entities.forEach((entity, i) => {
        if (i > 0) body.push('');
        body.push(generateTypeScript(entity));
      });
      break;
    }
    case 'prisma': {
      headers.push(`// ERD Export: ${fileName}`, `// Prisma Schema`, ``);
      headers.push(`generator client {`, `  provider = "prisma-client-js"`, `}`, ``);
      headers.push(`datasource db {`, `  provider = "postgresql"`, `  url      = env("DATABASE_URL")`, `}`, ``);
      entities.forEach((entity, i) => {
        if (i > 0) body.push('');
        body.push(generatePrisma(entity));
      });
      break;
    }
    case 'zod': {
      headers.push(`// ERD Export: ${fileName}`, `// Zod Schemas`, ``);
      entities.forEach((entity, i) => {
        if (i > 0) body.push('');
        body.push(generateZod(entity));
      });
      break;
    }
    case 'goravel': {
      headers.push(`// ERD Export: ${fileName}`, `// Goravel Models`, ``);
      entities.forEach((entity, i) => {
        if (i > 0) body.push('');
        body.push(generateGoravelModel(entity));
      });
      break;
    }
    case 'goravel_migration': {
      headers.push(`// ERD Export: ${fileName}`, `// Goravel Migrations`, ``);
      entities.forEach((entity, i) => {
        if (i > 0) body.push('');
        body.push(generateGoravelMigration(entity));
      });
      break;
    }
  }

  return [...headers, ...body].join('\n');
}

function buildEntityFkMap(entities: Entity[], edges: Edge[]): Map<string, ForeignKeyConstraint[]> {
  const entityMap = new Map(entities.map(e => [e.id, e]));
  const fkMap = new Map<string, ForeignKeyConstraint[]>();
  const seen = new Set<string>();

  edges.forEach(edge => {
    const sourceEntity = entityMap.get(edge.source);
    const targetEntity = entityMap.get(edge.target);
    if (!sourceEntity || !targetEntity) return;

    const sourceColId = edge.sourceHandle?.replace('col-', '').replace('-source-l', '').replace('-source', '');
    const targetColId = edge.targetHandle?.replace('col-', '').replace('-target-r', '').replace('-target', '');
    const sourceColumn = sourceEntity.columns.find(c => c.id === sourceColId);
    const targetColumn = targetEntity.columns.find(c => c.id === targetColId);
    if (!sourceColumn || !targetColumn) return;

    const key = `${sourceEntity.id}:${sourceColumn.name}`;
    if (seen.has(key)) return;
    seen.add(key);

    const existing = fkMap.get(sourceEntity.id) || [];
    const relation = (edge.data || {}) as Record<string, unknown>;
    existing.push({
      column: sourceColumn.name,
      references: targetColumn.name,
      on: targetEntity.name.toLowerCase(),
      onDelete: typeof relation.on_delete === 'string' ? relation.on_delete : null,
      onUpdate: typeof relation.on_update === 'string' ? relation.on_update : null,
      constraintName: typeof relation.constraint_name === 'string' ? relation.constraint_name : null,
    });
    fkMap.set(sourceEntity.id, existing);
  });

  return fkMap;
}

export function generateAllTablesFiles(
  format: AllExportFormat,
  nodes: Node<Entity>[],
  edges: Edge[],
  fileName: string
): ExportFile[] {
  const entities: Entity[] = nodes.map(n => n.data);
  const files: ExportFile[] = [];

  switch (format) {
    case 'mysql':
    case 'postgresql': {
      return [{ filename: `${fileName}.sql`, content: generateAllTablesCode(format, nodes, edges, fileName) }];
    }
    case 'laravel_migration': {
      const entityFkMap = buildEntityFkMap(entities, edges);
      const entityCount = entities.length;
      const padLen = String(entityCount).length;
      entities.forEach((entity, i) => {
        const ts = new Date();
        const seq = String(i + 1).padStart(padLen, '0');
        const timestamp = `${ts.getFullYear()}_${pad(ts.getMonth() + 1)}_${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${seq}`;
        const filename = `${timestamp}_create_${entity.name.toLowerCase()}_table.php`;
        const fkConstraints = entityFkMap.get(entity.id);
        files.push({ filename: `migrations/${filename}`, content: `<?php\n\n${generateLaravelMigration(entity, fkConstraints)}` });
      });
      break;
    }
    case 'laravel_model': {
      entities.forEach(entity => {
        const className = toPascalCase(entity.name, true);
        files.push({ filename: `models/${className}.php`, content: `<?php\n\n${generateLaravelModel(entity)}` });
      });
      break;
    }
    case 'typescript': {
      entities.forEach(entity => {
        const className = toPascalCase(entity.name, true);
        files.push({ filename: `${className}.ts`, content: generateTypeScript(entity) });
      });
      break;
    }
    case 'prisma': {
      const body = entities.map(e => generatePrisma(e)).join('\n\n');
      files.push({
        filename: 'schema.prisma',
        content: [
          `// ERD Export: ${fileName}`,
          `// Prisma Schema`,
          ``,
          `generator client {`,
          `  provider = "prisma-client-js"`,
          `}`,
          ``,
          `datasource db {`,
          `  provider = "postgresql"`,
          `  url      = env("DATABASE_URL")`,
          `}`,
          ``,
          body,
        ].join('\n'),
      });
      break;
    }
    case 'zod': {
      entities.forEach(entity => {
        const className = toPascalCase(entity.name, true);
        files.push({ filename: `${className}Schema.ts`, content: generateZod(entity) });
      });
      break;
    }
    case 'goravel': {
      entities.forEach(entity => {
        const structName = toPascalCase(entity.name, true);
        files.push({ filename: `models/${structName}.go`, content: generateGoravelModel(entity) });
      });
      break;
    }
    case 'goravel_migration': {
      const entityFkMap = buildEntityFkMap(entities, edges);
      entities.forEach(entity => {
        const fkConstraints = entityFkMap.get(entity.id);
        files.push({ filename: `migrations/create_${entity.name.toLowerCase()}_table.go`, content: generateGoravelMigration(entity, fkConstraints) });
      });
      break;
    }
  }

  return files;
}

function generateAlterTableFKs(
  entities: Entity[],
  edges: Edge[],
  dialect: 'mysql' | 'postgresql'
): string {
  const entityMap = new Map(entities.map(e => [e.id, e]));
  const fkLines: string[] = [];
  const seen = new Set<string>();

  edges.forEach(edge => {
    const sourceEntity = entityMap.get(edge.source);
    const targetEntity = entityMap.get(edge.target);
    if (!sourceEntity || !targetEntity) return;

    const sourceColId = edge.sourceHandle?.replace('col-', '').replace('-source-l', '').replace('-source', '');
    const targetColId = edge.targetHandle?.replace('col-', '').replace('-target-r', '').replace('-target', '');
    const sourceColumn = sourceEntity.columns.find(c => c.id === sourceColId);
    const targetColumn = targetEntity.columns.find(c => c.id === targetColId);
    if (!sourceColumn || !targetColumn) return;

    const key = `${sourceEntity.name}.${sourceColumn.name}->${targetEntity.name}.${targetColumn.name}`;
    if (seen.has(key)) return;
    seen.add(key);

    const relation = (edge.data || {}) as Record<string, unknown>;
    const constraintName = relation.constraint_name
      ? String(relation.constraint_name)
      : getForeignKeyConstraintName(sourceEntity.name, sourceColumn.name);
    const quote = dialect === 'mysql' ? '`' : '"';
    const action = (value: unknown, keyword: string) => {
      const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
      return normalized && normalized !== 'NO ACTION' ? ` ON ${keyword} ${normalized}` : '';
    };
    fkLines.push(
      `ALTER TABLE ${quote}${sourceEntity.name}${quote} ADD CONSTRAINT ${quote}${constraintName}${quote} FOREIGN KEY (${quote}${sourceColumn.name}${quote}) REFERENCES ${quote}${targetEntity.name}${quote}(${quote}${targetColumn.name}${quote})${action(relation.on_delete, 'DELETE')}${action(relation.on_update, 'UPDATE')};`
    );
  });

  return fkLines.join('\n');
}

export function getExtension(format: AllExportFormat): string {
  const map: Record<string, string> = {
    mysql: 'sql',
    postgresql: 'sql',
    laravel_migration: 'php',
    laravel_model: 'php',
    typescript: 'ts',
    prisma: 'prisma',
    zod: 'ts',
    goravel: 'go',
    goravel_migration: 'go',
  };
  return map[format] || 'txt';
}
