import React, { Profiler, useCallback, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodesState, useEdgesState } from '@xyflow/react';
import { AIActionProvider } from '@/contexts/AIActionContext';
import { WorkspaceContext } from '@/providers/WorkspaceContext';
import { EntityNodeProvider } from '@/contexts/EntityNodeContext';
import { Toaster } from '@/components/ui/sonner';
import { ERDView } from '@/components/views/ERDView';
import { dbSchemaToCanvas } from '@/lib/db-client-schema';
import { autoLayoutERD } from '@/lib/autoLayoutERD';
import '@/index.css';

const schema = Array.from({ length: 20 }, (_, i) => ({
  table_name: `qa_table_${i}`, columns: [
    { name: 'id', type: 'BIGINT', is_pk: true },
    ...Array.from({ length: 4 }, (_, c) => ({ name: `ref_${c}`, type: 'BIGINT' })),
    ...Array.from({ length: 8 }, (_, c) => ({ name: `value_${c}`, type: 'VARCHAR(120)' })),
  ], foreign_keys: i < 4 ? [] : Array.from({ length: 4 }, (_, c) => ({ column: `ref_${c}`, ref_table: `qa_table_${c}`, ref_column: 'id', constraint_name: `qa_fk_${i}_${c}`, on_delete: 'NO ACTION', on_update: 'NO ACTION' })),
}));
let changed = false, delay = 0;
window.fetch = async (input, init) => {
  if (!String(input).endsWith('/api/catalogs/9001/schema')) throw new Error('QA blocks non-fixture requests');
  const currentDelay = delay; delay = 0;
  await new Promise(resolve => setTimeout(resolve, currentDelay));
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return new Response(JSON.stringify({ schema: changed ? schema.map(t => ({ ...t, foreign_keys: t.foreign_keys.map(fk => ({ ...fk, on_delete: 'CASCADE' })) })) : schema }), { headers: { 'Content-Type': 'application/json' } });
};
const initial = dbSchemaToCanvas(schema, null);
const noop = () => {};
const readOnlyContext = { isReadOnly: true, sourceType: 'production_db', duplicateEntity: noop, setSelectedNodeId: noop };
function Acceptance() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [mode, setMode] = useState('data');
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const commits = useRef(0);
  const [count, setCount] = useState(0);
  const workspace = useMemo(() => ({ resolvedTheme: theme, syncDrafts: async () => {}, hasPendingSyncs: false, isLocalSaving: false }), [theme]);
  const layout = useCallback(() => setNodes(current => autoLayoutERD(current, edges)), [edges, setNodes]);
  return <WorkspaceContext.Provider value={workspace as any}><EntityNodeProvider value={readOnlyContext}><div className={theme === 'dark' ? 'dark' : ''} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <header className="flex flex-wrap gap-4 bg-background text-foreground p-3">
      <span>SH-005.2 synthetic DB Client: 20 tables / 64 FK</span>
      <button onClick={() => setMode('data')}>Data tab</button>
      <button onClick={() => { setMode('erd'); setMounted(true); }}>ERD tab</button>
      <button onClick={() => { changed = false; }}>Use identical schema</button>
      <button onClick={() => { changed = true; }}>Use changed FK schema</button>
      <button onClick={() => { delay = 3000; }}>Delay next Sync</button>
      <button onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; document.documentElement.classList.toggle('dark', next === 'dark'); setTheme(next); }}>Toggle theme</button>
      <button onClick={() => setCount(commits.current)}>Read canvas commits</button><output>{count} commits</output>
    </header>
    {mode === 'data' && <p>Data tab fixture: no records or database writes.</p>}
    {mounted && <div className={mode === 'erd' ? 'flex min-h-0 flex-1' : 'hidden'}><Profiler id="canvas" onRender={() => { commits.current++; }}>
      <ERDView nodes={nodes} edges={edges} setNodes={setNodes} setEdges={setEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={noop} onNodeClick={noop} onPaneClick={noop} onMove={noop} addEntity={noop} handleExportSQL={noop} handleExportImage={noop}
        onAutoLayout={layout} isDbClient isReadOnly isActive={mode === 'erd'} sourceConnectionId={9001} />
    </Profiler></div>}
    <Toaster />
  </div></EntityNodeProvider></WorkspaceContext.Provider>;
}
const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<AIActionProvider><ReactFlowProvider><Acceptance /></ReactFlowProvider></AIActionProvider>);
