import { toast } from 'sonner';
import { useState, useEffect, useRef, type PointerEvent } from 'react';
import { ArrowLeft, Plus, Trash2, Key, Check, X, Type, GripVertical, Wand2, MoreHorizontal, Clock3 } from 'lucide-react';
import { Entity, Column } from '../types';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ColumnTypeSelect } from './ColumnTypeSelect';
import TableCodePanel from './diagram/TableCodePanel';
import { normalizeColumnDefault, supportsColumnLength, supportsNumericPrecision } from '@/lib/column-metadata';
import { reorderColumns } from '@/lib/reorder-columns';

const THEME_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
const DEFAULT_VARCHAR_LENGTH = 255;
const AUDIT_COLUMN_OPTIONS = [
  { name: 'created_at', type: 'TIMESTAMP', is_nullable: false },
  { name: 'updated_at', type: 'TIMESTAMP', is_nullable: false },
  { name: 'deleted_at', type: 'TIMESTAMP', is_nullable: true },
] as const;

const optionalInt = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

interface PropertiesPanelProps {
  selectedEntity: Entity | null;
  onUpdateEntity: (entity: Entity, options?: { immediate?: boolean }) => void;
  onDeleteEntity: (id: string) => void;
  onBackToTables?: () => void;
}

export default function PropertiesPanel({ 
  selectedEntity, 
  onUpdateEntity, 
  onDeleteEntity,
  onBackToTables,
}: PropertiesPanelProps) {
  const [editingEntity, setEditingEntity] = useState<Entity | null>(selectedEntity);
  const [activeEditorTab, setActiveEditorTab] = useState<'properties' | 'schema' | 'dbml'>('properties');
  const [openAttributeColumnId, setOpenAttributeColumnId] = useState<string | null>(null);
  const [auditColumnSelection, setAuditColumnSelection] = useState<Record<string, boolean>>(
    Object.fromEntries(AUDIT_COLUMN_OPTIONS.map(column => [column.name, true])),
  );
  const [auditColumnMenuOpen, setAuditColumnMenuOpen] = useState(false);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);
  const draggedColumnIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<typeof dropTarget>(null);
  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const suppressColumnBlurRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevColumnsCount = useRef(editingEntity?.columns?.length || 0);
  const lastAddedIdRef = useRef<string | null>(null);

  // Auto-scroll to bottom when columns are added
  useEffect(() => {
    const currentLength = editingEntity?.columns?.length || 0;
    if (currentLength > prevColumnsCount.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
    prevColumnsCount.current = currentLength;
  }, [editingEntity?.columns?.length]);
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Sync internal state when selected entity changes (different ID)
  useEffect(() => {
    if (selectedEntity?.id !== editingEntity?.id) {
      setEditingEntity(selectedEntity);
    }
  }, [selectedEntity?.id]);

  if (!selectedEntity || !editingEntity) return null;

  const syncWithParent = (updated: Entity, immediate: boolean = false) => {
    if (immediate) {
      // Debounce immediate updates specifically for rapid UI interactions (e.g. clicking "Up" 5 times)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = setTimeout(() => {
        onUpdateEntity(updated, { immediate: true });
      }, 300);
    } else {
      onUpdateEntity(updated);
    }
  };

  const handleEntityNameChange = (name: string) => {
    setEditingEntity({ ...editingEntity, name });
  };

  const handleColorChange = (color: string) => {
    const updated = { ...editingEntity, color };
    setEditingEntity(updated);
    syncWithParent(updated, true); // Immediate update for color
  };

  const addColumn = () => {
    const maxSortOrder = editingEntity.columns.reduce((max, col) => Math.max(max, col.sort_order || 0), -1);
    const newColumn: Column = {
      id: Math.random().toString(36).substring(2, 11),
      name: 'new_column',
      type: 'VARCHAR',
      max_length: DEFAULT_VARCHAR_LENGTH,
      is_pk: false,
      is_nullable: true,
      default_value: 'NULL',
      sort_order: maxSortOrder + 1,
    };
    const updated = {
      ...editingEntity,
      columns: [...editingEntity.columns, newColumn],
    };
    // Track the new column ID for auto-focus
    lastAddedIdRef.current = newColumn.id;
    setEditingEntity(updated);
    syncWithParent(updated, true); // Immediate save for new column
  };

  const generateAuditColumns = () => {
    const existingNames = new Set(editingEntity.columns.map(column => column.name.toLowerCase()));
    const columnsToAdd = AUDIT_COLUMN_OPTIONS.filter(column => auditColumnSelection[column.name] && !existingNames.has(column.name));
    if (columnsToAdd.length === 0) {
      toast.info('Selected audit columns already exist or none were selected');
      return;
    }

    const nextSortOrder = editingEntity.columns.reduce((max, column) => Math.max(max, column.sort_order || 0), -1) + 1;
    const generatedColumns: Column[] = columnsToAdd.map((column, index) => ({
      id: crypto.randomUUID(),
      name: column.name,
      type: column.type,
      is_pk: false,
      is_nullable: column.is_nullable,
      default_value: normalizeColumnDefault(column.is_nullable ? 'NULL' : null, column.is_nullable),
      sort_order: nextSortOrder + index,
    }));
    const updated = { ...editingEntity, columns: [...editingEntity.columns, ...generatedColumns] };
    lastAddedIdRef.current = generatedColumns[generatedColumns.length - 1].id;
    setEditingEntity(updated);
    syncWithParent(updated, true);
    setAuditColumnMenuOpen(false);
    toast.success(`${generatedColumns.length} audit column${generatedColumns.length === 1 ? '' : 's'} added`);
  };

  const normalizeColumns = () => {
    // Sort PKs first, then everything else by their current sort order
    const PKs = editingEntity.columns.filter(c => c.is_pk).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const nonPKs = editingEntity.columns.filter(c => !c.is_pk).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const combined = [...PKs, ...nonPKs].map((col, index) => ({
      ...col,
      sort_order: index
    }));

    const updated = { ...editingEntity, columns: combined };
    setEditingEntity(updated);
    syncWithParent(updated, true); // CRITICAL: Immediate save for normalization
  };

  const updateColumnLocal = (colId: string, updates: Partial<Column>) => {
    setEditingEntity({
      ...editingEntity,
      columns: editingEntity.columns.map(c => c.id === colId ? { ...c, ...updates } : c),
    });
  };

  const updateColumnSync = (colId: string, updates: Partial<Column>, immediate: boolean = false) => {
    if (suppressColumnBlurRef.current) {
      suppressColumnBlurRef.current = false;
      return;
    }

    // Validate duplicate column name before syncing
    if ('name' in updates && typeof updates.name === 'string') {
      const newName = updates.name.trim();
      const isDuplicate = editingEntity.columns.some(
        c => c.id !== colId && c.name.toLowerCase() === newName.toLowerCase()
      );
      if (isDuplicate) {
        toast.error(`Column name "${newName}" already exists in this table`);
        // Revert local state to current value (before onChange changed it)
        const currentCol = editingEntity.columns.find(c => c.id === colId);
        if (currentCol) {
          setEditingEntity({
            ...editingEntity,
            columns: editingEntity.columns.map(c => c.id === colId ? currentCol : c),
          });
        }
        return;
      }
      // Use trimmed name
      updates = { ...updates, name: newName };
    }
    if ('type' in updates) {
      const currentCol = editingEntity.columns.find(c => c.id === colId);
      updates = {
        ...updates,
        ...(/^varchar$/i.test(String(updates.type)) && currentCol?.max_length == null && { max_length: DEFAULT_VARCHAR_LENGTH }),
        ...(!supportsColumnLength(updates.type) && { max_length: null }),
        ...(!supportsNumericPrecision(updates.type) && { numeric_precision: null, numeric_scale: null }),
      };
    }
    const updated = {
      ...editingEntity,
      columns: editingEntity.columns.map(c => {
        if (c.id !== colId) return c;
        const next = { ...c, ...updates };
        const defaultValue = normalizeColumnDefault(next.default_value, Boolean(next.is_nullable));
        return Boolean(next.is_nullable) && !defaultValue
          ? { ...next, default_value: 'NULL' }
          : { ...next, default_value: defaultValue };
      }),
    };
    setEditingEntity(updated);
    syncWithParent(updated, immediate);
  };

  const handleReorder = (reorderedColumns: Column[]) => {
    const updated = { ...editingEntity, columns: reorderedColumns };
    setEditingEntity(updated);
    syncWithParent(updated, true); // Immediate sync on drop
  };

  const clearColumnDrag = () => {
    draggedColumnIdRef.current = null;
    dropTargetRef.current = null;
    setDropTarget(null);
    setDraggedColumnId(null);
  };

  const handleColumnPointerDown = (event: PointerEvent<HTMLButtonElement>, columnId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedColumnIdRef.current = columnId;
    setDraggedColumnId(columnId);
  };

  const handleColumnPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggedColumnIdRef.current) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-column-id]');
    const id = target?.dataset.columnId;
    if (!target || !id) return;
    const rect = target.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2
      ? 'before'
      : 'after';
    const next = { id, position } as const;
    dropTargetRef.current = next;
    setDropTarget(current => current?.id === id && current.position === position ? current : next);
  };

  const handleColumnPointerUp = (event: PointerEvent<HTMLButtonElement>, sourceId: string) => {
    event.preventDefault();
    const target = dropTargetRef.current;
    const reordered = target && reorderColumns(editingEntity.columns, sourceId, target.id, target.position);
    if (reordered) handleReorder(reordered);
    clearColumnDrag();
  };

  const deleteColumn = (colId: string) => {
    const updated = {
      ...editingEntity,
      columns: editingEntity.columns.filter(c => c.id !== colId),
    };
    setEditingEntity(updated);
    syncWithParent(updated, true); // Immediate save for deletion
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b border-border bg-background px-4 py-3">
        {onBackToTables && (
          <div className="mb-3 flex min-w-0 items-center gap-2 text-xs">
            <button type="button" onClick={onBackToTables} className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Tables
            </button>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-medium text-foreground">{editingEntity.name}</span>
          </div>
        )}
        <div className="flex w-full gap-1 rounded-lg border border-border bg-muted p-1" aria-label="Table editor sections">
          {[
            ['properties', 'Properties'],
            ['schema', 'Schema'],
            ['dbml', 'DBML'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={activeEditorTab === value}
              onClick={() => setActiveEditorTab(value as 'properties' | 'schema' | 'dbml')}
              className={cn(
                'flex flex-1 items-center justify-center rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                activeEditorTab === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeEditorTab !== 'properties' ? (
        <TableCodePanel
          entity={editingEntity}
          mode={activeEditorTab}
          onUpdateEntity={(updated) => {
            setEditingEntity(updated);
            onUpdateEntity(updated);
          }}
        />
      ) : (
      <>
      <div className="shrink-0 bg-background pt-6 px-6 pb-4 border-b border-border/50 shadow-sm z-10">
        {/* Entity Settings */}
        <section className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Table Name</Label>
            <div className="relative">
              <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
              <Input
                type="text"
                value={editingEntity.name}
                onChange={(e) => handleEntityNameChange(e.target.value)}
                onBlur={() => syncWithParent(editingEntity)}
                className="pl-10 h-10 transition-all focus:ring-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme Color</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {THEME_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-all shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    editingEntity.color === color ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <label
                className={cn(
                  "relative w-7 h-7 rounded-full border-2 transition-all shadow-sm cursor-pointer ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                  !THEME_COLORS.includes(editingEntity.color) ? "border-foreground scale-110 shadow-md" : "hover:scale-105"
                )}
                style={{
                  borderColor: !THEME_COLORS.includes(editingEntity.color) ? undefined : editingEntity.color,
                  backgroundColor: !THEME_COLORS.includes(editingEntity.color) ? editingEntity.color : 'transparent',
                }}
                title="Custom color"
              >
                <Input
                  type="color"
                  value={editingEntity.color}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>
        </section>
      </div>

      {/* Columns Settings Header */}
      <div className="shrink-0 flex items-center justify-between bg-popover/95 py-2 px-6 border-b border-border/50 z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Columns ({editingEntity.columns.length})</Label>
            <Button
              variant="ghost"
              size="icon"
              onClick={normalizeColumns}
              className="h-6 w-6 text-muted-foreground hover:text-primary transition-colors"
              title="Normalize (PKs to top)"
            >
              <Wand2 className="w-3.5 h-3.5" />
            </Button>
            <Popover open={auditColumnMenuOpen} onOpenChange={setAuditColumnMenuOpen}>
              <PopoverTrigger
                render={
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" title="Generate audit columns" aria-label="Generate audit columns">
                    <Clock3 className="w-3.5 h-3.5" />
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-56 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Generate audit columns</p>
                  <p className="text-xs text-muted-foreground">Add common timestamp fields.</p>
                </div>
                <div className="space-y-2">
                  {AUDIT_COLUMN_OPTIONS.map(column => {
                    const exists = editingEntity.columns.some(current => current.name.toLowerCase() === column.name);
                    return (
                      <label key={column.name} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={auditColumnSelection[column.name]}
                          disabled={exists}
                          onCheckedChange={checked => setAuditColumnSelection(current => ({ ...current, [column.name]: checked === true }))}
                        />
                        <span className={cn(exists && 'text-muted-foreground line-through')}>{column.name}</span>
                        {exists && <span className="ml-auto text-[10px] text-muted-foreground">Exists</span>}
                      </label>
                    );
                  })}
                </div>
                <Button type="button" size="sm" className="w-full" onClick={generateAuditColumns}>
                  Generate selected
                </Button>
              </PopoverContent>
            </Popover>
          </div>
          <Button 
            onClick={addColumn}
            className="h-8 w-8 rounded-full shadow-sm hover:shadow-md transition-all bg-white text-black hover:bg-white/90"
            size="icon"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

      <section className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 min-h-0">
        <div className="space-y-2">
          {[...editingEntity.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((col) => (
            <Card
              key={col.id}
              data-column-id={col.id}
              className={cn(
                'gap-1 p-2 bg-muted/10 border border-border/30 shadow-none hover:border-primary/30 transition-all',
                draggedColumnId === col.id && 'opacity-50',
                dropTarget?.id === col.id && dropTarget.position === 'before' && 'border-t-2 border-t-primary',
                dropTarget?.id === col.id && dropTarget.position === 'after' && 'border-b-2 border-b-primary',
              )}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Drag ${col.name} to reorder`}
                  title="Drag to reorder"
                  onPointerDown={(event) => handleColumnPointerDown(event, col.id)}
                  onPointerMove={handleColumnPointerMove}
                  onPointerUp={(event) => handleColumnPointerUp(event, col.id)}
                  onPointerCancel={clearColumnDrag}
                  className="h-7 w-6 shrink-0 touch-none select-none cursor-grab rounded text-muted-foreground hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
                >
                  <GripVertical className="mx-auto h-4 w-4" />
                </button>

                <Input
                  ref={(el) => {
                    if (el && col.id === lastAddedIdRef.current) {
                      el.focus();
                      el.select();
                      lastAddedIdRef.current = null;
                    }
                  }}
                  placeholder="Column name"
                  value={col.name}
                  onChange={(e) => updateColumnLocal(col.id, { name: e.target.value })}
                  onBlur={(e) => updateColumnSync(col.id, { name: e.target.value })}
                  className="h-8 min-w-0 flex-1 text-xs font-bold bg-background/50 border-border/50 focus-visible:ring-1 shadow-sm transition-all"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmModal({
                    isOpen: true,
                    title: 'Delete Column',
                    message: `Are you sure you want to delete the column "${col.name}"?`,
                    onConfirm: () => {
                      deleteColumn(col.id);
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    }
                  })}
                  className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 shrink-0"
                  title="Delete column"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className={cn(
                "grid gap-1",
                supportsNumericPrecision(col.type)
                  ? "grid-cols-[minmax(0,1fr)_3.75rem_3.75rem_2rem_2rem_2rem]"
                  : supportsColumnLength(col.type)
                    ? "grid-cols-[minmax(0,1fr)_3.75rem_2rem_2rem_2rem]"
                    : "grid-cols-[minmax(0,1fr)_2rem_2rem_2rem]"
              )}>
                <ColumnTypeSelect
                  value={col.type}
                  onValueChange={(value) => updateColumnSync(col.id, { type: value }, true)}
                  className="min-w-0"
                />

                {supportsColumnLength(col.type) && (
                  <Input
                    type="number"
                    min={1}
                    value={col.max_length ?? ''}
                    onChange={(e) => updateColumnLocal(col.id, { max_length: optionalInt(e.target.value) })}
                    onBlur={(e) => updateColumnSync(col.id, { max_length: optionalInt(e.target.value) })}
                    placeholder="Max"
                    className="h-8 px-2 text-[10px] bg-background/50 border-border/50"
                  />
                )}

                {supportsNumericPrecision(col.type) && (
                  <>
                  <Input
                    type="number"
                    min={1}
                    value={col.numeric_precision ?? ''}
                    onChange={(e) => updateColumnLocal(col.id, { numeric_precision: optionalInt(e.target.value) })}
                    onBlur={(e) => updateColumnSync(col.id, { numeric_precision: optionalInt(e.target.value) })}
                    placeholder="Prec"
                    className="h-8 px-2 text-[10px] bg-background/50 border-border/50"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={col.numeric_scale ?? ''}
                    onChange={(e) => updateColumnLocal(col.id, { numeric_scale: optionalInt(e.target.value) })}
                    onBlur={(e) => updateColumnSync(col.id, { numeric_scale: optionalInt(e.target.value) })}
                    placeholder="Scale"
                    className="h-8 px-2 text-[10px] bg-background/50 border-border/50"
                  />
                  </>
                )}

                <Button
                  variant={col.is_pk ? "default" : "outline"}
                  size="icon"
                  onClick={() => updateColumnSync(col.id, { is_pk: !col.is_pk }, true)}
                  className={cn(
                    "h-8 w-8 transition-all",
                    col.is_pk ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "text-muted-foreground hover:text-foreground bg-background/50"
                  )}
                  title="Primary Key"
                >
                  <Key className="w-3.5 h-3.5" />
                </Button>

                <Button
                  variant={!col.is_nullable ? "default" : "outline"}
                  size="icon"
                  onClick={() => updateColumnSync(col.id, { is_nullable: !Boolean(col.is_nullable) }, true)}
                  className={cn(
                    "h-8 w-8 transition-all",
                    !col.is_nullable ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-background/50"
                  )}
                  title="Not Null"
                >
                  {col.is_nullable ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                </Button>

                <Popover
                  open={openAttributeColumnId === col.id}
                  onOpenChange={(open) => setOpenAttributeColumnId(open ? col.id : null)}
                >
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-expanded={openAttributeColumnId === col.id}
                        onMouseDown={() => {
                          suppressColumnBlurRef.current = true;
                          window.setTimeout(() => {
                            suppressColumnBlurRef.current = false;
                          }, 0);
                        }}
                        className={cn(
                          "h-8 w-8 transition-colors",
                          openAttributeColumnId === col.id
                            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                            : "text-muted-foreground hover:text-foreground bg-background/50",
                          col.comment && openAttributeColumnId !== col.id && "border-primary/60",
                        )}
                        title="Field attributes"
                        aria-label="Field attributes"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    }
                  />
                  <PopoverContent align="end" side="left" className="w-72 space-y-2">
                    <Label className="text-xs font-semibold">Field Attributes</Label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={Boolean(col.is_unique)}
                        onCheckedChange={(checked) => updateColumnSync(col.id, { is_unique: checked === true }, true)}
                      />
                      Unique
                    </label>
                    <div className="space-y-1.5">
                      <Label htmlFor={`default-${col.id}`} className="text-xs text-muted-foreground">Default value</Label>
                      <Input
                        id={`default-${col.id}`}
                        value={col.default_value ?? (Boolean(col.is_nullable) ? 'NULL' : '')}
                        onChange={(e) => updateColumnLocal(col.id, { default_value: e.target.value })}
                        onBlur={(e) => updateColumnSync(col.id, { default_value: e.target.value.trim() || null })}
                        placeholder="NULL, 0, CURRENT_TIMESTAMP, 'pending'"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`comment-${col.id}`} className="text-xs text-muted-foreground">Comment</Label>
                      <Textarea
                        id={`comment-${col.id}`}
                        value={col.comment || ''}
                        onChange={(e) => updateColumnLocal(col.id, { comment: e.target.value })}
                        onBlur={(e) => updateColumnSync(col.id, { comment: e.target.value.trim() })}
                        placeholder="Add a comment"
                        className="min-h-20 resize-y text-sm"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {col.type === 'ENUM' && (
                <Input
                  type="text"
                  value={col.enum_values || ''}
                  onChange={(e) => updateColumnLocal(col.id, { enum_values: e.target.value })}
                  onBlur={() => syncWithParent(editingEntity)}
                  placeholder="Enum values: active, inactive..."
                  className="h-8 text-[10px] bg-background/50 border-border/50"
                />
              )}

            </Card>
          ))}
          <div ref={scrollRef} />
        </div>
      </section>
      </>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
