import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, FileText, ChevronLeft, ChevronRight, Save, 
  Database, LogOut, Folder, StickyNote, Trash, ChevronDown, 
  ChevronRight as ChevronRightIcon, FolderPlus, MoreVertical,
  RotateCcw, PenTool, Edit2, FolderInput
} from 'lucide-react';
import { FileData, Project, Note, Drawing } from '../types';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';

interface SidebarProps {
  files: FileData[];
  notes: Note[];
  drawings: Drawing[];
  projects: Project[];
  trashData: {
    files: FileData[];
    notes: Note[];
    drawings: Drawing[];
    projects: Project[];
  };
  activeFileId: number | null;
  activeNoteId: number | null;
  activeDrawingId: number | null;
  activeProjectId: number | null;
  view: 'erd' | 'notes' | 'drawings' | 'trash';
  onViewChange: (view: 'erd' | 'notes' | 'drawings' | 'trash') => void;
  onFileSelect: (id: number) => void;
  onNoteSelect: (id: number) => void;
  onDrawingSelect: (id: number) => void;
  onProjectSelect: (id: number | null) => void;
  onFileCreate: (name: string, projectId?: number | null) => void;
  onNoteCreate: (title: string, projectId?: number | null) => void;
  onDrawingCreate: (title: string, projectId?: number | null) => void;
  onProjectCreate: (name: string) => void;
  onProjectUpdate: (id: number, name: string) => void;
  onProjectDelete: (id: number) => void;
  onProjectRestore: (id: number) => void;
  onFileDelete: (id: number) => void;
  onNoteDelete: (id: number) => void;
  onDrawingDelete: (id: number) => void;
  onFileRestore: (id: number) => void;
  onNoteRestore: (id: number) => void;
  onDrawingRestore: (id: number) => void;
  onFilePermanentDelete: (id: number) => void;
  onNotePermanentDelete: (id: number) => void;
  onDrawingPermanentDelete: (id: number) => void;
  onProjectPermanentDelete: (id: number) => void;
  onLogout: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onMoveFileToProject: (fileId: number, projectId: number | null) => void;
  onMoveNoteToProject: (noteId: number, projectId: number | null) => void;
  onMoveDrawingToProject: (drawingId: number, projectId: number | null) => void;
  onFileUpdate: (id: number, name: string) => void;
  onNoteUpdate: (id: number, title: string) => void;
  onDrawingUpdate: (id: number, title: string) => void;
}

export default function Sidebar({ 
  files, 
  notes,
  drawings,
  projects,
  trashData,
  activeFileId, 
  activeNoteId,
  activeDrawingId,
  activeProjectId,
  view,
  onViewChange,
  onFileSelect, 
  onNoteSelect,
  onDrawingSelect,
  onProjectSelect,
  onFileCreate, 
  onNoteCreate,
  onDrawingCreate,
  onProjectCreate,
  onProjectUpdate,
  onProjectDelete,
  onProjectRestore,
  onFileDelete,
  onNoteDelete,
  onDrawingDelete,
  onFileRestore,
  onNoteRestore,
  onDrawingRestore,
  onFilePermanentDelete,
  onNotePermanentDelete,
  onDrawingPermanentDelete,
  onProjectPermanentDelete,
  onLogout,
  saveStatus,
  onMoveFileToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject,
  onFileUpdate,
  onNoteUpdate,
  onDrawingUpdate
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [newFileName, setNewFileName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [editingItemId, setEditingItemId] = useState<{id: number, type: 'file' | 'note' | 'drawing'} | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<{id: number, type: 'file' | 'note' | 'drawing'} | null>(null);
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

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    if (view === 'erd') {
      onFileCreate(newFileName.trim(), activeProjectId);
    } else if (view === 'notes') {
      onNoteCreate(newFileName.trim(), activeProjectId);
    } else if (view === 'drawings') {
      onDrawingCreate(newFileName.trim(), activeProjectId);
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

  const activeProject = projects.find(p => p.id === activeProjectId);

  const filteredFiles = (activeProjectId 
    ? files.filter(f => f.project_id === activeProjectId)
    : files).filter(f => !f.is_deleted);

  const filteredNotes = (activeProjectId
    ? notes.filter(n => n.project_id === activeProjectId)
    : notes).filter(n => !n.is_deleted);

  const filteredDrawings = (activeProjectId
    ? drawings.filter(d => d.project_id === activeProjectId)
    : drawings).filter(d => !d.is_deleted);

  const activeProjects = projects.filter(p => !p.is_deleted);

  const popupRef = useRef<HTMLDivElement>(null);

  const isItemExpanded = (id: number, type: 'file' | 'note' | 'drawing') =>
    expandedItemId?.id === id && expandedItemId?.type === type;

  const toggleExpanded = (id: number, type: 'file' | 'note' | 'drawing', e: React.MouseEvent) => {
    e.stopPropagation();
    if (isItemExpanded(id, type)) {
      setExpandedItemId(null);
    } else {
      setExpandedItemId({ id, type });
      setEditingItemId(null);
    }
  };

  // Close popup on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setExpandedItemId(null);
      }
    };
    if (expandedItemId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedItemId]);

  return (
    <div className={cn(
      "h-full glass-panel transition-all duration-300 flex flex-col relative z-20",
      isOpen ? "w-72" : "w-0"
    )}>
      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-bg-secondary border border-border flex items-center justify-center hover:bg-bg-tertiary transition-colors z-30 shadow-xl"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      <div className={cn("flex-1 flex flex-col overflow-hidden", !isOpen && "opacity-0 invisible")}>
        {/* Header */}
        <div className="p-5 border-b border-border bg-bg-secondary/30">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg shadow-accent-primary/20">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-base leading-tight">ERD Builder</h1>
                <p className="text-[10px] text-text-secondary font-medium tracking-wider uppercase">Workspace</p>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-text-secondary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* View Switcher - Redesigned Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-bg-tertiary/50 rounded-xl border border-border">
            {[
              { id: 'erd', icon: Database, label: 'ERD', color: 'text-blue-400' },
              { id: 'notes', icon: StickyNote, label: 'Notes', color: 'text-yellow-400' },
              { id: 'drawings', icon: PenTool, label: 'Draw', color: 'text-purple-400' },
              { id: 'trash', icon: Trash, label: 'Trash', color: 'text-red-400' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id as any)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all relative group",
                  view === tab.id 
                    ? "bg-white text-accent-primary shadow-sm" 
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                )}
              >
                <tab.icon size={14} className={cn("transition-transform group-hover:scale-110", view === tab.id ? "text-accent-primary" : tab.color)} />
                <span className="text-[9px] font-bold uppercase tracking-tighter">{tab.label}</span>
                {view === tab.id && (
                  <div className="absolute -bottom-1 w-1 h-1 bg-accent-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Projects Section - Redesigned */}
        {view !== 'trash' && (
          <div className="px-4 py-4 border-b border-border bg-bg-secondary/10">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <Folder className="w-3 h-3 text-accent-primary" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Projects</h2>
              </div>
              <button 
                onClick={() => setShowNewProject(!showNewProject)}
                className={cn(
                  "p-1.5 rounded-lg transition-all text-text-secondary hover:text-accent-primary",
                  showNewProject ? "bg-accent-primary/10 text-accent-primary rotate-45" : "hover:bg-bg-tertiary"
                )}
              >
                <Plus size={14} />
              </button>
            </div>
            
            {showNewProject && (
              <form onSubmit={handleCreateProject} className="mb-3 px-1 animate-in slide-in-from-top-2 duration-200">
                <input
                  autoFocus
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name..."
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent-primary/50 transition-all"
                />
              </form>
            )}

            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
              <button
                onClick={() => onProjectSelect(null)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all",
                  activeProjectId === null 
                    ? "bg-accent-primary text-white shadow-lg shadow-accent-primary/20" 
                    : "text-text-secondary hover:bg-bg-tertiary"
                )}
              >
                <Folder size={16} />
                All Workspace
              </button>
              {activeProjects.map(project => (
                <div key={project.id} className="group relative">
                  {editingProjectId === project.id ? (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editingProjectName.trim()) {
                          onProjectUpdate(project.id, editingProjectName.trim());
                          setEditingProjectId(null);
                        }
                      }}
                      className="px-1 py-1"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={editingProjectName}
                        onChange={(e) => setEditingProjectName(e.target.value)}
                        onBlur={() => {
                          if (editingProjectName.trim() && editingProjectName !== project.name) {
                            onProjectUpdate(project.id, editingProjectName.trim());
                          }
                          setEditingProjectId(null);
                        }}
                        className="w-full bg-bg-tertiary border border-accent-primary rounded-lg px-3 py-2 text-xs focus:outline-none transition-all"
                      />
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => onProjectSelect(project.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all pr-16",
                          activeProjectId === project.id 
                            ? "bg-bg-tertiary text-accent-primary border border-accent-primary/20" 
                            : "text-text-secondary hover:bg-bg-tertiary"
                        )}
                      >
                        <Folder size={16} className={activeProjectId === project.id ? "text-accent-primary" : "text-text-secondary"} />
                        <span className="truncate">{project.name}</span>
                      </button>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProjectId(project.id);
                            setEditingProjectName(project.name);
                          }}
                          className="p-1 hover:bg-bg-secondary rounded-lg text-text-secondary hover:text-accent-primary transition-all"
                          title="Edit Name"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete Project',
                              message: `Are you sure you want to move "${project.name}" to the trash? All files within this project will be hidden.`,
                              onConfirm: () => {
                                onProjectDelete(project.id);
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                              }
                            });
                          }}
                          className="p-1 hover:bg-bg-secondary rounded-lg text-text-secondary hover:text-red-400 transition-all"
                          title="Move to Trash"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Item Form - Redesigned */}
        {view !== 'trash' && (
          <div className="p-4">
            <form onSubmit={handleCreateFile}>
              <div className="relative group">
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder={
                    view === 'erd' ? "New diagram..." : 
                    view === 'notes' ? "New note..." : 
                    "New drawing..."
                  }
                  className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 transition-all pr-10"
                />
                <button 
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-accent-primary text-white rounded-lg hover:bg-accent-secondary transition-all shadow-lg shadow-accent-primary/20"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List Content - Redesigned */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar">
          {view === 'erd' && filteredFiles.map((file) => (
            <div
              key={file.id}
              className={cn(
                "group relative flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all border border-transparent",
                activeFileId === file.id 
                  ? "bg-bg-tertiary text-accent-primary border-accent-primary/20" 
                  : "hover:bg-bg-tertiary/50 text-text-secondary hover:text-text-primary"
              )}
              onClick={() => onFileSelect(file.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                <FileText className={cn("w-4 h-4 flex-shrink-0", activeFileId === file.id ? "text-accent-primary" : "text-text-secondary")} />
                <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                  {editingItemId?.id === file.id && editingItemId?.type === 'file' ? (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editingItemName.trim()) {
                          onFileUpdate(file.id, editingItemName.trim());
                        }
                        setEditingItemId(null);
                      }}
                      className="w-full"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={editingItemName}
                        onChange={(e) => setEditingItemName(e.target.value)}
                        onBlur={() => {
                          if (editingItemName.trim() && editingItemName !== file.name) {
                            onFileUpdate(file.id, editingItemName.trim());
                          }
                          setEditingItemId(null);
                        }}
                        className="w-full bg-bg-tertiary border border-accent-primary rounded-lg px-2 py-1 text-xs focus:outline-none transition-all"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </form>
                  ) : (
                    <span className="text-sm font-medium truncate">{file.name}</span>
                  )}
                  {file.project_id && editingItemId?.id !== file.id && (
                    <span className="text-[9px] text-text-secondary truncate flex items-center gap-1 mt-0.5">
                      <Folder size={8} /> {projects.find(p => p.id === file.project_id)?.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => toggleExpanded(file.id, 'file', e)}
                className={cn(
                  "p-1.5 rounded-lg transition-all flex-shrink-0 ml-2",
                  isItemExpanded(file.id, 'file')
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                )}
                title="More options"
              >
                <MoreVertical size={14} />
              </button>

              {/* Floating Popup Menu */}
              {isItemExpanded(file.id, 'file') && (
                <div
                  ref={popupRef}
                  className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-bg-secondary border border-border rounded-xl shadow-2xl shadow-black/30 py-1.5 animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItemId({ id: file.id, type: 'file' });
                      setEditingItemName(file.name);
                      setExpandedItemId(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary hover:text-accent-primary transition-all"
                  >
                    <Edit2 size={13} />
                    Rename
                  </button>
                  <div className="px-4 py-2.5">
                    <label className="flex items-center gap-3 text-xs font-medium text-text-secondary mb-1.5">
                      <FolderInput size={13} />
                      Move to Project
                    </label>
                    <select
                      className="w-full bg-bg-tertiary border border-border rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-primary/50 text-text-primary"
                      value={file.project_id || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        onMoveFileToProject(file.id, e.target.value ? parseInt(e.target.value) : null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">No Project</option>
                      {activeProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="h-px bg-border mx-2 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedItemId(null);
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Diagram',
                        message: `Are you sure you want to move "${file.name}" to the trash?`,
                        onConfirm: () => {
                          onFileDelete(file.id);
                          setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        }
                      });
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-400/10 transition-all"
                  >
                    <Trash2 size={13} />
                    Move to Trash
                  </button>
                </div>
              )}
            </div>
          ))}

          {view === 'notes' && filteredNotes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "group relative flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all border border-transparent",
                activeNoteId === note.id 
                  ? "bg-bg-tertiary text-accent-primary border-accent-primary/20" 
                  : "hover:bg-bg-tertiary/50 text-text-secondary hover:text-text-primary"
              )}
              onClick={() => onNoteSelect(note.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                <StickyNote className={cn("w-4 h-4 flex-shrink-0", activeNoteId === note.id ? "text-accent-primary" : "text-text-secondary")} />
                <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                  {editingItemId?.id === note.id && editingItemId?.type === 'note' ? (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editingItemName.trim()) {
                          onNoteUpdate(note.id, editingItemName.trim());
                        }
                        setEditingItemId(null);
                      }}
                      className="w-full"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={editingItemName}
                        onChange={(e) => setEditingItemName(e.target.value)}
                        onBlur={() => {
                          if (editingItemName.trim() && editingItemName !== note.title) {
                            onNoteUpdate(note.id, editingItemName.trim());
                          }
                          setEditingItemId(null);
                        }}
                        className="w-full bg-bg-tertiary border border-accent-primary rounded-lg px-2 py-1 text-xs focus:outline-none transition-all"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </form>
                  ) : (
                    <span className="text-sm font-medium truncate">{note.title}</span>
                  )}
                  {note.project_id && editingItemId?.id !== note.id && (
                    <span className="text-[9px] text-text-secondary truncate flex items-center gap-1 mt-0.5">
                      <Folder size={8} /> {projects.find(p => p.id === note.project_id)?.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => toggleExpanded(note.id, 'note', e)}
                className={cn(
                  "p-1.5 rounded-lg transition-all flex-shrink-0 ml-2",
                  isItemExpanded(note.id, 'note')
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                )}
                title="More options"
              >
                <MoreVertical size={14} />
              </button>

              {/* Floating Popup Menu */}
              {isItemExpanded(note.id, 'note') && (
                <div
                  ref={popupRef}
                  className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-bg-secondary border border-border rounded-xl shadow-2xl shadow-black/30 py-1.5 animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItemId({ id: note.id, type: 'note' });
                      setEditingItemName(note.title);
                      setExpandedItemId(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary hover:text-accent-primary transition-all"
                  >
                    <Edit2 size={13} />
                    Rename
                  </button>
                  <div className="px-4 py-2.5">
                    <label className="flex items-center gap-3 text-xs font-medium text-text-secondary mb-1.5">
                      <FolderInput size={13} />
                      Move to Project
                    </label>
                    <select
                      className="w-full bg-bg-tertiary border border-border rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-primary/50 text-text-primary"
                      value={note.project_id || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        onMoveNoteToProject(note.id, e.target.value ? parseInt(e.target.value) : null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">No Project</option>
                      {activeProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="h-px bg-border mx-2 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedItemId(null);
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Note',
                        message: `Are you sure you want to move "${note.title}" to the trash?`,
                        onConfirm: () => {
                          onNoteDelete(note.id);
                          setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        }
                      });
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-400/10 transition-all"
                  >
                    <Trash2 size={13} />
                    Move to Trash
                  </button>
                </div>
              )}
            </div>
          ))}

          {view === 'drawings' && filteredDrawings.map((drawing) => (
            <div
              key={drawing.id}
              className={cn(
                "group relative flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all border border-transparent",
                activeDrawingId === drawing.id 
                  ? "bg-bg-tertiary text-accent-primary border-accent-primary/20" 
                  : "hover:bg-bg-tertiary/50 text-text-secondary hover:text-text-primary"
              )}
              onClick={() => onDrawingSelect(drawing.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                <PenTool className={cn("w-4 h-4 flex-shrink-0", activeDrawingId === drawing.id ? "text-accent-primary" : "text-text-secondary")} />
                <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                  {editingItemId?.id === drawing.id && editingItemId?.type === 'drawing' ? (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editingItemName.trim()) {
                          onDrawingUpdate(drawing.id, editingItemName.trim());
                        }
                        setEditingItemId(null);
                      }}
                      className="w-full"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={editingItemName}
                        onChange={(e) => setEditingItemName(e.target.value)}
                        onBlur={() => {
                          if (editingItemName.trim() && editingItemName !== drawing.title) {
                            onDrawingUpdate(drawing.id, editingItemName.trim());
                          }
                          setEditingItemId(null);
                        }}
                        className="w-full bg-bg-tertiary border border-accent-primary rounded-lg px-2 py-1 text-xs focus:outline-none transition-all"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </form>
                  ) : (
                    <span className="text-sm font-medium truncate">{drawing.title}</span>
                  )}
                  {drawing.project_id && editingItemId?.id !== drawing.id && (
                    <span className="text-[9px] text-text-secondary truncate flex items-center gap-1 mt-0.5">
                      <Folder size={8} /> {projects.find(p => p.id === drawing.project_id)?.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => toggleExpanded(drawing.id, 'drawing', e)}
                className={cn(
                  "p-1.5 rounded-lg transition-all flex-shrink-0 ml-2",
                  isItemExpanded(drawing.id, 'drawing')
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                )}
                title="More options"
              >
                <MoreVertical size={14} />
              </button>

              {/* Floating Popup Menu */}
              {isItemExpanded(drawing.id, 'drawing') && (
                <div
                  ref={popupRef}
                  className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-bg-secondary border border-border rounded-xl shadow-2xl shadow-black/30 py-1.5 animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItemId({ id: drawing.id, type: 'drawing' });
                      setEditingItemName(drawing.title);
                      setExpandedItemId(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary hover:text-accent-primary transition-all"
                  >
                    <Edit2 size={13} />
                    Rename
                  </button>
                  <div className="px-4 py-2.5">
                    <label className="flex items-center gap-3 text-xs font-medium text-text-secondary mb-1.5">
                      <FolderInput size={13} />
                      Move to Project
                    </label>
                    <select
                      className="w-full bg-bg-tertiary border border-border rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-primary/50 text-text-primary"
                      value={drawing.project_id || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        onMoveDrawingToProject(drawing.id, e.target.value ? parseInt(e.target.value) : null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">No Project</option>
                      {activeProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="h-px bg-border mx-2 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedItemId(null);
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Drawing',
                        message: `Are you sure you want to move "${drawing.title}" to the trash?`,
                        onConfirm: () => {
                          onDrawingDelete(drawing.id);
                          setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        }
                      });
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-400/10 transition-all"
                  >
                    <Trash2 size={13} />
                    Move to Trash
                  </button>
                </div>
              )}
            </div>
          ))}

          {view === 'trash' && (
            <div className="space-y-6 pt-2">
              <div className="px-3 flex items-center justify-between">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Trash Bin</h2>
                {(trashData.projects.length > 0 || trashData.files.length > 0 || trashData.notes.length > 0 || trashData.drawings.length > 0) && (
                  <button 
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Clear Trash',
                        message: 'Are you sure you want to permanently delete ALL items in the trash? This action cannot be undone.',
                        onConfirm: () => {
                          // Clear all trash
                          trashData.projects.forEach(p => onProjectPermanentDelete(p.id));
                          trashData.files.forEach(f => onFilePermanentDelete(f.id));
                          trashData.notes.forEach(n => onNotePermanentDelete(n.id));
                          trashData.drawings.forEach(d => onDrawingPermanentDelete(d.id));
                          setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        }
                      });
                    }}
                    className="text-[9px] font-bold text-red-400 hover:text-red-500 uppercase tracking-tighter flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Clear All
                  </button>
                )}
              </div>

              {/* Projects Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-3 flex items-center gap-2">
                  <Folder className="w-3 h-3" /> Projects Trash
                </h3>
                {trashData.projects.length === 0 ? (
                  <p className="px-3 text-[10px] text-text-secondary italic">No deleted projects</p>
                ) : (
                  trashData.projects.map(project => (
                    <div key={project.id} className="group flex items-center justify-between px-4 py-2.5 bg-bg-tertiary/30 rounded-xl text-text-secondary text-sm border border-transparent hover:border-accent-primary/20 transition-all">
                      <span className="truncate font-medium">{project.name}</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => onProjectRestore(project.id)} 
                          className="p-1.5 hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Permanent Delete',
                              message: `Are you sure you want to permanently delete "${project.name}"? This action cannot be undone.`,
                              onConfirm: () => {
                                onProjectPermanentDelete(project.id);
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                              }
                            });
                          }} 
                          className="p-1.5 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ERD Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-3 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> ERD Trash
                </h3>
                {trashData.files.length === 0 ? (
                  <p className="px-3 text-[10px] text-text-secondary italic">No deleted diagrams</p>
                ) : (
                  trashData.files.map(file => (
                    <div key={file.id} className="group flex items-center justify-between px-4 py-2.5 bg-bg-tertiary/30 rounded-xl text-text-secondary text-sm border border-transparent hover:border-accent-primary/20 transition-all">
                      <span className="truncate font-medium">{file.name}</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => onFileRestore(file.id)} 
                          className="p-1.5 hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Permanent Delete',
                              message: `Are you sure you want to permanently delete "${file.name}"? This action cannot be undone.`,
                              onConfirm: () => {
                                onFilePermanentDelete(file.id);
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                              }
                            });
                          }} 
                          className="p-1.5 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Notes Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-3 flex items-center gap-2">
                  <StickyNote className="w-3 h-3" /> Notes Trash
                </h3>
                {trashData.notes.length === 0 ? (
                  <p className="px-3 text-[10px] text-text-secondary italic">No deleted notes</p>
                ) : (
                  trashData.notes.map(note => (
                    <div key={note.id} className="group flex items-center justify-between px-4 py-2.5 bg-bg-tertiary/30 rounded-xl text-text-secondary text-sm border border-transparent hover:border-accent-primary/20 transition-all">
                      <span className="truncate font-medium">{note.title}</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => onNoteRestore(note.id)} 
                          className="p-1.5 hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Permanent Delete',
                              message: `Are you sure you want to permanently delete "${note.title}"? This action cannot be undone.`,
                              onConfirm: () => {
                                onNotePermanentDelete(note.id);
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                              }
                            });
                          }} 
                          className="p-1.5 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Drawings Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-3 flex items-center gap-2">
                  <PenTool className="w-3 h-3" /> Drawings Trash
                </h3>
                {trashData.drawings.length === 0 ? (
                  <p className="px-3 text-[10px] text-text-secondary italic">No deleted drawings</p>
                ) : (
                  trashData.drawings.map(drawing => (
                    <div key={drawing.id} className="group flex items-center justify-between px-4 py-2.5 bg-bg-tertiary/30 rounded-xl text-text-secondary text-sm border border-transparent hover:border-accent-primary/20 transition-all">
                      <span className="truncate font-medium">{drawing.title}</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => onDrawingRestore(drawing.id)} 
                          className="p-1.5 hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Permanent Delete',
                              message: `Are you sure you want to permanently delete "${drawing.title}"? This action cannot be undone.`,
                              onConfirm: () => {
                                onDrawingPermanentDelete(drawing.id);
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                              }
                            });
                          }} 
                          className="p-1.5 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Status - Redesigned */}
        <div className="p-4 border-t border-border bg-bg-secondary/30 flex items-center justify-between text-[10px] text-text-secondary font-bold uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full transition-all duration-500",
              saveStatus === 'saving' && "bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.4)]",
              saveStatus === 'saved' && "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]",
              saveStatus === 'error' && "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
              saveStatus === 'idle' && "bg-text-secondary/20"
            )} />
            <span>
              {saveStatus === 'saving' && 'Syncing...'}
              {saveStatus === 'saved' && 'Synced'}
              {saveStatus === 'error' && 'Sync Error'}
              {saveStatus === 'idle' && 'Cloud Sync'}
            </span>
          </div>
          <Save className="w-3.5 h-3.5 opacity-50" />
        </div>
      </div>

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
