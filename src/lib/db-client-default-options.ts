export const NO_COLUMN_DEFAULT = '__none__';
export const CUSTOM_COLUMN_DEFAULT = '__custom__';

export type ColumnDefaultOption = { value: string; label: string };

export function isTextColumnType(type: string) {
  return /^(char|varchar|character|character varying|text|tinytext|mediumtext|longtext)$/i.test(
    type.replace(/\(.*/, '').trim(),
  );
}

export function editableTextColumnDefault(value: string) {
  const match = value.trim().match(/^'((?:''|[^'])*)'(?:\s*::\s*(?:text|character(?: varying)?|varchar(?:\(\d+\))?))?$/i);
  return match ? match[1].replace(/''/g, "'") : value;
}

export function serializeColumnDefault(type: string, value: string) {
  if (!value || value.toUpperCase() === 'NULL' || !isTextColumnType(type)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

export function columnDefaultOptions(type: string, nullable: boolean, current = ''): ColumnDefaultOption[] {
  const baseType = type.toLowerCase()
    .replace(/\(.*/, '')
    .replace(/\b(unsigned|zerofill)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const values: ColumnDefaultOption[] = [{ value: NO_COLUMN_DEFAULT, label: 'No default' }];

  if (nullable) values.push({ value: 'NULL', label: 'NULL' });
  if (/^(tinyint|smallint|mediumint|int|integer|bigint|int2|int4|int8|smallserial|serial|bigserial|decimal|numeric|real|float|double|double precision|money)$/.test(baseType)) {
    values.push({ value: '0', label: '0' }, { value: '1', label: '1' });
  }
  if (/^(bool|boolean)$/.test(baseType)) {
    values.push({ value: 'TRUE', label: 'TRUE' }, { value: 'FALSE', label: 'FALSE' });
  }
  if (baseType === 'date') values.push({ value: 'CURRENT_DATE', label: 'CURRENT_DATE' });
  if (/^(time\b|timetz$)/.test(baseType)) values.push({ value: 'CURRENT_TIME', label: 'CURRENT_TIME' });
  if (/^(timestamp\b|timestamptz$|datetime$)/.test(baseType)) {
    values.push({ value: 'CURRENT_TIMESTAMP', label: 'CURRENT_TIMESTAMP' });
  }
  if (isTextColumnType(type)) values.push({ value: CUSTOM_COLUMN_DEFAULT, label: 'Custom value…' });

  const existing = current.trim();
  if (existing && !isTextColumnType(type) && !values.some(option => option.value.toUpperCase() === existing.toUpperCase())) {
    values.push({ value: current, label: `${current} (current)` });
  }
  return values;
}
