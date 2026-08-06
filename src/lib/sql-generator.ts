import { Entity } from '../types';
import { supportsColumnLength } from './column-metadata';

export type SQLType = 'mysql' | 'postgresql' | 'laravel';

export interface ForeignKeyConstraint {
  column: string;
  references: string;
  on: string;
  onDelete?: string | null;
  onUpdate?: string | null;
  constraintName?: string | null;
}

type SQLDialect = 'mysql' | 'postgresql';

function quoteIdentifier(value: string, dialect: SQLDialect): string {
  const quote = dialect === 'mysql' ? '`' : '"';
  return `${quote}${value.replace(new RegExp(quote, 'g'), `${quote}${quote}`)}${quote}`;
}

function metadataColumns(entity: Entity, columnIds: string[]): string[] {
  return columnIds
    .map(id => entity.columns.find(column => column.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function metadataName(name: string | null | undefined, fallback: string): string {
  return (name || fallback).replace(/\s+/g, '_');
}

function tableMetadataSQL(entity: Entity, dialect: SQLDialect): string {
  const table = quoteIdentifier(entity.name.toLowerCase(), dialect);
  const statements: string[] = [];
  const columnUnique = new Set(entity.columns.filter(column => column.is_unique).map(column => column.name));
  const columnPrimary = new Set(entity.columns.filter(column => column.is_pk).map(column => column.name));

  for (const constraint of entity.constraints || []) {
    const columns = metadataColumns(entity, constraint.column_ids || []);
    if (columns.length === 0) continue;
    const columnList = columns.map(column => quoteIdentifier(column, dialect)).join(', ');
    const name = quoteIdentifier(metadataName(constraint.name, `${entity.name}_${constraint.kind}_${columns.join('_')}`), dialect);
    if (constraint.kind === 'primary_key') {
      if (columns.length === 1 && columnPrimary.has(columns[0])) continue;
      statements.push(`ALTER TABLE ${table} ADD CONSTRAINT ${name} PRIMARY KEY (${columnList});`);
    } else if (constraint.kind === 'unique') {
      if (columns.length === 1 && columnUnique.has(columns[0])) continue;
      statements.push(`ALTER TABLE ${table} ADD CONSTRAINT ${name} UNIQUE (${columnList});`);
    } else if (constraint.kind === 'check' && constraint.expression) {
      statements.push(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${constraint.expression});`);
    }
  }

  for (const index of entity.indexes || []) {
    const columns = metadataColumns(entity, index.column_ids || []);
    if (columns.length === 0) continue;
    if (columns.length === 1 && index.is_unique && columnUnique.has(columns[0])) continue;
    const name = quoteIdentifier(metadataName(index.name, `${entity.name}_${index.is_unique ? 'unique' : 'idx'}_${columns.join('_')}`), dialect);
    const unique = index.is_unique ? 'UNIQUE ' : '';
    const algorithm = index.algorithm ? String(index.algorithm).toUpperCase() : '';
    const using = algorithm && dialect === 'mysql' ? ` USING ${algorithm}` : '';
    const postgresUsing = algorithm && dialect === 'postgresql' ? ` USING ${algorithm.toLowerCase()}` : '';
    statements.push(`CREATE ${unique}INDEX ${name}${using} ON ${table}${postgresUsing} (${columns.map(column => quoteIdentifier(column, dialect)).join(', ')});`);
  }

  return statements.join('\n');
}

function tableMetadataLaravel(entity: Entity): string {
  const lines: string[] = [];
  const columnUnique = new Set(entity.columns.filter(column => column.is_unique).map(column => column.name));
  const columnPrimary = new Set(entity.columns.filter(column => column.is_pk).map(column => column.name));
  const columns = (ids: string[]) => metadataColumns(entity, ids).map(name => `'${name.replace(/'/g, "\\'")}'`).join(', ');
  const named = (name: string | null | undefined) => name ? `, '${name.replace(/'/g, "\\'")}'` : '';

  for (const constraint of entity.constraints || []) {
    const names = metadataColumns(entity, constraint.column_ids || []);
    if (names.length === 0) continue;
    if (constraint.kind === 'primary_key' && !(names.length === 1 && columnPrimary.has(names[0]))) {
      lines.push(`    $table->primary([${columns(constraint.column_ids || [])}]${named(constraint.name)});`);
    } else if (constraint.kind === 'unique' && !(names.length === 1 && columnUnique.has(names[0]))) {
      lines.push(`    $table->unique([${columns(constraint.column_ids || [])}]${named(constraint.name)});`);
    }
  }

  for (const index of entity.indexes || []) {
    const names = metadataColumns(entity, index.column_ids || []);
    if (names.length === 0 || (names.length === 1 && index.is_unique && columnUnique.has(names[0]))) continue;
    const method = index.is_unique ? 'unique' : 'index';
    lines.push(`    $table->${method}([${columns(index.column_ids || [])}]${named(index.name)});`);
  }

  return lines.join('\n');
}

function tableMetadataPrisma(entity: Entity): string[] {
  const lines: string[] = [];
  const columnUnique = new Set(entity.columns.filter(column => column.is_unique).map(column => column.name));
  const columnPrimary = new Set(entity.columns.filter(column => column.is_pk).map(column => column.name));
  const columns = (ids: string[]) => metadataColumns(entity, ids).join(', ');
  const mapped = (name: string | null | undefined) => name ? `, map: "${name.replace(/"/g, '\\"')}"` : '';

  for (const constraint of entity.constraints || []) {
    const names = metadataColumns(entity, constraint.column_ids || []);
    if (names.length === 0) continue;
    if (constraint.kind === 'primary_key' && !(names.length === 1 && columnPrimary.has(names[0]))) {
      lines.push(`  @@id([${columns(constraint.column_ids || [])}]${mapped(constraint.name)})`);
    } else if (constraint.kind === 'unique' && !(names.length === 1 && columnUnique.has(names[0]))) {
      lines.push(`  @@unique([${columns(constraint.column_ids || [])}]${mapped(constraint.name)})`);
    }
  }

  for (const index of entity.indexes || []) {
    const names = metadataColumns(entity, index.column_ids || []);
    if (names.length === 0 || (names.length === 1 && index.is_unique && columnUnique.has(names[0]))) continue;
    lines.push(`  @@${index.is_unique ? 'unique' : 'index'}([${columns(index.column_ids || [])}]${mapped(index.name)})`);
  }

  return lines;
}

function tableMetadataGoravel(entity: Entity): string[] {
  const lines: string[] = [];
  const columnUnique = new Set(entity.columns.filter(column => column.is_unique).map(column => column.name));
  const columnPrimary = new Set(entity.columns.filter(column => column.is_pk).map(column => column.name));
  const args = (names: string[]) => names.map(name => `"${name.replace(/"/g, '\\"')}"`).join(', ');

  for (const column of entity.columns) {
    if (column.is_unique && !column.is_pk) lines.push(`      table.Unique("${column.name.replace(/"/g, '\\"')}")`);
  }
  for (const constraint of entity.constraints || []) {
    const names = metadataColumns(entity, constraint.column_ids || []);
    if (names.length === 0) continue;
    if (constraint.kind === 'primary_key' && !(names.length === 1 && names[0] === 'id' && columnPrimary.has(names[0]))) {
      lines.push(`      table.Primary(${args(names)})`);
    } else if (constraint.kind === 'unique' && !(names.length === 1 && columnUnique.has(names[0]))) {
      lines.push(`      table.Unique(${args(names)})`);
    }
  }
  for (const index of entity.indexes || []) {
    const names = metadataColumns(entity, index.column_ids || []);
    if (names.length === 0 || (names.length === 1 && index.is_unique && columnUnique.has(names[0]))) continue;
    lines.push(`      table.${index.is_unique ? 'Unique' : 'Index'}(${args(names)})`);
  }
  return lines;
}

function mapType(type: string, target: SQLType, maxLength?: number | null, precision?: number | null, scale?: number | null): string {
  const t = type.toLowerCase();
  const decimal = precision ? `DECIMAL(${precision}${scale !== null && scale !== undefined ? `,${scale}` : ''})` : 'DECIMAL(10,2)';
  
  if (target === 'mysql') {
    switch (t) {
      case 'varchar': return `VARCHAR(${maxLength || 255})`;
      case 'integer':
      case 'int': return 'INT';
      case 'bigint': return 'BIGINT';
      case 'text': return 'TEXT';
      case 'longtext': return 'LONGTEXT';
      case 'boolean':
      case 'bool': return 'TINYINT(1)';
      case 'timestamp': return 'TIMESTAMP';
      case 'datetime': return 'DATETIME';
      case 'date': return 'DATE';
      case 'decimal':
      case 'numeric': return decimal;
      case 'float': return 'FLOAT';
      case 'uuid': return 'VARCHAR(36)';
      case 'ulid': return 'CHAR(26)';
      case 'json': return 'JSON';
      default: return t.toUpperCase();
    }
  }
  
  if (target === 'postgresql') {
    switch (t) {
      case 'varchar': return `VARCHAR(${maxLength || 255})`;
      case 'integer':
      case 'int': return 'INTEGER';
      case 'bigint': return 'BIGINT';
      case 'text': return 'TEXT';
      case 'longtext': return 'TEXT';
      case 'boolean':
      case 'bool': return 'BOOLEAN';
      case 'timestamp': return 'TIMESTAMP';
      case 'datetime': return 'TIMESTAMP';
      case 'date': return 'DATE';
      case 'decimal':
      case 'numeric': return decimal;
      case 'float': return 'REAL';
      case 'uuid': return 'UUID';
      case 'ulid': return 'CHAR(26)';
      case 'json': return 'JSONB';
      default: return t.toUpperCase();
    }
  }

  return t; // Default for others
}

function singularize(str: string): string {
  if (str.endsWith('ies')) {
    return str.slice(0, -3) + 'y';
  }
  if (str.endsWith('ses')) {
    return str.slice(0, -2);
  }
  if (str.endsWith('s') && !str.endsWith('ss')) {
    return str.slice(0, -1);
  }
  return str;
}

export function toPascalCase(str: string, shouldSingularize: boolean = false): string {
  const parts = str.split('_');
  if (shouldSingularize && parts.length > 0) {
    parts[parts.length - 1] = singularize(parts[parts.length - 1]);
  }
  
  return parts
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

export function generateMySQL(entity: Entity): string {
  const tableName = entity.name.toLowerCase();
  const columns = entity.columns.map(col => {
    const type = mapType(col.type, 'mysql', col.max_length, col.numeric_precision, col.numeric_scale);
    const nullable = col.is_nullable ? 'NULL' : 'NOT NULL';
    const pk = col.is_pk ? ' AUTO_INCREMENT PRIMARY KEY' : '';
    const enumValues = col.type.toLowerCase() === 'enum' && col.enum_values 
      ? `ENUM(${col.enum_values.split(',').map(v => `'${v.trim()}'`).join(', ')})`
      : type;
    const defaultValue = col.default_value ? ` DEFAULT ${col.default_value}` : '';
    const unique = col.is_unique ? ' UNIQUE' : '';
    const comment = col.comment ? ` COMMENT '${col.comment.replace(/'/g, "''")}'` : '';
      
    return `  \`${col.name}\` ${enumValues}${defaultValue} ${nullable}${unique}${pk}${comment}`;
  }).join(',\n');

  const tableComment = entity.comment ? ` COMMENT='${entity.comment.replace(/'/g, "''")}'` : '';
  const table = `CREATE TABLE \`${tableName}\` (\n${columns}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${tableComment};`;
  return [table, tableMetadataSQL(entity, 'mysql')].filter(Boolean).join('\n');
}

export function generatePostgreSQL(entity: Entity): string {
  const tableName = entity.name.toLowerCase();
  const comments: string[] = [];
  const columns = entity.columns.map(col => {
    const type = mapType(col.type, 'postgresql', col.max_length, col.numeric_precision, col.numeric_scale);
    const nullable = col.is_nullable ? 'NULL' : 'NOT NULL';
    
    let columnType = type;
    if (col.is_pk && (type === 'INTEGER' || type === 'BIGINT')) {
      columnType = type === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL';
    }

    const pk = col.is_pk ? ' PRIMARY KEY' : '';
    const defaultValue = col.default_value ? ` DEFAULT ${col.default_value}` : '';
    const unique = col.is_unique ? ' UNIQUE' : '';
    
    // Handle ENUM for PG (simplified to CHECK constraint for direct SQL export)
    if (col.type.toLowerCase() === 'enum' && col.enum_values) {
      const values = col.enum_values.split(',').map(v => `'${v.trim()}'`).join(', ');
      if (col.comment) comments.push(`COMMENT ON COLUMN "${tableName}"."${col.name}" IS '${col.comment.replace(/'/g, "''")}';`);
      return `  "${col.name}" VARCHAR(${col.max_length || 255})${defaultValue} ${nullable}${unique}${pk} CHECK ("${col.name}" IN (${values}))`;
    }
      
    if (col.comment) comments.push(`COMMENT ON COLUMN "${tableName}"."${col.name}" IS '${col.comment.replace(/'/g, "''")}';`);
    return `  "${col.name}" ${columnType}${defaultValue} ${nullable}${unique}${pk}`;
  }).join(',\n');

  const table = `CREATE TABLE "${tableName}" (\n${columns}\n);`;
  if (entity.comment) comments.push(`COMMENT ON TABLE "${tableName}" IS '${entity.comment.replace(/'/g, "''")}';`);
  const metadata = tableMetadataSQL(entity, 'postgresql');
  return [table, comments.join('\n'), metadata].filter(Boolean).join('\n\n');
}

export function generateLaravelMigration(entity: Entity, fkConstraints?: ForeignKeyConstraint[]): string {
  const tableName = entity.name.toLowerCase();
  
  const shouldAddTimestamps = !entity.columns.some(c => c.name === 'created_at');
  const hasSoftDeletes = entity.columns.some(c => c.name === 'deleted_at');
  const skipNames = new Set(['created_at', 'updated_at', 'deleted_at']);

  const columns = entity.columns
    .filter(col => !skipNames.has(col.name.toLowerCase()))
    .map(col => {
      const t = col.type.toLowerCase();
      const name = col.name.toLowerCase();
      let method = 'string';
      let args = `'${col.name}'`;

      if (col.is_pk && name === 'id') {
        method = 'id';
        args = '';
      } else {
        switch (t) {
          case 'integer':
          case 'int': method = 'integer'; break;
          case 'bigint': 
            method = (name.endsWith('_id') || col.is_pk) ? 'unsignedBigInteger' : 'bigInteger'; 
            break;
          case 'text': method = 'text'; break;
          case 'longtext': method = 'longText'; break;
          case 'boolean':
          case 'bool': method = 'boolean'; break;
          case 'timestamp': method = 'timestamp'; break;
          case 'datetime': method = 'dateTime'; break;
          case 'date': method = 'date'; break;
          case 'decimal': method = 'decimal'; args = `'${col.name}', ${col.numeric_precision || 10}, ${col.numeric_scale ?? 2}`; break;
          case 'float': method = 'float'; break;
          case 'uuid': method = 'uuid'; break;
          case 'ulid': method = 'ulid'; break;
          case 'json': method = 'json'; break;
          case 'enum': 
            method = 'string';
            args = `'${col.name}'`;
            break;
          default: method = 'string';
        }
      }
      if (method === 'string' && col.max_length && supportsColumnLength(col.type)) args = `'${col.name}', ${col.max_length}`;

      let chain = `$table->${method}(${args})`;
      if (col.is_nullable && !col.is_pk) chain += '->nullable()';
      if (col.is_unique) chain += '->unique()';
      if (col.comment) chain += `->comment('${col.comment.replace(/'/g, "\\'")}')`;
      
      return `    ${chain};`;
    }).join('\n');

  let fkBlock = '';
  if (fkConstraints && fkConstraints.length > 0) {
    const fkLines = fkConstraints
      .filter(fk => entity.columns.some(c => c.name === fk.column))
      .map(fk => {
        const name = fk.constraintName ? `, '${fk.constraintName.replace(/'/g, "\\'")}'` : '';
        const onDelete = fk.onDelete && fk.onDelete.toUpperCase() !== 'NO ACTION' ? `->onDelete('${fk.onDelete.toLowerCase()}')` : '';
        const onUpdate = fk.onUpdate && fk.onUpdate.toUpperCase() !== 'NO ACTION' ? `->onUpdate('${fk.onUpdate.toLowerCase()}')` : '';
        return `    $table->foreign('${fk.column}'${name})->references('${fk.references}')->on('${fk.on}')${onDelete}${onUpdate};`;
      })
      .join('\n');
    if (fkLines) {
      fkBlock = `\n${fkLines}`;
    }
  }

  const metadata = tableMetadataLaravel(entity);
  return `Schema::create('${tableName}', function (Blueprint $table) {
${columns}${metadata ? `\n${metadata}` : ''}${fkBlock}
${hasSoftDeletes ? '    $table->softDeletes();' : ''}${shouldAddTimestamps ? '\n    $table->timestamps();' : ''}
});`;
}

export function generateTypeScript(entity: Entity): string {
  const className = toPascalCase(entity.name, true);
  
  const hasTimestamps = entity.columns.some(c => c.name === 'created_at' || c.name === 'updated_at');
  
  const properties = entity.columns.map(col => {
    const t = col.type.toLowerCase();
    let tsType = 'string';
    
    switch (t) {
      case 'integer':
      case 'int':
      case 'bigint':
      case 'decimal':
      case 'float': tsType = 'number'; break;
      case 'boolean':
      case 'bool': tsType = 'boolean'; break;
      case 'json': tsType = 'any'; break;
      case 'enum': 
        tsType = col.enum_values ? col.enum_values.split(',').map(v => `'${v.trim()}'`).join(' | ') : 'string';
        break;
      default: tsType = 'string';
    }

    const optional = col.is_nullable ? '?' : '';
    const nullable = col.is_nullable ? ' | null' : '';
    
    return `  ${col.name}${optional}: ${tsType}${nullable};`;
  }).join('\n');

  const timestampFields = hasTimestamps ? '' : '\n  created_at: string;\n  updated_at: string;';

  return `export interface ${className} {\n${properties}${timestampFields}\n}`;
}

export function generatePrisma(entity: Entity): string {
  const modelName = toPascalCase(entity.name, true);
  let enums = '';

  const hasCreatedAt = entity.columns.some(c => c.name === 'created_at');
  const hasUpdatedAt = entity.columns.some(c => c.name === 'updated_at');
  
  const fields = entity.columns.map(col => {
    const t = col.type.toLowerCase();
    const name = col.name;
    let prismaType = 'String';
    
    switch (t) {
      case 'integer':
      case 'int': prismaType = 'Int'; break;
      case 'bigint': prismaType = 'BigInt'; break;
      case 'decimal':
      case 'float': prismaType = 'Decimal'; break;
      case 'boolean':
      case 'bool': prismaType = 'Boolean'; break;
      case 'datetime':
      case 'timestamp': prismaType = 'DateTime'; break;
      case 'json': prismaType = 'Json'; break;
      case 'enum': 
        prismaType = toPascalCase(name, true);
        const values = col.enum_values ? col.enum_values.split(',').map(v => `  ${v.trim().toUpperCase()}`).join('\n') : '';
        enums += `\nenum ${prismaType} {\n${values}\n}\n`;
        break;
      default: prismaType = 'String';
    }

    let attributes = '';
    if (col.is_pk) attributes += ' @id';
    if (col.is_pk && (t === 'int' || t === 'integer')) attributes += ' @default(autoincrement())';
    if (col.is_unique && !col.is_pk) attributes += ' @unique';
    if (col.is_nullable) prismaType += '?';
    
    return `  ${name} ${prismaType}${attributes}`;
  }).join('\n');

  const timestampFields = [];
  if (!hasCreatedAt) timestampFields.push('  created_at DateTime @default(now())');
  if (!hasUpdatedAt) timestampFields.push('  updated_at DateTime @updatedAt');
  const timestamps = timestampFields.length > 0 ? `\n${timestampFields.join('\n')}` : '';
  const metadata = tableMetadataPrisma(entity);

  return `model ${modelName} {\n${fields}${timestamps}${metadata.length ? `\n${metadata.join('\n')}` : ''}\n}${enums}`;
}

export function generateLaravelModel(entity: Entity): string {
  const className = toPascalCase(entity.name, true);
  const tableName = entity.name.toLowerCase();
  // Entity name is plural of singularized class name → Laravel auto-resolves
  const needsExplicitTable = singularize(entity.name) !== className.toLowerCase();
  
  const fillable = entity.columns
    .filter(col => !col.is_pk && !['created_at', 'updated_at'].includes(col.name))
    .map(col => `        '${col.name}',`)
    .join('\n');

  const castItems = entity.columns
    .filter(col => {
      const t = col.type.toLowerCase();
      return col.is_nullable || t === 'datetime' || t === 'timestamp' || t === 'json' || col.name === 'password';
    })
    .map(col => {
      const t = col.type.toLowerCase();
      let cast = 'string';
      if (t === 'datetime' || t === 'timestamp') cast = 'datetime';
      if (t === 'json') cast = 'array';
      if (col.name === 'password') cast = 'hashed';
      return `            '${col.name}' => '${cast}',`;
    })
    .join('\n');

  const tableProp = needsExplicitTable
    ? `\n    protected \$table = '${tableName}';\n`
    : '';

  return `namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class ${className} extends Model
{${tableProp}
    protected $fillable = [
${fillable}
    ];

    protected function casts(): array
    {
        return [
${castItems}
        ];
    }
}`;
}

export function generateGoravelModel(entity: Entity): string {
  const structName = toPascalCase(entity.name, true);
  const tableName = entity.name.toLowerCase();

  const fields = entity.columns.map(col => {
    const t = col.type.toLowerCase();
    let goType = 'string';
    let gormTag = '';

    // Skip relation FK column (handled by GORM relation)
    if (col._is_fk && col.name.endsWith('_id') && !col.is_pk) {
      return null;
    }

    switch (t) {
      case 'integer':
      case 'int':
        goType = col.is_pk ? 'uint' : 'int';
        if (col.is_pk) gormTag = '`gorm:"primaryKey"`';
        break;
      case 'bigint':
        goType = col.is_pk ? 'uint64' : 'int64';
        if (col.is_pk) gormTag = '`gorm:"primaryKey"`';
        break;
      case 'text':
      case 'longtext':
        goType = 'string';
        gormTag = '`gorm:"type:text"`';
        break;
      case 'boolean':
      case 'bool':
        goType = 'bool';
        break;
      case 'timestamp':
      case 'datetime':
        goType = 'time.Time';
        gormTag = '`gorm:"autoCreateTime"`';
        if (col.name === 'updated_at') {
          gormTag = '`gorm:"autoUpdateTime"`';
        }
        break;
      case 'date':
        goType = 'time.Time';
        break;
      case 'decimal':
      case 'float':
        goType = 'float64';
        break;
      case 'uuid':
        goType = 'string';
        gormTag = '`gorm:"type:uuid"`';
        break;
      case 'json':
        goType = 'string';
        gormTag = '`gorm:"type:json"`';
        break;
      case 'enum':
        goType = 'string';
        break;
      default:
        goType = 'string';
    }

    // Build gorm tag for non-special types
    if (!gormTag && goType === 'string') {
      let tag = 'type:varchar(255)';
      if (!col.is_nullable && !col.is_pk) tag += ';not null';
      gormTag = '`gorm:"' + tag + '"`';
    } else if (!gormTag && !col.is_pk) {
      let tag = '';
      if (col.is_nullable) tag = 'default:null';
      if (tag) gormTag = '`gorm:"' + tag + '"`';
    }

    const goName = toPascalCase(col.name, false);
    return `    ${goName} ${goType} ${gormTag}`;
  }).filter(Boolean).join('\n');

  return `package models\n\nimport "time"\n\ntype ${structName} struct {\n${fields}\n\n    CreatedAt time.Time\n    UpdatedAt time.Time\n}`;
}

export function generateGoravelMigration(entity: Entity, fkConstraints?: ForeignKeyConstraint[]): string {
  const tableName = entity.name.toLowerCase();
  const pascalName = toPascalCase(entity.name, true);
  const className = `MCreate${pascalName}Table`;

  const shouldAddTimestamps = !entity.columns.some(c => c.name === 'created_at');
  const hasSoftDeletes = entity.columns.some(c => c.name === 'deleted_at');
  const skipNames = new Set(['created_at', 'updated_at', 'deleted_at']);

  const columns = entity.columns
    .filter(col => !skipNames.has(col.name.toLowerCase()))
    .map(col => {
      const t = col.type.toLowerCase();
      const name = col.name.toLowerCase();
      let method = 'String';
      let args: string | null = null;

      if (col.is_pk && name === 'id') {
        method = 'ID';
        args = null;
      } else {
        switch (t) {
          case 'integer':
          case 'int': method = 'Integer'; break;
          case 'bigint':
            method = name.endsWith('_id') || col.is_pk ? 'UnsignedBigInteger' : 'BigInteger';
            break;
          case 'text': method = 'Text'; break;
          case 'longtext': method = 'LongText'; break;
          case 'boolean':
          case 'bool': method = 'Boolean'; break;
          case 'timestamp': method = 'Timestamp'; break;
          case 'datetime': method = 'DateTime'; break;
          case 'date': method = 'Date'; break;
          case 'decimal': method = 'Decimal'; args = '10, 2'; break;
          case 'float': method = 'Float'; break;
          case 'uuid': method = 'Uuid'; break;
          case 'json': method = 'Json'; break;
          case 'enum': method = 'String'; break;
          default: method = 'String';
        }
      }

      let chain = `table.${method}(${args ? args : `"${col.name}"`})`;
      if (col.is_nullable && !col.is_pk) chain += '.Nullable()';

      return `      ${chain}`;
    }).join('\n');

  let fkBlock = '';
  if (fkConstraints && fkConstraints.length > 0) {
    const fkLines = fkConstraints
      .filter(fk => entity.columns.some(c => c.name === fk.column))
      .map(fk => {
        const onDelete = fk.onDelete && fk.onDelete.toUpperCase() !== 'NO ACTION' ? `.OnDelete("${fk.onDelete.toLowerCase()}")` : '';
        const onUpdate = fk.onUpdate && fk.onUpdate.toUpperCase() !== 'NO ACTION' ? `.OnUpdate("${fk.onUpdate.toLowerCase()}")` : '';
        return `      table.Foreign("${fk.column}").References("${fk.references}").On("${fk.on}")${onDelete}${onUpdate}`;
      })
      .join('\n');
    if (fkLines) {
      fkBlock = `\n${fkLines}`;
    }
  }

  const upBody = [
    `return facades.Schema().Create("${tableName}", func(table schema.Blueprint) {`,
    columns,
    tableMetadataGoravel(entity).join('\n'),
    hasSoftDeletes ? `      table.SoftDeletes()` : '',
    shouldAddTimestamps ? `      table.Timestamps()` : '',
    fkBlock,
    `    })`,
  ].filter(Boolean).join('\n');

  return `package migrations

import (
    "github.com/goravel/framework/contracts/database/schema"
    "github.com/goravel/framework/facades"
)

type ${className} struct{}

func (m *${className}) Signature() string {
    return "create_${tableName}_table"
}

func (m *${className}) Up() error {
    ${upBody}
}

func (m *${className}) Down() error {
    return facades.Schema().DropIfExists("${tableName}")
}`;
}

export function generateZod(entity: Entity): string {
  const schemaName = toPascalCase(entity.name, true);
  const varName = schemaName.charAt(0).toLowerCase() + schemaName.slice(1);
  
  const fields = entity.columns.map(col => {
    const t = col.type.toLowerCase();
    let zod = 'z.string()';
    
    switch (t) {
      case 'integer':
      case 'int': zod = 'z.number().int()'; break;
      case 'bigint': zod = 'z.number().int()'; break;
      case 'decimal':
      case 'float': zod = 'z.number()'; break;
      case 'boolean':
      case 'bool': zod = 'z.boolean()'; break;
      case 'uuid': zod = 'z.string().uuid()'; break;
      case 'ulid': zod = 'z.string().ulid()'; break;
      case 'datetime':
      case 'timestamp': zod = 'z.string().datetime()'; break;
      case 'date': zod = 'z.string().date()'; break;
      case 'json': zod = 'z.record(z.unknown())'; break;
      case 'enum': 
        const values = col.enum_values ? `[${col.enum_values.split(',').map(v => `'${v.trim()}'`).join(', ')}]` : '[]';
        zod = `z.enum(${values})`;
        break;
      default: zod = 'z.string()';
    }

    if (supportsColumnLength(t)) {
      if (col.max_length) zod += `.max(${col.max_length})`;
    }
    if (col.is_nullable) zod += '.nullable().optional()';
    
    return `  ${col.name}: ${zod},`;
  }).join('\n');

  return `import { z } from 'zod';\n\nexport const ${varName}Schema = z.object({\n${fields}\n});\n\nexport type ${schemaName} = z.infer<typeof ${varName}Schema>;`;
}
