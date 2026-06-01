import { Entity } from '../types';

export type SQLType = 'mysql' | 'postgresql' | 'laravel';

function mapType(type: string, target: SQLType): string {
  const t = type.toLowerCase();
  
  if (target === 'mysql') {
    switch (t) {
      case 'varchar': return 'VARCHAR(255)';
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
      case 'decimal': return 'DECIMAL(10,2)';
      case 'float': return 'FLOAT';
      case 'uuid': return 'VARCHAR(36)';
      case 'ulid': return 'CHAR(26)';
      case 'json': return 'JSON';
      default: return t.toUpperCase();
    }
  }
  
  if (target === 'postgresql') {
    switch (t) {
      case 'varchar': return 'VARCHAR(255)';
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
      case 'decimal': return 'DECIMAL(10,2)';
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
    const type = mapType(col.type, 'mysql');
    const nullable = col.is_nullable ? 'NULL' : 'NOT NULL';
    const pk = col.is_pk ? ' AUTO_INCREMENT PRIMARY KEY' : '';
    const enumValues = col.type.toLowerCase() === 'enum' && col.enum_values 
      ? `ENUM(${col.enum_values.split(',').map(v => `'${v.trim()}'`).join(', ')})`
      : type;
      
    return `  \`${col.name}\` ${enumValues} ${nullable}${pk}`;
  }).join(',\n');

  return `CREATE TABLE \`${tableName}\` (\n${columns}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
}

export function generatePostgreSQL(entity: Entity): string {
  const tableName = entity.name.toLowerCase();
  const columns = entity.columns.map(col => {
    const type = mapType(col.type, 'postgresql');
    const nullable = col.is_nullable ? 'NULL' : 'NOT NULL';
    
    let columnType = type;
    if (col.is_pk && (type === 'INTEGER' || type === 'BIGINT')) {
      columnType = type === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL';
    }

    const pk = col.is_pk ? ' PRIMARY KEY' : '';
    
    // Handle ENUM for PG (simplified to CHECK constraint for direct SQL export)
    if (col.type.toLowerCase() === 'enum' && col.enum_values) {
      const values = col.enum_values.split(',').map(v => `'${v.trim()}'`).join(', ');
      return `  "${col.name}" VARCHAR(255) ${nullable}${pk} CHECK ("${col.name}" IN (${values}))`;
    }
      
    return `  "${col.name}" ${columnType} ${nullable}${pk}`;
  }).join(',\n');

  return `CREATE TABLE "${tableName}" (\n${columns}\n);`;
}

export function generateLaravelMigration(entity: Entity, fkConstraints?: { column: string; references: string; on: string }[]): string {
  const tableName = entity.name.toLowerCase();
  
  const hasTimestamps = entity.columns.some(c => c.name === 'created_at');
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
          case 'decimal': method = 'decimal'; args = `'${col.name}', 10, 2`; break;
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

      let chain = `$table->${method}(${args})`;
      if (col.is_nullable && !col.is_pk) chain += '->nullable()';
      
      return `    ${chain};`;
    }).join('\n');

  let fkBlock = '';
  if (fkConstraints && fkConstraints.length > 0) {
    const fkLines = fkConstraints
      .filter(fk => entity.columns.some(c => c.name === fk.column))
      .map(fk => {
        return `    $table->foreign('${fk.column}')->references('${fk.references}')->on('${fk.on}')->onDelete('cascade');`;
      })
      .join('\n');
    if (fkLines) {
      fkBlock = `\n${fkLines}`;
    }
  }

  return `Schema::create('${tableName}', function (Blueprint $table) {
${columns}${fkBlock}
${hasSoftDeletes ? '    $table->softDeletes();' : ''}${hasTimestamps ? '\n    $table->timestamps();' : ''}
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
    if (col.is_nullable) prismaType += '?';
    
    return `  ${name} ${prismaType}${attributes}`;
  }).join('\n');

  const timestampFields = [];
  if (!hasCreatedAt) timestampFields.push('  created_at DateTime @default(now())');
  if (!hasUpdatedAt) timestampFields.push('  updated_at DateTime @updatedAt');
  const timestamps = timestampFields.length > 0 ? `\n${timestampFields.join('\n')}` : '';

  return `model ${modelName} {\n${fields}${timestamps}\n}${enums}`;
}

export function generateLaravelModel(entity: Entity): string {
  const className = toPascalCase(entity.name, true);
  const tableName = entity.name.toLowerCase();
  const needsExplicitTable = className.toLowerCase() !== entity.name.toLowerCase();
  
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

    if (col.is_nullable) zod += '.nullable().optional()';
    
    return `  ${col.name}: ${zod},`;
  }).join('\n');

  return `import { z } from 'zod';\n\nexport const ${varName}Schema = z.object({\n${fields}\n});\n\nexport type ${schemaName} = z.infer<typeof ${varName}Schema>;`;
}
