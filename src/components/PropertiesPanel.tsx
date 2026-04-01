import React, { useState } from 'react';
import { Plus, Trash2, Key, Check, X, Palette, Type, Settings2, ChevronRight } from 'lucide-react';
import { Entity, Column } from '../types';
import { COLUMN_TYPES, cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  onDeleteEntity,
  onClose
}: PropertiesPanelProps & { onClose?: () => void }) {
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

  if (!selectedEntity) return null;

  const handleEntityNameChange = (name: string) => {
    onUpdateEntity({ ...selectedEntity, name });
  };

  const handleColorChange = (color: string) => {
    onUpdateEntity({ ...selectedEntity, color });
  };

  const addColumn = () => {
    const newColumn: Column = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'new_column',
      type: 'VARCHAR',
      is_pk: false,
      is_nullable: true,
    };
    onUpdateEntity({
      ...selectedEntity,
      columns: [...selectedEntity.columns, newColumn],
    });
  };

  const updateColumn = (colId: string, updates: Partial<Column>) => {
    onUpdateEntity({
      ...selectedEntity,
      columns: selectedEntity.columns.map(c => c.id === colId ? { ...c, ...updates } : c),
    });
  };

  const deleteColumn = (colId: string) => {
    onUpdateEntity({
      ...selectedEntity,
      columns: selectedEntity.columns.filter(c => c.id !== colId),
    });
  };

  return (
    <div className="w-full bg-background h-full flex flex-col overflow-hidden z-20">
      <div className="p-6 border-b flex items-center justify-between">
        <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Properties</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost"
            size="icon"
            onClick={() => setConfirmModal({
              isOpen: true,
              title: 'Delete Table',
              message: `Are you sure you want to delete the table "${selectedEntity.name}"?`,
              onConfirm: () => {
                onDeleteEntity(selectedEntity.id);
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                if (onClose) onClose();
              }
            })}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8">
          {/* Entity Settings */}
          <section className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Table Name</Label>
              <div className="relative">
                <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                <Input
                  type="text"
                  value={selectedEntity.name}
                  onChange={(e) => handleEntityNameChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme Color</Label>
              <div className="flex flex-wrap gap-2">
                {['#6366f1', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map(color => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      selectedEntity.color === color ? "border-foreground scale-110" : "border-transparent hover:scale-105"
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
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Columns</Label>
              <Button 
                variant="secondary"
                size="icon"
                onClick={addColumn}
                className="h-7 w-7"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            <div className="space-y-3">
              {selectedEntity.columns.map((col) => (
                <Card key={col.id} className="p-3 bg-muted/30 space-y-3 group border-none shadow-none">
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                      className="h-7 text-xs font-semibold bg-transparent border-none shadow-none focus-visible:ring-0 p-0"
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
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={col.type}
                      onValueChange={(value) => updateColumn(col.id, { type: value })}
                    >
                      <SelectTrigger className="h-7 text-[10px] flex-1 bg-background">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMN_TYPES.map(type => (
                          <SelectItem key={type} value={type} className="text-[10px]">
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant={col.is_pk ? "default" : "outline"}
                      size="icon"
                      onClick={() => updateColumn(col.id, { is_pk: !col.is_pk })}
                      className={cn(
                        "h-7 w-7 transition-all",
                        col.is_pk ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "text-muted-foreground"
                      )}
                      title="Primary Key"
                    >
                      <Key className="w-3 h-3" />
                    </Button>

                    <Button
                      variant={!col.is_nullable ? "default" : "outline"}
                      size="icon"
                      onClick={() => updateColumn(col.id, { is_nullable: !col.is_nullable })}
                      className={cn(
                        "h-7 w-7 transition-all",
                        !col.is_nullable ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "text-muted-foreground"
                      )}
                      title="Not Null"
                    >
                      {col.is_nullable ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                    </Button>
                  </div>

                  {col.type === 'ENUM' && (
                    <div className="space-y-1">
                      <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Enum Values (comma separated)</Label>
                      <Input
                        type="text"
                        value={col.enum_values || ''}
                        onChange={(e) => updateColumn(col.id, { enum_values: e.target.value })}
                        placeholder="e.g. active, inactive, pending"
                        className="h-7 text-[10px] bg-background"
                      />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>

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
