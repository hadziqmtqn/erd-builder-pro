import React from 'react';
import { Plus, Trash2, Key, Check, X, Palette, Type } from 'lucide-react';
import { Entity, Column } from '../types';
import { COLUMN_TYPES, cn } from '../lib/utils';

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
  if (!selectedEntity) {
    return (
      <div className="w-80 glass-panel h-full p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center mb-4">
          <Settings2 className="w-8 h-8 text-text-secondary" />
        </div>
        <h3 className="text-sm font-semibold text-text-primary">No Selection</h3>
        <p className="text-xs text-text-secondary mt-2">Select a table on the canvas to edit its properties.</p>
      </div>
    );
  }

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
    <div className="w-80 glass-panel h-full flex flex-col overflow-hidden z-20">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h2 className="font-bold text-sm uppercase tracking-wider text-text-secondary">Properties</h2>
        <button 
          onClick={() => onDeleteEntity(selectedEntity.id)}
          className="p-2 hover:bg-red-500/10 text-text-secondary hover:text-red-400 rounded-lg transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Entity Settings */}
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Table Name</label>
            <div className="relative">
              <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                value={selectedEntity.name}
                onChange={(e) => handleEntityNameChange(e.target.value)}
                className="w-full bg-bg-tertiary border border-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Theme Color</label>
            <div className="flex flex-wrap gap-2">
              {['#6366f1', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map(color => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-all",
                    selectedEntity.color === color ? "border-white scale-110" : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Columns Settings */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Columns</label>
            <button 
              onClick={addColumn}
              className="p-1.5 bg-bg-tertiary hover:bg-accent-primary text-text-secondary hover:text-white rounded-md transition-all"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3">
            {selectedEntity.columns.map((col) => (
              <div key={col.id} className="p-3 bg-bg-tertiary rounded-xl border border-border space-y-3 group">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                    className="flex-1 bg-transparent text-xs font-semibold focus:outline-none"
                  />
                  <button 
                    onClick={() => deleteColumn(col.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={col.type}
                    onChange={(e) => updateColumn(col.id, { type: e.target.value })}
                    className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-[10px] focus:outline-none"
                  >
                    {COLUMN_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => updateColumn(col.id, { is_pk: !col.is_pk })}
                    className={cn(
                      "p-1 rounded transition-all",
                      col.is_pk ? "bg-yellow-500/20 text-yellow-500" : "bg-bg-primary text-text-secondary hover:text-text-primary"
                    )}
                    title="Primary Key"
                  >
                    <Key className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => updateColumn(col.id, { is_nullable: !col.is_nullable })}
                    className={cn(
                      "p-1 rounded transition-all",
                      !col.is_nullable ? "bg-accent-primary/20 text-accent-primary" : "bg-bg-primary text-text-secondary hover:text-text-primary"
                    )}
                    title="Not Null"
                  >
                    {col.is_nullable ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

import { Settings2 } from 'lucide-react';
