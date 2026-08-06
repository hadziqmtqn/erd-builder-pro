export function supportsColumnLength(type?: string): boolean {
  return /^(var)?char|text|tinytext|mediumtext|longtext|binary|varbinary$/i.test(String(type || '').split('(')[0].trim());
}

export function supportsNumericPrecision(type?: string): boolean {
  return /^(decimal|numeric)$/i.test(String(type || '').split('(')[0].trim());
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
