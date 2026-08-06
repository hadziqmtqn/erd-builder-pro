import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type DataViewerStructureProps = {
  table: any;
  isLoading?: boolean;
  selectedColumnName?: string | null;
  selectedIndexName?: string | null;
  selectedCheckName?: string | null;
  onEditTable: () => void;
  onSelectColumn: (columnName: string) => void;
  onSelectIndex: (indexName: string) => void;
  onSelectCheck: (checkName: string) => void;
};

const empty = (value: any) => value === null ? 'NULL' : value === undefined || value === '' ? 'EMPTY' : String(value);
const yesNo = (value: boolean) => value ? 'YES' : 'NO';
const valueClass = (value: any) => value === null || value === undefined || value === '' ? 'text-muted-foreground' : 'text-foreground';

function ValueCell({ value, className = '' }: { value: any; className?: string }) {
  return <TableCell className={`font-mono ${valueClass(value)} ${className}`}>{empty(value)}</TableCell>;
}

function RefreshProgress({ active }: { active: boolean }) {
  return <div className="h-0.5 overflow-hidden bg-transparent">{active && <div className="h-full w-full animate-pulse bg-primary" />}</div>;
}

export function DataViewerStructure({ table, isLoading = false, selectedColumnName, selectedIndexName, selectedCheckName, onEditTable, onSelectColumn, onSelectIndex, onSelectCheck }: DataViewerStructureProps) {
  const columns = (table?.columns || [])
    .map((column: any, index: number) => ({ column, index }))
    .sort((a: any, b: any) => (Number(a.column.sort_order) || a.index + 1) - (Number(b.column.sort_order) || b.index + 1))
    .map((item: any) => item.column);
  const foreignKeys = table?.foreign_keys || [];
  const indexes = table?.indexes || [];
  const checks = table?.checks || [];

  return (
    <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b bg-muted/10 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <button
            className="h-8 w-64 max-w-[32vw] truncate rounded-md border bg-background px-3 py-1.5 text-left text-sm font-medium hover:bg-muted/50"
            onClick={onEditTable}
          >
            {table.table_name}
          </button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Primary</span>
          <div className="h-8 min-w-32 flex-1 truncate rounded-md border bg-background px-3 py-1.5 text-sm">
            {columns.filter((col: any) => col.is_pk).map((col: any) => col.name).join(', ') || 'EMPTY'}
          </div>
        </div>
        {table.comment && <div className="max-w-[28vw] truncate text-xs text-muted-foreground" title={table.comment}>{table.comment}</div>}
      </div>
      <RefreshProgress active={isLoading} />

      <div className="min-h-0 flex-3 overflow-auto custom-scrollbar">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-background">
              {['#', 'column_name', 'data_type', 'character_set', 'collation', 'is_nullable', 'column_default', 'extra', 'foreign_key', 'comment'].map(header => (
                <TableHead key={header} className="font-mono text-xs">{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column: any, index: number) => {
              const fk = foreignKeys.find((item: any) => item.column === column.name);
              return (
                <TableRow
                  key={column.name}
                  className={`cursor-pointer ${selectedColumnName === column.name ? 'bg-muted/70' : ''}`}
                  onClick={() => onSelectColumn(column.name)}
                >
                  <TableCell className="w-14 text-right font-mono text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-mono font-medium text-foreground">{column.name}</TableCell>
                  <ValueCell value={column.full_type || column.type} />
                  <ValueCell value={column.character_set} />
                  <ValueCell value={column.collation} />
                  <TableCell className="font-mono">{yesNo(column.is_nullable)}</TableCell>
                  <ValueCell value={column.column_default} />
                  <ValueCell value={column.extra || (column.is_generated ? 'generated' : '')} />
                  <ValueCell value={fk ? `${fk.ref_table}(${fk.ref_column})` : ''} />
                  <ValueCell value={column.comment} />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid min-h-56 flex-2 grid-cols-3 border-t">
        <div className="min-w-0 overflow-auto custom-scrollbar border-r">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-background">
                {['relation_name', 'column_name', 'reference', 'on_delete', 'on_update'].map(header => (
                  <TableHead key={header} className="font-mono text-xs">{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {foreignKeys.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No relations</TableCell></TableRow>
              ) : foreignKeys.map((fk: any) => (
                <TableRow key={`${fk.constraint_name || fk.column}-${fk.ref_table}`}>
                  <ValueCell value={fk.constraint_name} />
                  <ValueCell value={fk.column} />
                  <ValueCell value={`${fk.ref_table}(${fk.ref_column})`} />
                  <ValueCell value={fk.on_delete} />
                  <ValueCell value={fk.on_update} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="min-w-0 overflow-auto custom-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-background">
                {['index_name', 'index_algorithm', 'is_unique', 'column_name'].map(header => (
                  <TableHead key={header} className="font-mono text-xs">{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {indexes.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">No indexes</TableCell></TableRow>
              ) : indexes.map((index: any) => (
                <TableRow
                  key={index.name}
                  className={`cursor-pointer ${selectedIndexName === index.name ? 'bg-muted/70' : ''}`}
                  onClick={() => onSelectIndex(index.name)}
                >
                  <ValueCell value={index.name} />
                  <ValueCell value={index.algorithm} />
                  <TableCell className="font-mono">{String(Boolean(index.is_unique)).toUpperCase()}</TableCell>
                  <ValueCell value={index.column_name} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="min-w-0 overflow-auto custom-scrollbar border-l">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-background">
                {['check_name', 'expression'].map(header => (
                  <TableHead key={header} className="font-mono text-xs">{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="h-20 text-center text-muted-foreground">No checks</TableCell></TableRow>
              ) : checks.map((check: any) => (
                <TableRow
                  key={check.name || check.expression}
                  className={`cursor-pointer ${selectedCheckName === check.name ? 'bg-muted/70' : ''}`}
                  onClick={() => check.name && onSelectCheck(check.name)}
                >
                  <ValueCell value={check.name} />
                  <ValueCell value={check.expression} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
