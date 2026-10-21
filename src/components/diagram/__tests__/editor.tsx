import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Database, GitBranch } from 'lucide-react';
import { WorkspaceContext } from '@/providers/WorkspaceContext';
import { FilePanesContext } from '@/contexts/FilePanesContext';
import { ProjectFileTabButton } from '@/components/ProjectFileTabButton';
import { DBMLEditorPanel } from '../DBMLEditorPanel';
import '@/index.css';

const schema = `Table workflows {
  id bigint [pk]
  name varchar(255)
  indexes {
    name
  }
}

Table webhook_events {
  id bigint [pk]
  workflow_id bigint
  payload json
}

Enum status {
  active
  paused
}

Ref: webhook_events.workflow_id > workflows.id
`;
const nodes: any[] = [], edges: any[] = [];
function Acceptance() {
  const [value, setValue] = useState(schema);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [active, setActive] = useState('erd');
  const [applies, setApplies] = useState(0);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const change = useCallback((next: string) => setValue(next), []);
  const apply = useCallback(() => setApplies(count => count + 1), []);
  const workspace = useMemo(() => ({ resolvedTheme: theme }), [theme]);
  const panes = useMemo(() => ({ files: [], focused: '', desktop: true, canSplit: true, open: () => {}, select: () => {}, close: () => {} }), []);
  return <WorkspaceContext.Provider value={workspace as any}><FilePanesContext.Provider value={panes}>
    <div className="bg-background text-foreground" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="flex items-center gap-4 border-b p-3">
        <ProjectFileTabButton file={{ type: 'erd', uid: 'test-erd', title: 'N8N Database', projectId: 'fixture' }} title="N8N Database" feature="ERD Builder" icon={Database} active={active === 'erd'} onSelect={() => setActive('erd')} />
        <ProjectFileTabButton file={{ type: 'flowchart', uid: 'test-flow', title: 'Workflow N8N', projectId: 'fixture' }} title="Workflow N8N" feature="Flowchart" icon={GitBranch} active={active === 'flowchart'} onSelect={() => setActive('flowchart')} />
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Toggle theme</button>
        <output>{applies} schema updates</output>
      </header>
      <div className="min-h-0 flex-1"><DBMLEditorPanel value={value} onChange={change} onApply={apply} nodes={nodes} edges={edges} /></div>
    </div>
  </FilePanesContext.Provider></WorkspaceContext.Provider>;
}
const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Acceptance />);
