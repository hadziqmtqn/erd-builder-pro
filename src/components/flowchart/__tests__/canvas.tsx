import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { AIActionProvider, useAIAction } from '@/contexts/AIActionContext';
import { WorkspaceContext } from '@/providers/WorkspaceContext';
import { FlowchartView } from '@/components/views/FlowchartView';
import { previewFlowchartContent } from '@/components/ai/actions/flowchartActions';
import '@/index.css';

const labels = ['API sumber mengirim webhook', 'Terima webhook di n8n', 'Signature valid?', 'Tolak request', 'Validasi payload', 'Payload valid?', 'Catat error validasi', 'Transformasikan payload', 'Kirim ke API tujuan', 'Pengiriman berhasil?', 'Catat hasil sukses', 'Retry tersedia?', 'Jalankan retry', 'Catat kegagalan akhir'];
const fixture = JSON.stringify({
  nodes: labels.map((label, i) => ({ id: String(i), label, color: i % 2 ? '#ff0000' : '#00ff00', shape: [2, 5, 9, 11].includes(i) ? 'diamond' : 'rectangle' })),
  edges: [[0,1],[1,2],[2,4,'Yes'],[2,3,'No'],[4,5],[5,7,'Yes'],[5,6,'No'],[7,8],[8,9],[9,10,'Yes'],[9,11,'No'],[11,12,'Yes'],[11,13,'No'],[12,8]].map(([source,target,label]) => ({source:String(source),target:String(target),label})),
});
const initial = previewFlowchartContent(fixture)!;
const changed = JSON.parse(fixture);
changed.nodes = changed.nodes.filter((node: any) => node.id !== '3');
changed.nodes[1].shape = 'parallelogram';
changed.nodes.push({ id: 'summary', label: 'Ringkasan baru', shape: 'document', color: '#8b5cf6' });
changed.edges = changed.edges.filter((edge: any) => edge.target !== '3');
changed.edges.find((edge: any) => edge.source === '2').label = 'Valid';
changed.edges.push({ source: '10', target: 'summary' });
const storageKey = 'bug-015-disposable-component-test';

function Acceptance() {
  const [data, setData] = useState(() => localStorage.getItem(storageKey) ?? JSON.stringify(initial));
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const { applyContent } = useAIAction();
  const save = useCallback((nodes: any[], edges: any[]) => {
    const next = JSON.stringify({ nodes, edges });
    localStorage.setItem(storageKey, next);
    setData(next);
  }, []);
  const workspace = useMemo(() => ({ resolvedTheme: theme, setFlowchartExportHandler: () => {}, syncDrafts: async () => {}, hasPendingSyncs: false, isLocalSaving: false }), [theme]);
  const parsed = JSON.parse(data);
  return <WorkspaceContext.Provider value={workspace as any}>
    <div className={theme === 'dark' ? 'dark' : ''} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="bg-background text-foreground flex flex-wrap gap-6 p-3">
        <span>BUG-015 disposable component acceptance</span>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Toggle theme</button>
        <button onClick={() => applyContent(fixture, 'replace')}>Apply AI fixture</button>
        <button onClick={() => applyContent(JSON.stringify(changed), 'replace')}>Preview changed flow</button>
        <button onClick={() => applyContent(fixture, 'append')}>Preview append</button>
        <button onClick={() => applyContent(JSON.stringify({ nodes: [{ label: 'Default monochrome', shape: 'rectangle' }, { label: 'Requested red', shape: 'rectangle', color: '#ef4444' }], edges: [{ sourceLabel: 'Default monochrome', targetLabel: 'Requested red' }] }), 'replace')}>Preview requested red</button>
        <button onClick={() => save(initial.nodes.slice(0, 2), [{ source: initial.nodes[0].id, target: initial.nodes[1].id }])}>Load legacy connector</button>
        <button onClick={() => save(initial.nodes.map((node, index) => index === 0 ? { ...node, data: { ...node.data, section: 'QA Workflow N8N with a long group name' } } : node), initial.edges)}>Load grouped fixture</button>
        <output>{parsed.nodes.length} symbols / {parsed.edges.length} connectors saved</output>
      </header>
      <ReactFlowProvider><FlowchartView activeFlowchartId="bug-015-fixture" activeFlowchart={{ id: 'bug-015-fixture', uid: 'bug-015-fixture', title: 'Acceptance', data } as any} handleFlowchartChange={save} /></ReactFlowProvider>
    </div>
  </WorkspaceContext.Provider>;
}

const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<AIActionProvider><Acceptance /></AIActionProvider>);
