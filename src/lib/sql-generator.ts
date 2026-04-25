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
      case 'boolean':
      case 'bool': return 'TINYINT(1)';
      case 'timestamp': return 'TIMESTAMP';
      case 'datetime': return 'DATETIME';
      case 'date': return 'DATE';
      case 'decimal': return 'DECIMAL(10,2)';
      case 'float': return 'FLOAT';
      case 'uuid': return 'VARCHAR(36)';
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
      case 'boolean':
      case 'bool': return 'BOOLEAN';
      case 'timestamp': return 'TIMESTAMP';
      case 'datetime': return 'TIMESTAMP';
      case 'date': return 'DATE';
      case 'decimal': return 'DECIMAL(10,2)';
      case 'float': return 'REAL';
      case 'uuid': return 'UUID';
      case 'json': return 'JSONB';
      default: return t.toUpperCase();
    }
  }

  return t; // Default for others
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

export function generateLaravelMigration(entity: Entity): string {
  const tableName = entity.name.toLowerCase();
  
  const columns = entity.columns.map(col => {
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
        case 'boolean':
        case 'bool': method = 'boolean'; break;
        case 'timestamp': method = 'timestamp'; break;
        case 'datetime': method = 'dateTime'; break;
        case 'date': method = 'date'; break;
        case 'decimal': method = 'decimal'; args = `'${col.name}', 10, 2`; break;
        case 'float': method = 'float'; break;
        case 'uuid': method = 'uuid'; break;
        case 'json': method = 'json'; break;
        case 'enum': 
          method = 'enum'; 
          const values = col.enum_values ? `[${col.enum_values.split(',').map(v => `'${v.trim()}'`).join(', ')}]` : '[]';
          args = `'${col.name}', ${values}`;
          break;
        default: method = 'string';
      }
    }

    let chain = `$table->${method}(${args})`;
    if (col.is_nullable && !col.is_pk) chain += '->nullable()';
    
    return `    ${chain};`;
  }).join('\n');

  return `Schema::create('${tableName}', function (Blueprint $table) {
${columns}
    $table->timestamps();
});`;
}
