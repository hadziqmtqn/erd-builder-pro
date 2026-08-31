export interface LaravelMigrationFile {
  path: string;
  content: string;
}

type Column = {
  name: string;
  type: string;
  nullable: boolean;
  primary?: boolean;
  unique?: boolean;
  defaultValue?: string;
  comment?: string;
};

type Relation = {
  column: string;
  targetTable: string;
  targetColumn: string;
  onDelete?: string;
  onUpdate?: string;
};

type Index = { columns: string[]; unique: boolean; name?: string };
type Table = { name: string; columns: Column[]; relations: Relation[]; indexes: Index[] };
type Method = { name: string; args: string };

const scalarTypes: Record<string, string> = {
  biginteger: 'BIGINT', unsignedbiginteger: 'BIGINT', integer: 'INT', unsignedinteger: 'INT',
  mediuminteger: 'MEDIUMINT', unsignedmediuminteger: 'MEDIUMINT', smallinteger: 'SMALLINT',
  unsignedsmallinteger: 'SMALLINT', tinyinteger: 'TINYINT', unsignedtinyinteger: 'TINYINT',
  string: 'VARCHAR', char: 'CHAR', text: 'TEXT', mediumtext: 'TEXT', longtext: 'TEXT',
  boolean: 'BOOLEAN', date: 'DATE', datetime: 'TIMESTAMP', datetimetz: 'TIMESTAMP',
  timestamp: 'TIMESTAMP', timestamptz: 'TIMESTAMP', time: 'TIME', timetz: 'TIME', year: 'INT',
  decimal: 'DECIMAL', unsigneddecimal: 'DECIMAL', float: 'FLOAT', double: 'DOUBLE',
  uuid: 'UUID', ulid: 'ULID', json: 'JSON', jsonb: 'JSON', binary: 'BINARY',
  ipaddress: 'VARCHAR', macaddress: 'VARCHAR', geometry: 'GEOMETRY', geography: 'GEOGRAPHY',
};

function matchingBrace(text: string, open: number, opening = '{', closing = '}') {
  let depth = 0;
  let quote = '';
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === opening) depth++;
    else if (char === closing && --depth === 0) return index;
  }
  return -1;
}

function upBody(content: string) {
  const match = /function\s+up\s*\([^)]*\)[^{]*\{/i.exec(content);
  if (!match) return '';
  const open = match.index + match[0].lastIndexOf('{');
  const close = matchingBrace(content, open);
  return close < 0 ? '' : content.slice(open + 1, close);
}

function splitTopLevel(value: string, delimiter = ',') {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === delimiter && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function stringValue(value = '') {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "'" || quote === '"') && trimmed.endsWith(quote)) return trimmed.slice(1, -1).replaceAll(`\\${quote}`, quote);
  return '';
}

function stringList(value = '') {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return splitTopLevel(trimmed.slice(1, -1)).map(stringValue).filter(Boolean);
  const single = stringValue(trimmed);
  return single ? [single] : [];
}

function methods(statement: string): Method[] {
  const result: Method[] = [];
  let cursor = statement.indexOf('$table');
  while (cursor >= 0) {
    const arrow = statement.indexOf('->', cursor);
    if (arrow < 0) break;
    const nameMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(statement.slice(arrow + 2));
    if (!nameMatch) break;
    const open = arrow + 2 + nameMatch[0].length;
    if (statement[open] !== '(') break;
    const close = matchingBrace(statement, open, '(', ')');
    if (close < 0) break;
    result.push({ name: nameMatch[0].toLowerCase(), args: statement.slice(open + 1, close) });
    cursor = close + 1;
  }
  return result;
}

function statements(block: string) {
  return splitTopLevel(block, ';').filter(statement => statement.includes('$table->'));
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function enumTypeName(table: string, column: string) {
  return `${table}_${column}`.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

function literal(value: string) {
  const raw = value.trim();
  const text = stringValue(raw);
  if (text) return `'${text.replaceAll("'", "\\'")}'`;
  if (/^(true|false|null|-?\d+(?:\.\d+)?)$/i.test(raw)) return raw.toLowerCase();
  return '';
}

function pluralizeForeignKey(column: string) {
  // ponytail: intentionally handles Laravel's common *_id convention; use framework execution when irregular inflection matters.
  const base = column.replace(/_id$/i, '');
  return base.endsWith('s') ? `${base}es` : base.endsWith('y') ? `${base.slice(0, -1)}ies` : `${base}s`;
}

function columnFromMethods(chain: Method[]): Column | null {
  const first = chain[0];
  if (!first) return null;
  const args = splitTopLevel(first.args);
  const macro = first.name;
  let column: Column | null = null;
  if (macro === 'id') column = { name: stringValue(args[0]) || 'id', type: 'BIGINT', nullable: false, primary: true };
  if (['increments', 'bigincrements', 'mediumincrements', 'smallincrements', 'tinyincrements'].includes(macro)) {
    const type = macro === 'bigincrements' ? 'BIGINT' : macro === 'smallincrements' ? 'SMALLINT' : macro === 'tinyincrements' ? 'TINYINT' : 'INT';
    column = { name: stringValue(args[0]) || 'id', type, nullable: false, primary: true };
  }
  if (macro === 'foreignid') column = { name: stringValue(args[0]), type: 'BIGINT', nullable: false };
  if (macro === 'foreignuuid') column = { name: stringValue(args[0]), type: 'UUID', nullable: false };
  if (macro === 'foreignulid') column = { name: stringValue(args[0]), type: 'ULID', nullable: false };
  if (macro === 'remembertoken') column = { name: 'remember_token', type: 'VARCHAR(100)', nullable: true };
  if (macro === 'enum' || macro === 'set') {
    const values = stringList(args[1]);
    column = {
      name: stringValue(args[0]),
      type: values.length ? `ENUM(${values.map(value => `'${value.replaceAll("'", "\\'")}'`).join(', ')})` : 'VARCHAR',
      nullable: false,
    };
  }
  const baseType = scalarTypes[macro];
  if (!column && baseType) {
    let type = baseType;
    if ((macro === 'string' || macro === 'char') && /^\d+$/.test(args[1] || '')) type += `(${args[1]})`;
    if (['decimal', 'unsigneddecimal'].includes(macro) && /^\d+$/.test(args[1] || '')) type += `(${args[1]},${/^\d+$/.test(args[2] || '') ? args[2] : '0'})`;
    const defaultName = { uuid: 'uuid', ulid: 'ulid', ipaddress: 'ip_address', macaddress: 'mac_address' }[macro] || '';
    column = { name: stringValue(args[0]) || defaultName, type, nullable: false };
  }
  if (!column) return null;
  for (const method of chain.slice(1)) {
    if (method.name === 'nullable') column.nullable = true;
    else if (method.name === 'primary') column.primary = true;
    else if (method.name === 'unique') column.unique = true;
    else if (method.name === 'default') column.defaultValue = literal(method.args);
    else if (method.name === 'usecurrent') column.defaultValue = '`CURRENT_TIMESTAMP`';
    else if (method.name === 'comment') column.comment = stringValue(method.args);
  }
  return column.name ? column : null;
}

function addColumn(table: Table, column: Column) {
  const index = table.columns.findIndex(item => item.name.toLowerCase() === column.name.toLowerCase());
  if (index >= 0) table.columns[index] = { ...table.columns[index], ...column };
  else table.columns.push(column);
}

function addRelation(table: Table, chain: Method[], column: string) {
  const constrained = chain.find(method => method.name === 'constrained');
  const references = chain.find(method => method.name === 'references');
  const on = chain.find(method => method.name === 'on');
  if (!constrained && !(references && on)) return;
  const constrainedArgs = splitTopLevel(constrained?.args || '');
  const relation: Relation = {
    column,
    targetTable: stringValue(constrainedArgs[0]) || stringValue(on?.args) || pluralizeForeignKey(column),
    targetColumn: stringValue(constrainedArgs[1]) || stringValue(references?.args) || 'id',
  };
  const deleteMethod = chain.find(method => ['cascadeondelete', 'restrictondelete', 'nullondelete'].includes(method.name));
  const updateMethod = chain.find(method => ['cascadeonupdate', 'restrictonupdate'].includes(method.name));
  relation.onDelete = deleteMethod?.name.replace('ondelete', '').replace('null', 'set null');
  relation.onUpdate = updateMethod?.name.replace('onupdate', '');
  table.relations = table.relations.filter(item => item.column !== column);
  table.relations.push(relation);
}

function applyBlock(table: Table, block: string, warnings: string[], filePath: string) {
  for (const statement of statements(block)) {
    const chain = methods(statement);
    const first = chain[0];
    if (!first) continue;
    const args = splitTopLevel(first.args);
    if (['enum', 'set'].includes(first.name) && stringList(args[1]).length === 0) {
      warnings.push(`${filePath}: dynamic values for $table->${first.name}('${stringValue(args[0])}') cannot be evaluated; mapped to VARCHAR`);
    }
    if (first.name === 'timestamps' || first.name === 'nullabletimestamps') {
      addColumn(table, { name: 'created_at', type: 'TIMESTAMP', nullable: true });
      addColumn(table, { name: 'updated_at', type: 'TIMESTAMP', nullable: true });
      continue;
    }
    if (first.name === 'softdeletes' || first.name === 'softdeletestz') {
      addColumn(table, { name: stringValue(args[0]) || 'deleted_at', type: 'TIMESTAMP', nullable: true });
      continue;
    }
    if (['morphs', 'numericmorphs', 'nullablemorphs', 'nullablenumericmorphs', 'uuidmorphs', 'nullableuuidmorphs', 'ulidmorphs', 'nullableulidmorphs'].includes(first.name)) {
      const name = stringValue(args[0]);
      if (!name) { warnings.push(`${filePath}: invalid $table->${first.name}() name`); continue; }
      const nullable = first.name.startsWith('nullable');
      // ponytail: generic morphs follows Laravel's default numeric key; explicit UUID/ULID macros remain exact.
      const idType = first.name.includes('uuid') ? 'UUID' : first.name.includes('ulid') ? 'ULID' : 'BIGINT';
      addColumn(table, { name: `${name}_type`, type: 'VARCHAR', nullable });
      addColumn(table, { name: `${name}_id`, type: idType, nullable });
      table.indexes.push({ columns: [`${name}_type`, `${name}_id`], unique: false, name: stringValue(args[1]) || undefined });
      continue;
    }
    if (first.name === 'dropcolumn') {
      const removed = args.flatMap(stringList);
      table.columns = table.columns.filter(column => !removed.includes(column.name));
      table.relations = table.relations.filter(relation => !removed.includes(relation.column));
      continue;
    }
    if (first.name === 'renamecolumn') {
      const from = stringValue(args[0]);
      const to = stringValue(args[1]);
      const column = table.columns.find(item => item.name === from);
      if (column && to) column.name = to;
      for (const relation of table.relations) if (relation.column === from) relation.column = to;
      continue;
    }
    if (first.name === 'foreign') {
      const columns = stringList(args[0]);
      if (columns.length === 1) addRelation(table, chain, columns[0]);
      else warnings.push(`${filePath}: composite foreign key requires manual review`);
      continue;
    }
    if (first.name === 'primary' || first.name === 'unique' || first.name === 'index') {
      const columns = stringList(args[0]);
      if (first.name === 'primary') for (const name of columns) {
        const column = table.columns.find(item => item.name === name);
        if (column) column.primary = true;
      }
      else if (columns.length) table.indexes.push({ columns, unique: first.name === 'unique', name: stringValue(args[1]) || undefined });
      continue;
    }
    const column = columnFromMethods(chain);
    if (!column) {
      if (!['dropforeign', 'dropindex', 'dropunique', 'dropprimary'].includes(first.name)) warnings.push(`${filePath}: unsupported $table->${first.name}()`);
      continue;
    }
    addColumn(table, column);
    if (['foreignid', 'foreignuuid', 'foreignulid'].includes(first.name)) addRelation(table, chain, column.name);
  }
}

type SchemaOperation = { index: number; kind: 'block' | 'drop' | 'rename'; action?: string; table: string; second?: string; block?: string };

function operations(body: string) {
  const result: SchemaOperation[] = [];
  const blockPattern = /Schema::(create|table)\s*\(\s*(['"])([^'"]+)\2\s*,\s*function\s*\([^)]*\)\s*(?::\s*void\s*)?\{/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(body))) {
    const open = match.index + match[0].lastIndexOf('{');
    const close = matchingBrace(body, open);
    if (close < 0) continue;
    result.push({ index: match.index, kind: 'block', action: match[1].toLowerCase(), table: match[3], block: body.slice(open + 1, close) });
    blockPattern.lastIndex = close + 1;
  }
  const simple = /Schema::(dropIfExists|drop|rename)\s*\(\s*(['"])([^'"]+)\2(?:\s*,\s*(['"])([^'"]+)\4)?\s*\)/gi;
  while ((match = simple.exec(body))) result.push({ index: match.index, kind: match[1].toLowerCase() === 'rename' ? 'rename' : 'drop', table: match[3], second: match[5] });
  return result.sort((a, b) => a.index - b.index);
}

function dbmlColumn(table: Table, column: Column) {
  const settings = [column.primary && 'pk', !column.nullable && 'not null', column.unique && 'unique', column.defaultValue && `default: ${column.defaultValue}`, column.comment && `note: '${column.comment.replaceAll("'", "\\'")}'`].filter(Boolean);
  const type = column.type.startsWith('ENUM(') ? enumTypeName(table.name, column.name) : column.type;
  return `  ${identifier(column.name)} ${type}${settings.length ? ` [${settings.join(', ')}]` : ''}`;
}

export function laravelMigrationsToDBML(files: LaravelMigrationFile[]) {
  const tables = new Map<string, Table>();
  const warnings: string[] = [];
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const body = upBody(file.content);
    if (!body) { warnings.push(`${file.path}: up() method was not found`); continue; }
    for (const operation of operations(body)) {
      if (operation.kind === 'drop') { tables.delete(operation.table.toLowerCase()); continue; }
      if (operation.kind === 'rename') {
        const table = tables.get(operation.table.toLowerCase());
        if (table && operation.second) {
          tables.delete(operation.table.toLowerCase());
          table.name = operation.second;
          tables.set(operation.second.toLowerCase(), table);
          for (const candidate of tables.values()) for (const relation of candidate.relations) if (relation.targetTable === operation.table) relation.targetTable = operation.second;
        }
        continue;
      }
      let table = tables.get(operation.table.toLowerCase());
      if (operation.action === 'create') {
        table = { name: operation.table, columns: [], relations: [], indexes: [] };
        tables.set(operation.table.toLowerCase(), table);
      }
      if (!table) { warnings.push(`${file.path}: Schema::table('${operation.table}') has no parsed create migration`); continue; }
      applyBlock(table, operation.block || '', warnings, file.path);
    }
  }

  const enumBlocks = [...tables.values()].flatMap(table => table.columns.flatMap(column => {
    if (!column.type.startsWith('ENUM(')) return [];
    const values = column.type.slice(5, -1).split(',').map(value => value.trim().replace(/^'|'$/g, '')).filter(Boolean);
    return [[`Enum ${enumTypeName(table.name, column.name)} {`, ...values.map(value => `  ${identifier(value)}`), '}'].join('\n')];
  }));
  const blocks = [...tables.values()].map(table => {
    const indexLines = table.indexes.map(index => `    (${index.columns.map(identifier).join(', ')})${index.unique || index.name ? ` [${[index.unique && 'unique', index.name && `name: ${identifier(index.name)}`].filter(Boolean).join(', ')}]` : ''}`);
    return [`Table ${identifier(table.name)} {`, ...table.columns.map(column => dbmlColumn(table, column)), ...(indexLines.length ? ['', '  Indexes {', ...indexLines, '  }'] : []), '}'].join('\n');
  });
  const refs = [...tables.values()].flatMap(table => table.relations.map(relation => {
    const settings = [relation.onDelete && `delete: ${relation.onDelete}`, relation.onUpdate && `update: ${relation.onUpdate}`].filter(Boolean);
    return `Ref: ${identifier(table.name)}.${identifier(relation.column)} > ${identifier(relation.targetTable)}.${identifier(relation.targetColumn)}${settings.length ? ` [${settings.join(', ')}]` : ''}`;
  }));
  return { dbml: [...enumBlocks, ...blocks, ...refs].join('\n\n'), warnings };
}
