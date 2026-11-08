import { useMemo, useRef } from 'react';
import { Link2, Pencil, Search } from 'lucide-react';
import { filterERDRelationships, type ERDRelationshipRow } from '@/lib/erd-relationship-list';
import { useScrollActiveRowIntoView } from '@/hooks/useScrollActiveRowIntoView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const relationshipLabel = (row: ERDRelationshipRow) => `${row.fromTable}.${row.fromColumn} → ${row.toTable}.${row.toColumn}`;

interface ERDRelationshipListPanelProps {
  rows: ERDRelationshipRow[];
  search: string;
  onSearchChange: (search: string) => void;
  activeId: string | null;
  /** Row click: the Explorer highlights the relationship on the canvas. */
  onSelect: (id: string) => void;
  /** Opens the relationship editor; left out when the diagram is read-only. */
  onEdit?: (id: string) => void;
}

export function ERDRelationshipListPanel({ rows, search, onSearchChange, activeId, onSelect, onEdit }: ERDRelationshipListPanelProps) {
  const relationships = useMemo(() => filterERDRelationships(rows, search), [rows, search]);
  const listRef = useRef<HTMLDivElement>(null);
  useScrollActiveRowIntoView(listRef);


  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b p-4">
        <div>
          <h3 className="text-sm font-semibold">Relationships</h3>
          <p className="text-xs text-muted-foreground">{onEdit ? 'Find a relationship or edit its properties.' : 'Find a relationship on the canvas.'}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search tables or columns..." className="pl-9" autoFocus />
        </div>
        <p className="text-[11px] text-muted-foreground">Showing {relationships.length} of {rows.length} relationships</p>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {relationships.map(row => {
          const label = relationshipLabel(row);
          return (
            <div key={row.id} className="group flex items-center gap-1 rounded-md border border-transparent px-1 hover:border-border hover:bg-muted/50 has-[[aria-current=true]]:bg-muted has-[[aria-current=true]]:shadow-[inset_2px_0_0_var(--primary)]">
              <button type="button" onClick={() => onSelect(row.id)} aria-current={row.id === activeId ? 'true' : undefined} className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2.5 text-left" title={`Show ${label}`}>
                <Link2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-medium">{label}</span>
                  {row.constraintName && <span className="block truncate text-[11px] text-muted-foreground">{row.constraintName}</span>}
                </span>
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{row.type}</Badge>
              </button>
              {onEdit && <Button type="button" variant="ghost" size="icon-sm" onClick={() => onEdit(row.id)} title={`Edit ${label}`} aria-label={`Edit relationship ${label}`}>
                <Pencil className="size-3.5" />
              </Button>}
            </div>
          );
        })}
        {relationships.length === 0 && (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'No relationships yet.' : 'No matching relationships found.'}
          </div>
        )}
      </div>
    </div>
  );
}
