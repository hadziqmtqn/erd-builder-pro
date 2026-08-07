function typeName(type?: string): string {
  return String(type || '').split('(')[0].trim().replace(/\s+(unsigned|zerofill)$/i, '').replace(/\s+/g, ' ').toLowerCase();
}

export function supportsColumnLength(type?: string): boolean {
  return /^(varchar|char|character varying|character|text|tinytext|mediumtext|longtext|binary|varbinary)$/.test(typeName(type));
}

export function supportsNumericPrecision(type?: string): boolean {
  return /^(decimal|numeric)$/.test(typeName(type));
}

export function formatColumnType(type: string, maxLength?: number | null, precision?: number | null, scale?: number | null): string {
  const raw = String(type || 'VARCHAR').trim();
  if (/\([^)]*\)/.test(raw)) return raw;
  const qualifier = raw.match(/\s+(?:unsigned|zerofill)(?:\s+(?:unsigned|zerofill))*$/i);
  const base = qualifier ? raw.slice(0, qualifier.index).trim() : raw;
  const suffix = qualifier ? raw.slice(qualifier.index) : '';
  if (precision != null && supportsNumericPrecision(base)) return `${base}(${precision}${scale != null ? `,${scale}` : ''})${suffix}`;
  return maxLength != null && maxLength > 0 && supportsColumnLength(base) ? `${base}(${maxLength})${suffix}` : raw;
}

export function normalizeDatabaseColumnType(type?: string, fullType?: string | null, hasEnumValues = false): string {
  const rawFullType = String(fullType || '').trim();
  const rawType = hasEnumValues && /^user-defined$/i.test(rawFullType)
    ? 'ENUM'
    : (!rawFullType || /^user-defined$/i.test(rawFullType) ? String(type || 'VARCHAR') : rawFullType);
  return rawType
    .replace(/\([^)]*\)/g, '')
    .replace(/^character varying\b/i, 'VARCHAR')
    .replace(/^character\b/i, 'CHAR')
    .replace(/^integer\b/i, 'INT')
    .replace(/^double precision\b/i, 'DOUBLE')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function databaseColumnToERD(column: any, id: string) {
  const enumValues = Array.isArray(column.enum_values)
    ? column.enum_values.join(', ')
    : column.enum_values ?? null;
  const type = normalizeDatabaseColumnType(column.type, column.full_type, Boolean(enumValues));
  const modifiers = parseTypeModifiers(column.full_type || column.type);

  return {
    id,
    name: column.name,
    type,
    is_pk: Boolean(column.is_pk),
    is_nullable: Boolean(column.is_nullable),
    default_value: column.column_default ?? column.default_value ?? null,
    is_unique: Boolean(column.is_unique),
    enum_values: enumValues,
    comment: column.comment || '',
    max_length: supportsColumnLength(type) ? column.max_length ?? modifiers.max_length : null,
    numeric_precision: supportsNumericPrecision(type) ? column.numeric_precision ?? modifiers.numeric_precision : null,
    numeric_scale: supportsNumericPrecision(type) ? column.numeric_scale ?? modifiers.numeric_scale : null,
    sort_order: Number(column.sort_order) || 0,
    _is_fk: false,
  };
}

export function normalizeColumnDefault(value: string | null | undefined, isNullable: boolean): string | null {
  const normalized = value == null ? null : String(value).trim() || null;
  return !isNullable && normalized?.toUpperCase() === 'NULL' ? null : normalized;
}

export function parseTypeModifiers(type?: string): { max_length: number | null; numeric_precision: number | null; numeric_scale: number | null } {
  const text = String(type || '');
  const match = text.match(/\((\d+)(?:\s*,\s*(\d+))?\)/);
  if (!match) return { max_length: null, numeric_precision: null, numeric_scale: null };
  if (supportsColumnLength(text)) {
    return { max_length: Number(match[1]), numeric_precision: null, numeric_scale: null };
  }
  if (supportsNumericPrecision(text)) {
    return { max_length: null, numeric_precision: Number(match[1]), numeric_scale: match[2] ? Number(match[2]) : null };
  }
  return { max_length: null, numeric_precision: null, numeric_scale: null };
}
