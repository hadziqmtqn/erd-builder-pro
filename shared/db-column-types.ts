export const POSTGRES_COLUMN_TYPES = [
  'SMALLINT', 'INTEGER', 'BIGINT', 'SMALLSERIAL', 'SERIAL', 'BIGSERIAL',
  'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'MONEY',
  'BOOLEAN', 'CHAR', 'VARCHAR', 'TEXT', 'BYTEA',
  'DATE', 'TIME', 'TIMETZ', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL',
  'UUID', 'JSON', 'JSONB', 'XML', 'BIT', 'BIT VARYING',
  'CIDR', 'INET', 'MACADDR', 'MACADDR8', 'TSVECTOR', 'TSQUERY',
] as const;

export const MYSQL_COLUMN_TYPES = [
  'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'BIT', 'BOOLEAN',
  'CHAR', 'VARCHAR', 'BINARY', 'VARBINARY',
  'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'ENUM', 'SET',
  'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR', 'JSON',
  'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON',
  'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION',
] as const;

const POSTGRES_ALIASES: Record<string, string> = {
  int: 'INTEGER', int2: 'SMALLINT', int4: 'INTEGER', int8: 'BIGINT',
  serial2: 'SMALLSERIAL', serial4: 'SERIAL', serial8: 'BIGSERIAL',
  bool: 'BOOLEAN', char: 'CHAR', 'character varying': 'VARCHAR', character: 'CHAR',
  float4: 'REAL', float8: 'DOUBLE PRECISION',
  'time without time zone': 'TIME', 'time with time zone': 'TIMETZ',
  'timestamp without time zone': 'TIMESTAMP', 'timestamp with time zone': 'TIMESTAMPTZ',
};
const MYSQL_ALIASES: Record<string, string> = {
  integer: 'INT', bool: 'BOOLEAN', dec: 'DECIMAL', fixed: 'DECIMAL', 'double precision': 'DOUBLE',
};

export function columnTypeOption(dbType: string | null, value: string) {
  const trimmed = value.trim();
  const withoutArgs = trimmed.replace(/\([^)]*\)/, '').replace(/\s+/g, ' ').trim();
  if (dbType === 'postgresql') {
    const normalized = withoutArgs.toLowerCase();
    const known = POSTGRES_ALIASES[normalized]
      || POSTGRES_COLUMN_TYPES.find(type => type.toLowerCase() === normalized);
    return known || trimmed;
  }
  if (dbType === 'mysql') {
    const modifiers = withoutArgs.match(/\b(?:unsigned|zerofill)\b/gi)?.map(item => item.toUpperCase()) || [];
    const normalized = withoutArgs.replace(/\b(?:unsigned|zerofill)\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const known = MYSQL_ALIASES[normalized]
      || MYSQL_COLUMN_TYPES.find(type => type.toLowerCase() === normalized);
    return known ? [known, ...modifiers].join(' ') : trimmed;
  }
  return withoutArgs.toUpperCase();
}

export const supportsColumnLength = (type: string) => /^(var)?char$|^character varying$|^(var)?binary$/i.test(columnTypeOption(null, type));
export const supportsNumericModifiers = (type: string) => /^(decimal|numeric)$/i.test(columnTypeOption(null, type));
export const supportsTemporalPrecision = (dbType: string | null, type: string) => {
  const option = columnTypeOption(dbType, type);
  return dbType === 'postgresql'
    ? /^(TIME|TIMETZ|TIMESTAMP|TIMESTAMPTZ)$/.test(option)
    : dbType === 'mysql' && /^(TIME|DATETIME|TIMESTAMP)$/.test(option);
};

export function columnTypeWithModifiers(
  dbType: string | null,
  type: string,
  length: string,
  precision: string,
  scale: string,
) {
  const option = columnTypeOption(dbType, type);
  if (supportsColumnLength(option)) return `${option}(${length || 255})`;
  if (supportsNumericModifiers(option) && precision) return `${option}(${scale ? `${precision},${scale}` : precision})`;
  if (supportsTemporalPrecision(dbType, option) && precision) return `${option}(${precision})`;
  return option;
}
