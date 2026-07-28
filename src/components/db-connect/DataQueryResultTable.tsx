import { memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SQL_RESULT_PAGE_SIZE = 50;

type QueryResult = {
  columns: string[];
  rows: any[];
  durationMs?: number;
};

type DataQueryResultTableProps = {
  error: string | null;
  emptyText: string;
  result: QueryResult | null;
  resultPage: number;
  onPageChange: (page: number) => void;
};

export const DataQueryResultTable = memo(function DataQueryResultTable({
  error,
  emptyText,
  result,
  resultPage,
  onPageChange,
}: DataQueryResultTableProps) {
  if (error) return <div className="p-3 text-sm text-destructive">{error}</div>;
  if (!result) return <div className="p-3 text-sm text-muted-foreground">{emptyText}</div>;

  const rows = result.rows;
  const totalPages = Math.max(1, Math.ceil(rows.length / SQL_RESULT_PAGE_SIZE));
  const page = Math.min(resultPage || 1, totalPages);
  const start = (page - 1) * SQL_RESULT_PAGE_SIZE;
  const pageRows = rows.slice(start, start + SQL_RESULT_PAGE_SIZE);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-background">
            <tr>
              <th className="w-12 whitespace-nowrap border-b px-2 py-1.5 text-right font-medium text-muted-foreground">#</th>
              {result.columns.map(column => <th key={column} className="whitespace-nowrap border-b px-2 py-1.5 text-left font-medium">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr key={start + index} className="odd:bg-muted/30">
                <td className="w-12 whitespace-nowrap border-b px-2 py-1.5 text-right text-muted-foreground">{start + index + 1}</td>
                {result.columns.map(column => <td key={column} className="max-w-64 truncate whitespace-nowrap border-b px-2 py-1.5">{String(row[column] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between border-t px-2 text-xs text-muted-foreground">
        <span>{rows.length === 0 ? '0 rows' : `${start + 1}-${Math.min(start + SQL_RESULT_PAGE_SIZE, rows.length)} of ${rows.length} rows`}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-16 text-center">Page {page} / {totalPages}</span>
          <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
