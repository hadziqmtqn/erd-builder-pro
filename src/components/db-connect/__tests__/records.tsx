import React, { Profiler, useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataViewerRecordsTable } from '../DataViewerRecordsTable';
import { createColumnHelpers } from '../data-viewer-utils';
import { Toaster } from '@/components/ui/sonner';
import '@/index.css';

const columns = Array.from({ length: 56 }, (_, i) => `column_${String(i).padStart(2, '0')}`);
const tableSchema = { table_name: 'qa_wide_records', columns: columns.map((name, i) => ({ name, type: i === 0 ? 'BIGINT' : 'VARCHAR(255)', is_pk: i === 0 })) };
const records = { columns, total: 721, page: 1, pageSize: 50, rows: Array.from({ length: 50 }, (_, r) => Object.fromEntries(columns.map((name, c) => [name, c === 0 ? r + 1 : c % 5 === 0 ? null : `QA row ${r + 1}, column ${c}, value`]))) };
const helpers = createColumnHelpers(new Map(tableSchema.columns.map(c => [c.name, c])));
const fks = new Map(columns.filter((_, i) => i > 0 && i % 7 === 0).map(column => [column, { ref_table: 'qa_parent', ref_column: 'id' }]));
const pk = [columns[0]];
const noop = () => {};
const asyncNoop = async () => {};
function Acceptance() {
  const [selected, setSelected] = useState<Record<string, any> | null>(null);
  const [keys, setKeys] = useState(new Set<string>());
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [sort, setSort] = useState<any>(null);
  const [theme, setTheme] = useState('light');
  const [message, setMessage] = useState('');
  const commits = useRef(0);
  const count = useRef<HTMLOutputElement>(null);
  const select = useCallback((row: any) => setSelected(row), []);
  const draft = useCallback((row: any, column: string, value: any) => setDrafts(prev => ({ ...prev, [`[${row[columns[0]]}]:${column}`]: { rowKey: `[${row[columns[0]]}]`, column, key: { [columns[0]]: row[columns[0]] }, value } })), []);
  const toggle = useCallback((row: any, checked: boolean) => setKeys(prev => { const next = new Set(prev); const key = `[${row[columns[0]]}]`; if (checked) next.add(key); else next.delete(key); return next; }), []);
  return <div style={{ height: '100vh' }} className="flex flex-col bg-background text-foreground">
    <header className="flex flex-wrap items-center gap-4 p-3">
      <span>Synthetic 50 rows × 56 columns; no database writes</span>
      <button onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; document.documentElement.classList.toggle('dark', next === 'dark'); setTheme(next); }}>Toggle theme</button>
      <button onClick={() => { if (count.current) count.current.textContent = `${commits.current} commits`; }}>Read render count</button><output ref={count} />
      <output>{Object.keys(drafts).length} drafts; {keys.size} selected; {message}</output>
    </header>
    <Profiler id="records" onRender={() => { commits.current++; }}>
      <DataViewerRecordsTable activeTable="qa_wide_records" connectionId={990056} dbType="postgresql" columnHelpers={helpers} error={null}
        foreignKeyByColumn={fks} isLoadingRecords={false} records={records} tableSchema={tableSchema} primaryKeyColumns={pk}
        selectedRow={selected} selectedRowKeys={keys} sort={sort} recordDrafts={drafts} handleSelectRow={select} onEditRecord={select}
        onDeleteTables={asyncNoop} onMutateTables={asyncNoop} openRelatedRecord={(table, column) => setMessage(`FK ${table}.${column}`)}
        onAddRecord={noop} onDraftCell={draft} onDeleteSelectedRecords={noop} onTogglePageRows={(rows, checked) => setKeys(checked ? new Set(rows.map(row => `[${row[columns[0]]}]`)) : new Set())}
        onToggleSelectedRow={toggle} toggleSort={column => setSort((prev: any) => ({ column, direction: prev?.direction === 'asc' ? 'desc' : 'asc' }))} warnUnsaved={() => true} />
    </Profiler><Toaster />
  </div>;
}
const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Acceptance />);
