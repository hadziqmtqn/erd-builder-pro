import React, { useState } from 'react';
import { Plus, Trash2, FileText, ChevronLeft, ChevronRight, Save, Database, LogOut } from 'lucide-react';
import { FileData } from '../types';
import { cn } from '../lib/utils';

interface SidebarProps {
  files: FileData[];
  activeFileId: number | null;
  onFileSelect: (id: number) => void;
  onFileCreate: (name: string) => void;
  onFileDelete: (id: number) => void;
  onLogout: () => void;
  isSaving: boolean;
}

export default function Sidebar({ 
  files, 
  activeFileId, 
  onFileSelect, 
  onFileCreate, 
  onFileDelete,
  onLogout,
  isSaving
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [newFileName, setNewFileName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    onFileCreate(newFileName.trim());
    setNewFileName('');
  };

  return (
    <div className={cn(
      "h-full glass-panel transition-all duration-300 flex flex-col relative z-20",
      isOpen ? "w-64" : "w-0"
    )}>
      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-bg-secondary border border-border flex items-center justify-center hover:bg-bg-tertiary transition-colors z-30"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      <div className={cn("flex-1 flex flex-col overflow-hidden", !isOpen && "opacity-0 invisible")}>
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">ERD Builder</h1>
              <p className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold">Eraser Style</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="p-2 text-text-secondary hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* New File Form */}
        <form onSubmit={handleCreate} className="p-4">
          <div className="relative">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="New diagram name..."
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 transition-all"
            />
            <button 
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-accent-primary transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all",
                activeFileId === file.id 
                  ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20" 
                  : "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary"
              )}
              onClick={() => onFileSelect(file.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <FileText className={cn("w-4 h-4 flex-shrink-0", activeFileId === file.id ? "text-accent-primary" : "text-text-secondary")} />
                <span className="text-sm font-medium truncate">{file.name}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFileDelete(file.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer Status */}
        <div className="p-4 border-t border-border flex items-center justify-between text-[10px] text-text-secondary font-medium">
          <div className="flex items-center gap-2">
            <div className={cn("w-1.5 h-1.5 rounded-full", isSaving ? "bg-yellow-500 animate-pulse" : "bg-green-500")} />
            {isSaving ? "Saving..." : "All changes saved"}
          </div>
          <Save className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
