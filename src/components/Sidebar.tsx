import React, { useState } from 'react';
import { 
  Plus, Trash2, FileText, ChevronLeft, ChevronRight, Save, 
  Database, LogOut, Folder, StickyNote, Trash, ChevronDown, 
  ChevronRight as ChevronRightIcon, FolderPlus, MoreVertical,
  RotateCcw
} from 'lucide-react';
import { FileData, Project, Note } from '../types';
import { cn } from '../lib/utils';

interface SidebarProps {
  files: FileData[];
  notes: Note[];
  projects: Project[];
  activeFileId: number | null;
  activeNoteId: number | null;
  activeProjectId: number | null;
  view: 'erd' | 'notes' | 'trash';
  onViewChange: (view: 'erd' | 'notes' | 'trash') => void;
  onFileSelect: (id: number) => void;
  onNoteSelect: (id: number) => void;
  onProjectSelect: (id: number | null) => void;
  onFileCreate: (name: string, projectId?: number | null) => void;
  onNoteCreate: (title: string, projectId?: number | null) => void;
  onProjectCreate: (name: string) => void;
  onFileDelete: (id: number) => void;
  onNoteDelete: (id: number) => void;
  onLogout: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onMoveFileToProject: (fileId: number, projectId: number | null) => void;
  onMoveNoteToProject: (noteId: number, projectId: number | null) => void;
}

export default function Sidebar({ 
  files, 
  notes,
  projects,
  activeFileId, 
  activeNoteId,
  activeProjectId,
  view,
  onViewChange,
  onFileSelect, 
  onNoteSelect,
  onProjectSelect,
  onFileCreate, 
  onNoteCreate,
  onProjectCreate,
  onFileDelete,
  onNoteDelete,
  onLogout,
  saveStatus,
  onMoveFileToProject,
  onMoveNoteToProject
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [newFileName, setNewFileName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Record<number, boolean>>({});

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    if (view === 'erd') {
      onFileCreate(newFileName.trim(), activeProjectId);
    } else if (view === 'notes') {
      onNoteCreate(newFileName.trim(), activeProjectId);
    }
    setNewFileName('');
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onProjectCreate(newProjectName.trim());
    setNewProjectName('');
    setShowNewProject(false);
  };

  const toggleProject = (id: number) => {
    setExpandedProjects(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredFiles = (activeProjectId 
    ? files.filter(f => f.project_id === activeProjectId)
    : files).filter(f => !f.is_deleted);

  const filteredNotes = (activeProjectId
    ? notes.filter(n => n.project_id === activeProjectId)
    : notes).filter(n => !n.is_deleted);

  return (
    <div className={cn(
      "h-full glass-panel transition-all duration-300 flex flex-col relative z-20",
      isOpen ? "w-72" : "w-0"
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
        <div className="p-4 border-b border-border flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-bold text-lg tracking-tight">ERD & Notes</h1>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-text-secondary hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* View Switcher */}
          <div className="flex bg-bg-tertiary p-1 rounded-lg border border-border">
            <button
              onClick={() => onViewChange('erd')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all",
                view === 'erd' ? "bg-white text-accent-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <Database size={14} />
              ERD
            </button>
            <button
              onClick={() => onViewChange('notes')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all",
                view === 'notes' ? "bg-white text-accent-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <StickyNote size={14} />
              Notes
            </button>
            <button
              onClick={() => onViewChange('trash')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all",
                view === 'trash' ? "bg-white text-red-500 shadow-sm" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <Trash size={14} />
              Trash
            </button>
          </div>
        </div>

        {/* Projects Section */}
        {view !== 'trash' && (
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Projects</h2>
              <button 
                onClick={() => setShowNewProject(!showNewProject)}
                className="p-1 hover:bg-bg-tertiary rounded transition-colors"
              >
                <FolderPlus size={14} className="text-text-secondary" />
              </button>
            </div>
            
            {showNewProject && (
              <form onSubmit={handleCreateProject} className="mb-2">
                <input
                  autoFocus
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name..."
                  className="w-full bg-bg-tertiary border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
              </form>
            )}

            <div className="space-y-1 max-h-40 overflow-y-auto">
              <button
                onClick={() => onProjectSelect(null)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeProjectId === null ? "bg-accent-primary/10 text-accent-primary" : "text-text-secondary hover:bg-bg-tertiary"
                )}
              >
                <Folder size={14} />
                All Projects
              </button>
              {projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => onProjectSelect(project.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                    activeProjectId === project.id ? "bg-accent-primary/10 text-accent-primary" : "text-text-secondary hover:bg-bg-tertiary"
                  )}
                >
                  <Folder size={14} />
                  {project.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New Item Form */}
        {view !== 'trash' && (
          <form onSubmit={handleCreateFile} className="p-4">
            <div className="relative">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={view === 'erd' ? "New diagram..." : "New note..."}
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
        )}

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {view === 'erd' && filteredFiles.map((file) => (
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
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <select
                  className="bg-bg-tertiary border border-border rounded text-[10px] px-1 focus:outline-none"
                  value={file.project_id || ''}
                  onChange={(e) => {
                    e.stopPropagation();
                    onMoveFileToProject(file.id, e.target.value ? parseInt(e.target.value) : null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">No Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileDelete(file.id);
                  }}
                  className="p-1 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {view === 'notes' && filteredNotes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all",
                activeNoteId === note.id 
                  ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20" 
                  : "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary"
              )}
              onClick={() => onNoteSelect(note.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <StickyNote className={cn("w-4 h-4 flex-shrink-0", activeNoteId === note.id ? "text-accent-primary" : "text-text-secondary")} />
                <span className="text-sm font-medium truncate">{note.title}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <select
                  className="bg-bg-tertiary border border-border rounded text-[10px] px-1 focus:outline-none"
                  value={note.project_id || ''}
                  onChange={(e) => {
                    e.stopPropagation();
                    onMoveNoteToProject(note.id, e.target.value ? parseInt(e.target.value) : null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">No Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNoteDelete(note.id);
                  }}
                  className="p-1 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {view === 'trash' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-2 mb-2">ERD Trash</h3>
                {files.filter(f => f.is_deleted).map(file => (
                  <div key={file.id} className="flex items-center justify-between px-3 py-2 text-text-secondary text-sm">
                    <span className="truncate">{file.name}</span>
                    <button onClick={() => onFileSelect(file.id)} className="p-1 hover:text-accent-primary"><RotateCcw size={14} /></button>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-2 mb-2">Notes Trash</h3>
                {notes.filter(n => n.is_deleted).map(note => (
                  <div key={note.id} className="flex items-center justify-between px-3 py-2 text-text-secondary text-sm">
                    <span className="truncate">{note.title}</span>
                    <button onClick={() => onNoteSelect(note.id)} className="p-1 hover:text-accent-primary"><RotateCcw size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Status */}
        <div className="p-4 border-t border-border flex items-center justify-between text-[10px] text-text-secondary font-medium">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full transition-all duration-300",
              saveStatus === 'saving' && "bg-yellow-500 animate-pulse",
              saveStatus === 'saved' && "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]",
              saveStatus === 'error' && "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
              saveStatus === 'idle' && "bg-text-secondary/30"
            )} />
            <span>
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Changes saved'}
              {saveStatus === 'error' && 'Save failed'}
              {saveStatus === 'idle' && 'All changes synced'}
            </span>
          </div>
          <Save className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
