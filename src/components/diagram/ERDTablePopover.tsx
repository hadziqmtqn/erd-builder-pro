import type { CSSProperties } from 'react';
import { Pin, PinOff, X } from 'lucide-react';
import type { Entity } from '@/types';
import PropertiesPanel from '@/components/PropertiesPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/providers/WorkspaceProvider';

interface ERDTablePopoverProps {
  entity: Entity;
  /** Floating next to the table at this canvas position, or docked beside the canvas when null. */
  floating: { left: number; top: number; side: 'left' | 'right' } | null;
  onTogglePin: () => void;
  onClose: () => void;
  onBackToExplorer: () => void;
}

/** Table editor that opens next to its table, or docked beside the canvas when pinned or the pane is wide (ERD-004). */
export function ERDTablePopover({ entity, floating, onTogglePin, onClose, onBackToExplorer }: ERDTablePopoverProps) {
  const { handleEntityUpdate, deleteEntity, setSelectedNodeId } = useWorkspace();
  const style: CSSProperties | undefined = floating ? { left: floating.left, top: floating.top, maxHeight: `calc(100% - ${floating.top + 12}px)` } : undefined;

  return (
    <aside
      aria-label={`Table ${entity.name}`}
      data-side={floating?.side}
      style={style}
      className={cn(
        'nowheel nodrag flex flex-col overflow-hidden border bg-popover text-popover-foreground',
        floating
          ? 'absolute z-30 h-[min(36rem,calc(100%-1.5rem))] w-96 rounded-xl shadow-2xl'
          : 'w-85 shrink-0 rounded-xl max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-[min(21.25rem,100%)] max-md:shadow-xl',
      )}
    >
      <PropertiesPanel
        key={entity.id}
        selectedEntity={entity}
        onUpdateEntity={handleEntityUpdate}
        onBackToTables={onBackToExplorer}
        dbmlReadOnly
        onDeleteEntity={(id) => {
          deleteEntity(id);
          setSelectedNodeId(null);
          onClose();
        }}
        headerActions={<>
          <Button type="button" variant="ghost" size="icon-xs" onClick={onTogglePin} aria-pressed={!floating}
            aria-label={floating ? 'Pin the table editor beside the canvas' : 'Unpin the table editor'} title={floating ? 'Pin' : 'Unpin'}>
            {floating ? <Pin className="size-4" /> : <PinOff className="size-4" />}
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close table editor" title="Close (Esc)">
            <X className="size-4" />
          </Button>
        </>}
      />
    </aside>
  );
}
