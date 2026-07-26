export interface RecordsResult {
  columns: string[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
  tableInfo?: {
    dataSize: number | null;
    indexSize: number | null;
    totalSize: number | null;
  };
}

export interface OpenTableTab {
  name: string;
  pinned: boolean;
}

export interface RecordFilter {
  id: string;
  enabled: boolean;
  column: string;
  operator: string;
  value: string;
  value2?: string;
}

export interface RecordSort {
  column: string;
  direction: 'asc' | 'desc';
}

export const DATA_VIEWER_STORAGE_PREFIX = 'erd-production-db-tabs:';

export const makeRecordFilter = (column = ''): RecordFilter => ({
  id: crypto.randomUUID(),
  enabled: true,
  column,
  operator: 'CONTAINS',
  value: '',
  value2: '',
});
