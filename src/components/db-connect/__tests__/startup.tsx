import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AIActionProvider } from '@/contexts/AIActionContext';
import { DataViewer } from '../DataViewer';
import '@/index.css';

const connectionId = 990030, stateKey = 'qa-startup-30';
const columns = Array.from({ length: 50 }, (_, i) => ({ name: `column_${i}`, type: 'varchar', is_pk: i === 0, is_nullable: true, sort_order: i + 1 }));
const schema = Array.from({ length: 30 }, (_, i) => ({ table_name: `qa_table_${i}`, columns, foreign_keys: [] }));
const rows = Array.from({ length: 50 }, (_, r) => Object.fromEntries(columns.map((c, i) => [c.name, i === 0 ? r + 1 : `Synthetic ${r + 1}:${i}`])));
sessionStorage.setItem(`erd-production-db-tabs:${stateKey}`, JSON.stringify({ openTabs: [{ name: 'qa_table_12', pinned: true }], activeTable: 'qa_table_12' }));
const requests: string[] = [];
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// All requests are synthetic: this page cannot reach a catalog or mutate a database.
window.fetch = async input => {
  const path = String(input);
  requests.push(`${Math.round(performance.now())}ms ${path.endsWith('/schema') ? 'schema' : 'records'}`);
  if (path === `/api/catalogs/${connectionId}/schema`) {
    await wait(300);
    return Response.json({ schema, dbType: 'postgresql', connectionSecurity: { environment: 'development', safeMode: 'read-only', sslMode: 'disable', queryTimeoutMs: 30000 } });
  }
  if (path === `/api/catalogs/${connectionId}/records`) {
    await wait(350);
    return Response.json({ columns: columns.map(c => c.name), rows, total: 721, page: 1, pageSize: 50 });
  }
  throw new Error('Synthetic fixture blocks this request');
};
function Acceptance() {
  const [evidence, setEvidence] = useState('');
  return <MemoryRouter><AIActionProvider><main className="flex h-screen flex-col bg-background text-foreground">
    <header className="p-3">Synthetic startup: 30 tables, restored qa_table_12, 50×50 records, no database access. <button onClick={() => setEvidence(requests.join(' | '))}>Read requests</button><output>{evidence}</output></header>
    <DataViewer connectionId={connectionId} stateKey={stateKey} />
  </main></AIActionProvider></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<Acceptance />);
