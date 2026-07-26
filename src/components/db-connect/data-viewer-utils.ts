export const RECORD_FILTER_OPERATORS = [
  '=', '!=', '<>', '>', '>=', '<', '<=',
  'LIKE', 'NOT LIKE', 'CONTAINS', 'NOT CONTAINS',
  'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN',
  'IS', 'IS NOT',
];

export function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Unavailable';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function formatRawCellValue(value: any) {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function editableValue(value: any) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function parseEnumValues(value: any) {
  if (Array.isArray(value)) return value.map(String);
  const match = String(value || '').match(/^(?:enum|set)\((.*)\)$/i);
  if (!match) return [];
  return [...match[1].matchAll(/'((?:''|[^'])*)'/g)].map(item => item[1].replace(/''/g, "'"));
}

export function createColumnHelpers(columnByName: Map<string, any>) {
  const columnMeta = (column: string) => columnByName.get(column) as any;
  const columnType = (column: string) => String(columnMeta(column)?.type || '').toLowerCase();
  const columnFullType = (column: string) => String(columnMeta(column)?.full_type || columnMeta(column)?.enum_values || '').toLowerCase();
  const isBooleanColumn = (column: string) => /bool/.test(columnType(column)) || /^tinyint\(1\)/.test(columnFullType(column));
  const isNumericColumn = (column: string) => !isBooleanColumn(column) && /int|decimal|numeric|float|double|real|serial|money/.test(columnType(column));
  const isDateColumn = (column: string) => /date/.test(columnType(column)) && !/time/.test(columnType(column));
  const isDateTimeColumn = (column: string) => /timestamp|datetime/.test(columnType(column));
  const isLongColumn = (column: string) => /text|json|xml/.test(columnType(column));
  const enumValues = (column: string) => parseEnumValues(columnMeta(column)?.enum_values);
  const isEnumColumn = (column: string) => enumValues(column).length > 0;
  const isReadOnlyColumn = (column: string) => {
    const meta = columnMeta(column);
    return Boolean(meta?.is_pk || meta?.is_generated);
  };

  return {
    columnType,
    isBooleanColumn,
    isNumericColumn,
    isDateColumn,
    isDateTimeColumn,
    isLongColumn,
    enumValues,
    isEnumColumn,
    isReadOnlyColumn,
  };
}

export function datePart(value: any) {
  return String(value || '').split(/[T ]/)[0] || '';
}

export function timePart(value: any) {
  const match = String(value || '').match(/[T ](\d{2}:\d{2}(?::\d{2})?)/);
  return match?.[1].length === 5 ? `${match[1]}:00` : match?.[1] || '00:00:00';
}

export function dateTimeValue(value: any) {
  const date = datePart(value);
  return date ? `${date} ${timePart(value)}` : '';
}

export function displayCellValue(column: string, value: any, helpers: ReturnType<typeof createColumnHelpers>) {
  if (value === null) return 'NULL';
  if (helpers.isDateTimeColumn(column)) return dateTimeValue(value);
  if (helpers.isDateColumn(column)) return datePart(value);
  return formatRawCellValue(value);
}

export function draftValue(column: string, value: any, helpers: ReturnType<typeof createColumnHelpers>) {
  if (helpers.isBooleanColumn(column)) {
    if (value === null || value === undefined || value === '') return '';
    return value === true || value === 1 || value === '1' ? '1' : '0';
  }
  if (helpers.isDateTimeColumn(column)) return dateTimeValue(value);
  if (helpers.isDateColumn(column)) return datePart(value);
  return editableValue(value);
}

export function submitValue(column: string, value: any, helpers: ReturnType<typeof createColumnHelpers>) {
  if (helpers.isBooleanColumn(column)) return value === '' ? null : Number(value);
  if (helpers.isDateTimeColumn(column)) return String(value || '').replace('T', ' ');
  if (helpers.isDateColumn(column)) return datePart(value);
  if (helpers.isNumericColumn(column) && value !== '') return Number(value);
  if (/json/.test(helpers.columnType(column)) && value !== '') {
    try { return JSON.parse(value); } catch {}
  }
  return value;
}

export function parseDraftDate(value: any) {
  const [dateText] = String(value || '').split(/[T ]/);
  const [year, month, day] = dateText.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

export function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
