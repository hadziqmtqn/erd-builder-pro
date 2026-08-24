import { useMemo, useState } from 'react';
import { type Node, useReactFlow } from '@xyflow/react';
import { MapPin, Pencil, Search } from 'lucide-react';
import type { Entity } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function filterERDTables(nodes: Node<Entity>[], search: string) {
  const query = search.trim().toLowerCase();
  return nodes
    .filter(node => !query || node.data.name.toLowerCase().includes(query))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
}

export function ERDTableListPanel({ nodes, onEdit }: { nodes: Node<Entity>[]; onEdit: (id: string) => void }) {
  const { fitView } = useReactFlow();
  const [search, setSearch] = useState('');
  const tables = useMemo(() => filterERDTables(nodes, search), [nodes, search]);

  const jumpToTable = (id: string) => {
    void fitView({ nodes: [{ id }], duration: 0, padding: 1.5, minZoom: 1.2, maxZoom: 1.2 });
  };
  const editTable = (id: string) => { jumpToTable(id); onEdit(id); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b p-4">
        <div>
          <h3 className="text-sm font-semibold">Tables</h3>
          <p className="text-xs text-muted-foreground">Find a table or open its properties.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tables..." className="pl-9" autoFocus />
        </div>
        <p className="text-[11px] text-muted-foreground">Showing {tables.length} of {nodes.length} tables</p>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {tables.map(node => (
          <div key={node.id} className="group flex items-center gap-1 rounded-md border border-transparent px-1 hover:border-border hover:bg-muted/50">
            <button type="button" onClick={() => jumpToTable(node.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2.5 text-left" title={`Jump to ${node.data.name}`}>
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.data.name}</span>
              <span className="text-[10px] text-muted-foreground">{node.data.columns.length}</span>
            </button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => editTable(node.id)} title={`Edit ${node.data.name} properties`} aria-label={`Edit ${node.data.name} properties`}>
              <Pencil className="size-3.5" />
            </Button>
          </div>
        ))}
        {tables.length === 0 && <div className="px-3 py-10 text-center text-sm text-muted-foreground">No matching tables found.</div>}
      </div>
    </div>
  );
}
