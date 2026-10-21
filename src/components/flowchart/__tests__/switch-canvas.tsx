import React, { Component, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, MarkerType } from '@xyflow/react';
import { WorkspaceContext } from '@/providers/WorkspaceContext';
import { AIActionProvider } from '@/contexts/AIActionContext';
import { FlowchartView } from '@/components/views/FlowchartView';
import { ERDRoutedEdge } from '@/components/diagram/ERDRoutedEdge';
import '@/index.css';

const flow = { nodes: ['a', 'b'].map((id, i) => ({ id, type: 'custom', position: { x: 100, y: 80 + i * 210 }, data: { label: `Flowchart ${id}`, shape: 'rectangle', color: '#6b7280' } })), edges: [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }] };
const tables = ['a', 'b'].map((id, i) => ({ id, position: { x: 100 + i * 320, y: 150 }, data: { name: `table_${id}`, label: `ERD table_${id}`, columns: [] } }));
const edgeTypes = { smoothstep: ERDRoutedEdge };

class Boundary extends Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <p role="alert">Canvas crash: {this.state.error}</p> : this.props.children; }
}

function Acceptance() {
  const [view, setView] = useState('flowchart');
  const [data, setData] = useState(JSON.stringify(flow));
  const save = useCallback((nodes: any[], edges: any[]) => setData(JSON.stringify({ nodes, edges })), []);
  const workspace = useMemo(() => ({ resolvedTheme: 'light', setFlowchartExportHandler: () => {}, syncDrafts: async () => {}, hasPendingSyncs: false, isLocalSaving: false }), []);
  return <WorkspaceContext.Provider value={workspace as any}><div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <header className="flex gap-6 p-4"><button onClick={() => setView('flowchart')}>Flowchart tab</button><button onClick={() => setView('erd')}>ERD Builder tab</button><output>Active: {view}</output></header>
    <Boundary><ReactFlowProvider>{view === 'flowchart'
      ? <FlowchartView activeFlowchartId="transition-fixture" activeFlowchart={{ id: 'transition-fixture', title: 'Transition fixture', data } as any} handleFlowchartChange={save} />
      : <ReactFlow nodes={tables} edges={[{ id: 'ab', source: 'a', target: 'b', type: 'smoothstep' }]} edgeTypes={edgeTypes} fitView />
    }</ReactFlowProvider></Boundary>
  </div></WorkspaceContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<AIActionProvider><Acceptance /></AIActionProvider>);
