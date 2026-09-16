import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { DiffResult, SchemaDiffChange } from '@/lib/schema-diff';

interface SchemaDiffOverlayProps {
  diff: DiffResult;
  approvedIds: string[];
  showChecklist: boolean;
  label?: string;
  rejectLabel?: string;
  canMerge?: boolean;
  selectable?: boolean;
  checklistTitle?: string;
  onApprovedIdsChange: (ids: string[]) => void;
  onShowChecklistChange: (show: boolean) => void;
  onReject: () => void;
  onMerge: () => void;
}

function tableName(change: SchemaDiffChange) {
  if (change.kind === 'column') {
    const path = change.id.replace(/^column:/, '');
    return path.slice(0, path.lastIndexOf('.'));
  }
  if (change.kind === 'relation') return change.label.split('.')[0];
  return change.label;
}

function fieldName(change: SchemaDiffChange) {
  if (change.kind === 'column') return change.label.slice(change.label.lastIndexOf('.') + 1);
  if (change.kind === 'table') return 'Table definition';
  return change.label;
}

function changeType(change: SchemaDiffChange) {
  if (change.kind === 'table') return 'TABLE';
  if (change.kind === 'relation') return 'FK';
  const column = change.proposed ?? change.current;
  return column && 'is_pk' in column ? column.type : '—';
}

export function SchemaDiffOverlay({
  diff,
  approvedIds,
  showChecklist,
  label,
  rejectLabel = 'Reject All',
  canMerge = true,
  selectable = canMerge,
  checklistTitle = 'Select changes to merge:',
  onApprovedIdsChange,
  onShowChecklistChange,
  onReject,
  onMerge,
}: SchemaDiffOverlayProps) {
  const allIds = useMemo(() => diff.changes.map(change => change.id), [diff.changes]);
  const groupedChanges = useMemo(() => {
    const groups = new Map<string, SchemaDiffChange[]>();
    for (const change of diff.changes) {
      const table = tableName(change);
      groups.set(table, [...(groups.get(table) || []), change]);
    }
    return [...groups];
  }, [diff.changes]);
  const kindSummary = useMemo(() => ['table', 'column', 'relation'].map(kind => {
    const count = diff.changes.filter(change => change.kind === kind).length;
    return count ? `${count} ${kind}${count === 1 ? '' : 's'}` : null;
  }).filter(Boolean).join(' · '), [diff.changes]);
  const allSelected = approvedIds.length === allIds.length;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex flex-col items-center justify-center gap-2.5 px-3">
      {showChecklist && (
        <div className="pointer-events-auto w-[min(560px,100%)] rounded-2xl border bg-popover/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{checklistTitle}</span>
            {selectable && <Button
              variant="link"
              size="xs"
              onClick={() => onApprovedIdsChange(allSelected ? [] : allIds)}
            >
              {allSelected ? 'Unselect All' : 'Select All'}
            </Button>}
          </div>

          <div className="flex max-h-75 flex-col gap-3 overflow-y-auto pr-1 custom-scrollbar">
            {groupedChanges.map(([table, changes]) => (
              <section key={table} className="overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
                  <span className="text-xs font-semibold">{table}</span>
                  <span className="text-[10px] text-muted-foreground">{changes.length} change{changes.length === 1 ? '' : 's'}</span>
                </div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(72px,auto)_auto] gap-3 border-b px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span>Column</span>
                  <span>Type</span>
                  <span>Change</span>
                </div>
                <div className="divide-y divide-border">
                  {changes.map(change => {
                    const checked = approvedIds.includes(change.id);
                    return (
                      <label
                        key={change.id}
                        className={cn(
                          'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_minmax(72px,auto)_auto] items-center gap-3 px-3 py-2.5 transition-colors',
                          checked ? 'bg-background text-foreground hover:bg-muted/50' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        {selectable ? <Checkbox
                          checked={checked}
                          onCheckedChange={() => onApprovedIdsChange(checked
                            ? approvedIds.filter(id => id !== change.id)
                            : [...approvedIds, change.id])}
                          className="border-border bg-transparent data-checked:border-emerald-500 data-checked:bg-emerald-500"
                        /> : <span className="size-2 rounded-full bg-muted-foreground/50" />}
                        <span className="min-w-0 truncate text-sm font-medium">{fieldName(change)}</span>
                        <code className="truncate font-mono text-xs text-muted-foreground">{changeType(change)}</code>
                        <span className={cn(
                          'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                          change.state === 'new' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                          change.state === 'deleted' && 'border-destructive/30 bg-destructive/10 text-destructive',
                          change.state === 'modified' && 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        )}>{change.state}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border bg-popover/95 p-2.5 shadow-2xl backdrop-blur-md no-scrollbar">
        <div className="flex shrink-0 items-center gap-2 px-1.5">
          {label && <>
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="max-w-52 truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
            <Separator orientation="vertical" className="mx-1 h-4" />
          </>}
          <div className="flex gap-2 text-[11px] font-bold">
            {diff.newCount > 0 && <span className="text-emerald-500">{diff.newCount} New</span>}
            {diff.modifiedCount > 0 && <span className="text-amber-500">{diff.modifiedCount} Mod</span>}
            {diff.deletedCount > 0 && <span className="text-destructive">{diff.deletedCount} Del</span>}
          </div>
          {kindSummary && <span className="text-[10px] text-muted-foreground">{kindSummary}</span>}
        </div>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => onShowChecklistChange(!showChecklist)}>Review Changes</Button>
          <Button variant="destructive" onClick={onReject}>{rejectLabel}</Button>
          {canMerge && <Button onClick={onMerge} disabled={approvedIds.length === 0}>Merge Selected</Button>}
        </div>
      </div>
    </div>
  );
}
