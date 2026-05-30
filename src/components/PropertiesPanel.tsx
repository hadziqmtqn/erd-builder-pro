import { toast } from 'sonner';
import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Key, Check, X, Type, ChevronUp, ChevronDown, Wand2 } from 'lucide-react';
import { Entity, Column } from '../types';
import { COLUMN_TYPES, cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

interface PropertiesPanelProps {
  selectedEntity: Entity | null;
  onUpdateEntity: (entity: Entity, options?: { immediate?: boolean }) => void;
  onDeleteEntity: (id: string) => void;
}

export default function PropertiesPanel({ 
  selectedEntity, 
  onUpdateEntity, 
  onDeleteEntity
}: PropertiesPanelProps) {
  const [editingEntity, setEditingEntity] = useState<Entity | null>(selectedEntity);
  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null);
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
      is_pk: false,
      is_nullable: true,
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

  const moveColumn = (colId: string, direction: 'up' | 'down') => {
    // 1. Get all columns sorted by current sort_order to establish a baseline
    const sortedCols = [...editingEntity.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const index = sortedCols.findIndex(c => c.id === colId);
    
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedCols.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // 2. Perform the swap
    const newArray = [...sortedCols];
    const temp = newArray[index];
    newArray[index] = newArray[targetIndex];
    newArray[targetIndex] = temp;

    // 3. Re-assign sort_orders based on the new array index to ensure they are unique and correct
    const updatedColumns = newArray.map((col, i) => ({
      ...col,
      sort_order: i
    }));

    const updated = { ...editingEntity, columns: updatedColumns };
    setEditingEntity(updated);
    syncWithParent(updated, true); // Immediate save for re-ordering
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
    const updated = {
      ...editingEntity,
      columns: editingEntity.columns.map(c => c.id === colId ? { ...c, ...updates } : c),
    };
    setEditingEntity(updated);
    syncWithParent(updated, immediate);
  };

  const handleReorder = (reorderedColumns: Column[]) => {
    // Assign new sort_order based on new array index
    const updatedColumns = reorderedColumns.map((col, index) => ({
      ...col,
      sort_order: index
    }));

    const updated = { ...editingEntity, columns: updatedColumns };
    setEditingEntity(updated);
    syncWithParent(updated, true); // Immediate sync on drop
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
              {['#6366f1', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map(color => (
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
          </div>
          <Button 
            onClick={addColumn}
            className="h-8 w-8 rounded-full shadow-sm hover:shadow-md transition-all bg-white text-black hover:bg-white/90"
            size="icon"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

      <section className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3 min-h-0">
        <div className="space-y-3">
          {[...editingEntity.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((col, index, arr) => (
            <Card key={col.id} className="p-3 bg-muted/10 space-y-3 border border-border/30 shadow-none hover:border-primary/30 transition-all">
              <div className="flex items-start gap-3">
                {/* Re-order Controls (Always Visible) */}
                <div className="flex flex-col gap-1 mt-1">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    disabled={index === 0}
                    onClick={() => moveColumn(col.id, 'up')}
                    className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-30"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    disabled={index === arr.length - 1}
                    onClick={() => moveColumn(col.id, 'down')}
                    className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
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
                      className="h-8 text-xs font-bold bg-background/50 border-border/50 focus-visible:ring-1 shadow-sm transition-all"
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
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        value={col.type}
                        onValueChange={(value) => updateColumnSync(col.id, { type: value ?? '' }, true)}
                      >
                        <SelectTrigger className="h-8 text-[11px] font-medium bg-background/50 border-border/50">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="z-[1100]">
                          {COLUMN_TYPES.map(type => (
                            <SelectItem key={type} value={type} className="text-[11px]">
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
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
                        onClick={() => updateColumnSync(col.id, { is_nullable: !col.is_nullable }, true)}
                        className={cn(
                          "h-8 w-8 transition-all",
                          !col.is_nullable ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-background/50"
                        )}
                        title="Not Null"
                      >
                        {col.is_nullable ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {col.type === 'ENUM' && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                      <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Enum Values</Label>
                      <Input
                        type="text"
                        value={col.enum_values || ''}
                        onChange={(e) => updateColumnLocal(col.id, { enum_values: e.target.value })}
                        onBlur={() => syncWithParent(editingEntity)}
                        placeholder="active, inactive..."
                        className="h-7 text-[10px] bg-background/50 border-border/50"
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
          <div ref={scrollRef} />
        </div>
      </section>

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
