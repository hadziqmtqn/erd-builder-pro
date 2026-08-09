import { useMemo, useState } from 'react';
import { Copy, Download, MoreHorizontal, Scissors, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContextMenuItem } from '@/components/ui/context-menu';

type Props = {
  connectionId: number;
  dbType: string | null;
  table: any;
  tables: any[];
  exportTables?: any[];
  exportRows?: RowData[];
  exportSelectedRows?: RowData[];
  label?: string;
  mode?: 'menu' | 'button' | 'dropdown' | 'context-item';
  buttonClassName?: string;
  disabled?: boolean;
  onDeleteTables: (tableNames: string[], options: { ignoreForeignKeys?: boolean; cascade?: boolean }) => Promise<any>;
  onMutateTables: (patch: Record<string, any>) => Promise<any>;
};

type ExportFormat = 'csv' | 'json' | 'sql';
type RowData = Record<string, any>;

const isMysql = (dbType: string | null) => dbType === 'mysql';
const isPg = (dbType: string | null) => dbType === 'postgresql';
const q = (dbType: string | null, name: string) => isMysql(dbType) ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`;
const downloadName = (name: string) => name.replace(/[^A-Za-z0-9_.-]+/g, '_');
const delimiterLabel = (value: string) => value === 'tab' ? 'Tab' : value === ';' ? 'Semicolon (;)' : 'Comma (,)';
const decimalLabel = (value: string) => value === ',' ? 'Comma decimal (,)' : 'Dot decimal (.)';

function fieldValue(value: any, decimal: string) {
  if (value == null) return '';
  if (decimal === ',' && typeof value === 'number' && !Number.isInteger(value)) return String(value).replace('.', ',');
  return String(value);
}

function csvCell(value: any, delimiter: string, decimal: string) {
  const text = fieldValue(value, decimal);
  return /["\n\r]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sqlValue(value: any) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function gzipBlob(blob: Blob) {
  const Compression = (window as any).CompressionStream;
  if (!Compression) throw new Error('Gzip is not supported in this browser');
  const stream = blob.stream().pipeThrough(new Compression('gzip'));
  return new Response(stream).blob();
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DataViewerTableActions({ connectionId, dbType, table, tables, exportTables, exportRows, exportSelectedRows, label = 'Export', mode = 'menu', buttonClassName = 'h-8 px-2', disabled = false, onDeleteTables, onMutateTables }: Props) {
  const tableName = table.table_name;
  const columns = useMemo<string[]>(() => (table.columns || []).map((col: any) => String(col.name || '')).filter(Boolean), [table]);
  const [dialog, setDialog] = useState<null | 'export' | 'clone' | 'truncate' | 'delete'>(null);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(columns);
  const [delimiter, setDelimiter] = useState(',');
  const [decimal, setDecimal] = useState('.');
  const [includeStructure, setIncludeStructure] = useState(true);
  const [includeContents, setIncludeContents] = useState(true);
  const [gzip, setGzip] = useState(false);
  const [cloneName, setCloneName] = useState(`${tableName}_copy`);
  const [cloneData, setCloneData] = useState(false);
  const [ignoreFk, setIgnoreFk] = useState(false);
  const [cascade, setCascade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowsOverride, setRowsOverride] = useState<RowData[] | null>(null);
  const targetTables = exportTables?.length ? exportTables : [table];
  const singleExport = targetTables.length === 1;
  const supportsTableMutation = isMysql(dbType) || isPg(dbType);

  const fetchRows = async (name: string): Promise<{ columns: string[]; rows: RowData[] }> => {
    let page = 1;
    const rows: RowData[] = [];
    let cols: string[] = [];
    while (true) {
      const res = await apiFetch(`/api/catalogs/${connectionId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: name, page, pageSize: 200 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch records');
      cols = (data.columns || cols).map(String);
      rows.push(...(data.rows || []));
      if (rows.length >= Number(data.total || rows.length)) return { columns: cols, rows };
      page += 1;
    }
  };

  const exportTable = async (item: any) => {
    const name = item.table_name;
    const picked: string[] = singleExport ? selectedColumns : (item.columns || []).map((col: any) => String(col.name || '')).filter(Boolean);
    const data = rowsOverride
      ? { rows: rowsOverride, columns: (item.columns || []).map((col: any) => String(col.name || '')).filter(Boolean) }
      : includeContents || format !== 'sql' ? await fetchRows(name) : { rows: [], columns: picked };
    const cols = picked.length ? picked : data.columns;
    if (format === 'json') return JSON.stringify(data.rows.map(row => Object.fromEntries(cols.map(col => [col, row[col]]))), null, 2);
    const csvDelimiter = delimiter === 'tab' ? '\t' : delimiter;
    if (format === 'csv') return [cols.join(csvDelimiter), ...data.rows.map(row => cols.map(col => csvCell(row[col], csvDelimiter, decimal)).join(csvDelimiter))].join('\n');
    const parts: string[] = [];
    if (includeStructure) {
      const res = await apiFetch(`/api/catalogs/${connectionId}/structure/sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to fetch table SQL');
      parts.push(body.sql);
    }
    if (includeContents) {
      for (const row of data.rows) {
        parts.push(`INSERT INTO ${q(dbType, name)} (${cols.map(col => q(dbType, col)).join(', ')}) VALUES (${cols.map(col => sqlValue(row[col])).join(', ')});`);
      }
    }
    return parts.join('\n');
  };

  const openExport = (rows?: RowData[]) => {
    setRowsOverride(rows ?? exportRows ?? null);
    setSelectedColumns(columns);
    setDialog('export');
  };

  const handleExport = async () => {
    try {
      setBusy(true);
      if (format === 'json' && !singleExport) {
        const entries = await Promise.all(targetTables.map(async item => {
          const data = await fetchRows(item.table_name);
          return [item.table_name, data.rows] as const;
        }));
        const filename = 'selected_tables.json';
        saveBlob(new Blob([JSON.stringify(Object.fromEntries(entries), null, 2)], { type: 'application/json;charset=utf-8' }), filename);
        toast.success(`Export saved to your browser Downloads folder: ${filename}`);
        setDialog(null);
        return;
      }
      const chunks = await Promise.all(targetTables.map(exportTable));
      const ext = format === 'sql' ? 'sql' : format;
      let blob = new Blob([chunks.join('\n\n')], { type: 'text/plain;charset=utf-8' });
      if (format === 'sql' && gzip) blob = await gzipBlob(blob);
      const filename = `${downloadName(singleExport ? tableName : 'selected_tables')}.${ext}${format === 'sql' && gzip ? '.gz' : ''}`;
      saveBlob(blob, filename);
      toast.success(`Export saved to your browser Downloads folder: ${filename}`);
      setDialog(null);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const actionOptions = (action: 'delete' | 'truncate') => (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Table: </span>
        <span className="font-mono font-medium">{tableName}</span>
      </div>
      {isMysql(dbType) && (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox className="mt-0.5" checked={ignoreFk} onCheckedChange={checked => { setIgnoreFk(checked); if (checked) setCascade(false); }} />
          <span><span className="block font-medium">Disable foreign key checks</span><span className="text-xs text-muted-foreground">Use only when related tables block this {action}.</span></span>
        </label>
      )}
      {isPg(dbType) && (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox className="mt-0.5" checked={cascade} onCheckedChange={checked => setCascade(checked)} />
          <span><span className="block font-medium">Cascade dependent tables</span><span className="text-xs text-muted-foreground">Include tables connected by foreign keys.</span></span>
        </label>
      )}
    </div>
  );

  const handleClone = async () => {
    const name = cloneName.trim();
    if (!name || tables.some(item => item.table_name === name)) return toast.error('Table name already exists');
    try {
      setBusy(true);
      await onMutateTables({ cloneTable: { source: tableName, target: name, withData: cloneData } });
      toast.success('Table cloned');
      setDialog(null);
    } catch (err: any) {
      toast.error(err.message || 'Clone failed');
    } finally {
      setBusy(false);
    }
  };

  const handleTableAction = async (action: 'truncate' | 'delete') => {
    try {
      setBusy(true);
      const options = { ignoreForeignKeys: isMysql(dbType) ? ignoreFk : false, cascade: isPg(dbType) ? cascade : false };
      action === 'delete'
        ? await onDeleteTables([tableName], options)
        : await onMutateTables({ truncateTables: [tableName], ...options });
      toast.success(action === 'delete' ? 'Table deleted' : 'Table truncated');
      setDialog(null);
    } catch (err: any) {
      toast.error(err.message || `${action} failed`);
    } finally {
      setBusy(false);
    }
  };

  const trigger = mode === 'button' ? (
        <Button type="button" variant="outline" size="sm" className={buttonClassName} disabled={disabled || targetTables.length === 0} onClick={e => { e.stopPropagation(); openExport(); }}>
          <Download className="mr-1 h-3.5 w-3.5" />
          {label}
        </Button>
      ) : mode === 'dropdown' ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className={buttonClassName} disabled={disabled || targetTables.length === 0} />}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => openExport()}>Export All</DropdownMenuItem>
            <DropdownMenuItem disabled={!exportSelectedRows?.length} onClick={() => openExport(exportSelectedRows)}>Export Selected</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : mode === 'context-item' ? (
        <ContextMenuItem onClick={() => openExport()}><Download className="h-3.5 w-3.5" />Export</ContextMenuItem>
      ) : (
    <span onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" className="h-6 w-6 opacity-70 hover:opacity-100" />}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => openExport()}><Download className="h-3.5 w-3.5" />Export</DropdownMenuItem>
            <DropdownMenuItem disabled={!supportsTableMutation} onClick={() => { setCloneName(`${tableName}_copy`); setDialog('clone'); }}><Copy className="h-3.5 w-3.5" />Clone</DropdownMenuItem>
            <DropdownMenuItem disabled={!supportsTableMutation} onClick={() => setDialog('truncate')}><Scissors className="h-3.5 w-3.5" />Truncate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!supportsTableMutation} variant="destructive" onClick={() => setDialog('delete')}><Trash2 className="h-3.5 w-3.5" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
    </span>
      );

  return (
    <>
      {trigger}

      <Dialog open={dialog === 'export'} onOpenChange={open => !open && setDialog(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{singleExport ? `Export ${tableName}` : `Export ${targetTables.length} tables`}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              File will be saved by the browser, usually in Downloads.
            </div>
            <ButtonGroup>
              {(['csv', 'json', 'sql'] as const).map(item => (
                <Button key={item} type="button" variant={format === item ? 'default' : 'outline'} size="sm" className="h-7 px-3 text-xs uppercase" onClick={() => setFormat(item)}>
                  {item}
                </Button>
              ))}
            </ButtonGroup>
            {singleExport && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Select the columns to include. {selectedColumns.length} of {columns.length} columns selected.
                </p>
                <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2">
                  {columns.map(col => <label key={col} className="flex items-center gap-2 text-xs"><Checkbox checked={selectedColumns.includes(col)} onCheckedChange={checked => setSelectedColumns(prev => checked ? [...prev, col] : prev.filter(item => item !== col))} />{col}</label>)}
                </div>
              </div>
            )}
            {format === 'csv' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs font-medium">
                  Field delimiter
                  <Select value={delimiter} onValueChange={value => setDelimiter(value || ',')}>
                    <SelectTrigger><SelectValue>{delimiterLabel(delimiter)}</SelectValue></SelectTrigger>
                    <SelectContent><SelectItem value=",">Comma (,)</SelectItem><SelectItem value=";">Semicolon (;)</SelectItem><SelectItem value="tab">Tab</SelectItem></SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5 text-xs font-medium">
                  Decimal format
                  <Select value={decimal} onValueChange={value => setDecimal(value || '.')}>
                    <SelectTrigger><SelectValue>{decimalLabel(decimal)}</SelectValue></SelectTrigger>
                    <SelectContent><SelectItem value=".">Dot decimal (.)</SelectItem><SelectItem value=",">Comma decimal (,)</SelectItem></SelectContent>
                  </Select>
                </label>
              </div>
            )}
            {format === 'sql' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeStructure} onCheckedChange={checked => setIncludeStructure(checked)} />Include table structure</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeContents} onCheckedChange={checked => setIncludeContents(checked)} />Include table contents</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={gzip} onCheckedChange={checked => setGzip(checked)} />Compress Gzip</label>
              </div>
            )}
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={handleExport} disabled={busy || (singleExport && selectedColumns.length === 0)}>Export</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'clone'} onOpenChange={open => !open && setDialog(null)}>
        <DialogContent size="sm"><DialogHeader><DialogTitle>Clone table</DialogTitle></DialogHeader><DialogBody className="space-y-3"><Input value={cloneName} onChange={e => setCloneName(e.target.value)} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={cloneData} onCheckedChange={checked => setCloneData(checked)} />Copy records</label></DialogBody><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={handleClone} disabled={busy}>Clone</Button></DialogFooter></DialogContent>
      </Dialog>

      {(['truncate', 'delete'] as const).map(action => (
        <AlertDialog key={action} open={dialog === action} onOpenChange={open => !open && setDialog(null)}>
          <AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{action === 'delete' ? 'Delete table' : 'Truncate table'}</AlertDialogTitle></AlertDialogHeader><AlertDialogBody>{actionOptions(action)}</AlertDialogBody><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={busy} onClick={() => handleTableAction(action)}>{action === 'delete' ? 'Delete' : 'Truncate'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      ))}
    </>
  );
}
