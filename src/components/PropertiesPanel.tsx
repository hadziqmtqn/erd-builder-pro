import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Key, Check, X, Palette, Type, Settings2, ChevronRight } from 'lucide-react';
import { Entity, Column } from '../types';
import { COLUMN_TYPES, cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  onUpdateEntity: (entity: Entity) => void;
  onDeleteEntity: (id: string) => void;
}

export default function PropertiesPanel({ 
  selectedEntity, 
  onUpdateEntity, 
  onDeleteEntity
}: PropertiesPanelProps) {
  const [editingEntity, setEditingEntity] = useState<Entity | null>(selectedEntity);
  
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

  const syncWithParent = (updated: Entity) => {
    onUpdateEntity(updated);
  };

  const handleEntityNameChange = (name: string) => {
    setEditingEntity({ ...editingEntity, name });
  };

  const handleColorChange = (color: string) => {
    const updated = { ...editingEntity, color };
    setEditingEntity(updated);
    syncWithParent(updated);
  };

  const addColumn = () => {
    const newColumn: Column = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'new_column',
      type: 'VARCHAR',
      is_pk: false,
      is_nullable: true,
    };
    const updated = {
      ...editingEntity,
      columns: [...editingEntity.columns, newColumn],
    };
    setEditingEntity(updated);
    syncWithParent(updated);
  };

  const updateColumnLocal = (colId: string, updates: Partial<Column>) => {
    setEditingEntity({
      ...editingEntity,
      columns: editingEntity.columns.map(c => c.id === colId ? { ...c, ...updates } : c),
    });
  };

  const updateColumnSync = (colId: string, updates: Partial<Column>) => {
    const updated = {
      ...editingEntity,
      columns: editingEntity.columns.map(c => c.id === colId ? { ...c, ...updates } : c),
    };
    setEditingEntity(updated);
    syncWithParent(updated);
  };

  const deleteColumn = (colId: string) => {
    const updated = {
      ...editingEntity,
      columns: editingEntity.columns.filter(c => c.id !== colId),
    };
    setEditingEntity(updated);
    syncWithParent(updated);
  };

  return (
    <>
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

          <Separator />

          {/* Columns Settings */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Columns ({editingEntity.columns.length})</Label>
              <Button 
                variant="secondary"
                size="icon"
                onClick={addColumn}
                className="h-8 w-8 rounded-full shadow-sm hover:shadow-md transition-all"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              {editingEntity.columns.map((col) => (
                <Card key={col.id} className="p-4 bg-muted/20 space-y-4 group border border-border/40 shadow-none hover:border-border/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <Input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateColumnLocal(col.id, { name: e.target.value })}
                      onBlur={() => syncWithParent(editingEntity)}
                      className="h-8 text-xs font-bold bg-transparent border-none shadow-none focus-visible:ring-0 p-0 text-foreground"
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
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 transition-all shadow-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={col.type}
                      onValueChange={(value) => updateColumnSync(col.id, { type: value })}
                    >
                      <SelectTrigger className="w-full h-8 text-[11px] font-medium bg-background border-border/50">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMN_TYPES.map(type => (
                          <SelectItem key={type} value={type} className="text-[11px]">
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant={col.is_pk ? "default" : "outline"}
                      size="icon"
                      onClick={() => updateColumnSync(col.id, { is_pk: !col.is_pk })}
                      className={cn(
                        "h-8 w-8 transition-all shadow-sm",
                        col.is_pk ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Primary Key"
                    >
                      <Key className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      variant={!col.is_nullable ? "default" : "outline"}
                      size="icon"
                      onClick={() => updateColumnSync(col.id, { is_nullable: !col.is_nullable })}
                      className={cn(
                        "h-8 w-8 transition-all shadow-sm",
                        !col.is_nullable ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Not Null"
                    >
                      {col.is_nullable ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </Button>
                  </div>

                  {col.type === 'ENUM' && (
                    <div className="space-y-2 pt-1 animate-in slide-in-from-top-1 duration-200">
                      <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Enum Values (comma separated)</Label>
                      <Input
                        type="text"
                        value={col.enum_values || ''}
                        onChange={(e) => updateColumnLocal(col.id, { enum_values: e.target.value })}
                        onBlur={() => syncWithParent(editingEntity)}
                        placeholder="e.g. active, inactive, pending"
                        className="h-8 text-[11px] bg-background border-border/50"
                      />
                    </div>
                  )}
                </Card>
              ))}
            </div>
        </section>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
