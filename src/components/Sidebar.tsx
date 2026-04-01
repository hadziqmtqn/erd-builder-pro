import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Trash2, FileText, ChevronLeft, ChevronRight, Save, 
  Database, LogOut, Folder, StickyNote, Trash, ChevronDown, 
  FolderPlus, MoreVertical, RotateCcw, PenTool, Edit2,
  PanelLeftClose, PanelLeftOpen, MoreHorizontal
} from 'lucide-react';
import { FileData, Project, Note, Drawing } from '../types';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

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
  onFileUpdate: (id: number, name: string) => void;
  onNoteUpdate: (id: number, title: string) => void;
  onDrawingUpdate: (id: number, title: string) => void;
  onLogout: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onMoveFileToProject: (fileId: number, projectId: number | null) => void;
  onMoveNoteToProject: (noteId: number, projectId: number | null) => void;
  onMoveDrawingToProject: (drawingId: number, projectId: number | null) => void;
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
  onFileUpdate,
  onNoteUpdate,
  onDrawingUpdate,
  onLogout,
  saveStatus,
  onMoveFileToProject,
  onMoveNoteToProject,
  onMoveDrawingToProject
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [newFileName, setNewFileName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingDrawingId, setEditingDrawingId] = useState<number | null>(null);
  const [editingDrawingTitle, setEditingDrawingTitle] = useState('');
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

  const safeFiles = Array.isArray(files) ? files : [];
  const safeNotes = Array.isArray(notes) ? notes : [];
  const safeDrawings = Array.isArray(drawings) ? drawings : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  const filteredFiles = (activeProjectId 
    ? safeFiles.filter(f => f.project_id === activeProjectId)
    : safeFiles).filter(f => !f.is_deleted);

  const filteredNotes = (activeProjectId
    ? safeNotes.filter(n => n.project_id === activeProjectId)
    : safeNotes).filter(n => !n.is_deleted);

  const filteredDrawings = (activeProjectId
    ? safeDrawings.filter(d => d.project_id === activeProjectId)
    : safeDrawings).filter(d => !d.is_deleted);

  const activeProjects = safeProjects.filter(p => !p.is_deleted);

  return (
    <div className={cn(
      "h-full transition-all duration-300 ease-in-out relative z-50",
      isOpen ? "w-72" : "w-0"
    )}>
      {/* Toggle Button - Desktop */}
      <Button 
        variant="secondary"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "hidden lg:flex absolute items-center justify-center hover:bg-accent transition-all z-30 shadow-sm",
          isOpen 
            ? "-right-3 top-12 w-6 h-6 rounded-full border border-border" 
            : "left-4 top-4 w-9 h-9 rounded-md border border-border bg-background shadow-md"
        )}
      >
        {isOpen ? <ChevronLeft className="w-3 h-3" /> : <PanelLeftOpen className="w-4 h-4" />}
      </Button>

      <div className={cn(
        "h-full bg-card flex flex-col overflow-hidden transition-all duration-300 absolute top-0 left-0 bottom-0",
        isOpen ? "w-72 border-r border-border shadow-xl opacity-100" : "w-0 border-none opacity-0 invisible"
      )}>
        <div className="w-72 h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border bg-muted/20">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner flex-shrink-0">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                <h1 className="font-bold text-sm leading-tight tracking-tight">ERD Builder</h1>
                <p className="text-[10px] text-muted-foreground font-semibold tracking-widest uppercase opacity-70">Workspace</p>
              </div>
            </div>

            {/* View Switcher - Modern Segmented Control */}
            <div className="p-1 bg-muted/40 rounded-xl border border-border/50 flex items-center gap-1">
              {[
                { id: 'erd', icon: Database, label: 'ERD', color: 'text-blue-400' },
                { id: 'notes', icon: StickyNote, label: 'Notes', color: 'text-amber-400' },
                { id: 'drawings', icon: PenTool, label: 'Draw', color: 'text-purple-400' },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  variant="ghost"
                  onClick={() => onViewChange(tab.id as any)}
                  className={cn(
                    "relative flex flex-col items-center justify-center transition-all duration-200 group flex-1 h-14 rounded-lg",
                    view === tab.id 
                      ? "bg-background text-primary shadow-sm border border-border/50 hover:bg-background hover:text-primary cursor-default" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <tab.icon size={16} className={cn("transition-all duration-300", view !== tab.id && "group-hover:scale-110", view === tab.id ? "text-primary" : tab.color)} />
                  <span className="text-[9px] font-bold mt-1 uppercase tracking-tighter">{tab.label}</span>
                </Button>
              ))}
            </div>
          </div>

        {/* Projects Section */}
        {view !== 'trash' && (
          <div className="px-4 py-4 border-b border-border bg-muted/5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <Folder className="w-3 h-3 text-primary" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Projects</h2>
              </div>
              <Button 
                variant="ghost"
                size="icon"
                onClick={() => setShowNewProject(!showNewProject)}
                className={cn(
                  "h-7 w-7 rounded-lg transition-all text-muted-foreground hover:text-primary",
                  showNewProject ? "bg-primary/10 text-primary rotate-45" : "hover:bg-muted"
                )}
              >
                <Plus size={14} />
              </Button>
            </div>
            
            {showNewProject && (
              <form onSubmit={handleCreateProject} className="mb-3 px-1 animate-in slide-in-from-top-2 duration-200">
                <Input
                  autoFocus
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name..."
                  className="h-9 bg-muted border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </form>
            )}

            <ScrollArea className="max-h-48 pr-1">
              <div className="space-y-1">
                <Button
                  variant={activeProjectId === null ? "secondary" : "ghost"}
                  onClick={() => onProjectSelect(null)}
                  className={cn(
                    "w-full flex items-center justify-start gap-3 px-3 py-2.5 h-auto rounded-xl text-xs font-semibold transition-all",
                    activeProjectId === null 
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Folder size={16} />
                  All Workspace
                </Button>
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
                        <Input
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
                          className="h-9 bg-muted border-primary rounded-lg px-3 py-2 text-xs focus:outline-none transition-all"
                        />
                      </form>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          variant={activeProjectId === project.id ? "secondary" : "ghost"}
                          onClick={() => onProjectSelect(project.id)}
                          className={cn(
                            "w-full flex items-center justify-start gap-3 px-3 py-2.5 h-auto rounded-xl text-xs font-semibold transition-all pr-10",
                            activeProjectId === project.id 
                              ? "bg-muted text-primary border border-primary/20" 
                              : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          <Folder size={16} className={activeProjectId === project.id ? "text-primary" : "text-muted-foreground"} />
                          <span className="truncate flex-1 text-left">{project.name}</span>
                        </Button>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 hover:bg-background rounded-lg text-muted-foreground hover:text-primary transition-all"
                                >
                                  <MoreVertical size={14} />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[10px] font-bold text-primary uppercase tracking-widest">Project Options</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => {
                                  setEditingProjectId(project.id);
                                  setEditingProjectName(project.name);
                                }}>
                                  <Edit2 size={14} className="mr-2" /> Rename Project
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
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
                                >
                                  <Trash2 size={14} className="mr-2" /> Delete Project
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* New Item Form - Redesigned */}
        {view !== 'trash' && (
          <div className="p-4">
            <form onSubmit={handleCreateFile}>
              <div className="relative group">
                <Input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder={
                    view === 'erd' ? "New diagram..." : 
                    view === 'notes' ? "New note..." : 
                    "New drawing..."
                  }
                  className="w-full bg-muted border-border rounded-xl px-4 py-6 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all pr-12"
                />
                <Button 
                  type="submit"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* List Content - Redesigned */}
        <ScrollArea className="flex-1 px-3 pb-4">
          <div className="space-y-1">
            {view === 'erd' && filteredFiles.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "group flex flex-col px-1 py-1 rounded-xl transition-all border border-transparent relative",
                  view === 'erd' && activeFileId === file.id && !editingFileId
                    ? "bg-muted text-primary border-primary/20" 
                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {editingFileId === file.id ? (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editingFileName.trim()) {
                        onFileUpdate(file.id, editingFileName.trim());
                        setEditingFileId(null);
                      }
                    }}
                    className="w-full"
                  >
                    <Input
                      autoFocus
                      type="text"
                      value={editingFileName}
                      onChange={(e) => setEditingFileName(e.target.value)}
                      onBlur={() => {
                        if (editingFileName.trim() && editingFileName !== file.name) {
                          onFileUpdate(file.id, editingFileName.trim());
                        }
                        setEditingFileId(null);
                      }}
                      className="h-9 bg-background border-primary rounded-lg px-3 py-2 text-xs focus:outline-none transition-all"
                    />
                  </form>
                ) : (
                  <div 
                    className="flex items-center justify-between w-full px-2 py-2 cursor-pointer"
                    onClick={() => onFileSelect(file.id)}
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <FileText className={cn("w-4 h-4 flex-shrink-0", view === 'erd' && activeFileId === file.id ? "text-primary" : "text-muted-foreground")} />
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate">{file.name}</span>
                        {file.project_id && (
                          <span className="text-[9px] text-muted-foreground truncate flex items-center gap-1">
                            <Folder size={8} /> {projects.find(p => p.id === file.project_id)?.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-background rounded-lg text-muted-foreground hover:text-primary transition-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical size={14} />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-[10px] font-bold text-primary uppercase tracking-widest">Diagram Options</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => {
                              setEditingFileId(file.id);
                              setEditingFileName(file.name);
                            }}>
                              <Edit2 size={14} className="mr-2" /> Rename Diagram
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1.5">
                              <p className="text-[9px] font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                                <Folder size={10} /> Move to Project
                              </p>
                              <select
                                className="w-full bg-muted border border-border rounded-lg text-[11px] px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                                value={file.project_id || ''}
                                onChange={(e) => {
                                  onMoveFileToProject(file.id, e.target.value ? parseInt(e.target.value) : null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">No Project (Root)</option>
                                {activeProjects.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
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
                            >
                              <Trash2 size={14} className="mr-2" /> Delete Diagram
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )}
              </div>
            ))}

          {view === 'notes' && filteredNotes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "group flex flex-col px-1 py-1 rounded-xl transition-all border border-transparent relative",
                view === 'notes' && activeNoteId === note.id && !editingNoteId
                  ? "bg-muted text-primary border-primary/20" 
                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {editingNoteId === note.id ? (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editingNoteTitle.trim()) {
                      onNoteUpdate(note.id, editingNoteTitle.trim());
                      setEditingNoteId(null);
                    }
                  }}
                  className="w-full"
                >
                  <Input
                    autoFocus
                    type="text"
                    value={editingNoteTitle}
                    onChange={(e) => setEditingNoteTitle(e.target.value)}
                    onBlur={() => {
                      if (editingNoteTitle.trim() && editingNoteTitle !== note.title) {
                        onNoteUpdate(note.id, editingNoteTitle.trim());
                      }
                      setEditingNoteId(null);
                    }}
                    className="h-9 bg-background border-primary rounded-lg px-3 py-2 text-xs focus:outline-none transition-all"
                  />
                </form>
              ) : (
                <div 
                  className="flex items-center justify-between w-full px-2 py-2 cursor-pointer"
                  onClick={() => onNoteSelect(note.id)}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <StickyNote className={cn("w-4 h-4 flex-shrink-0", view === 'notes' && activeNoteId === note.id ? "text-primary" : "text-muted-foreground")} />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-medium truncate">{note.title}</span>
                      {note.project_id && (
                        <span className="text-[9px] text-muted-foreground truncate flex items-center gap-1">
                          <Folder size={8} /> {projects.find(p => p.id === note.project_id)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-background rounded-lg text-muted-foreground hover:text-primary transition-all"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-[10px] font-bold text-primary uppercase tracking-widest">Note Options</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => {
                            setEditingNoteId(note.id);
                            setEditingNoteTitle(note.title);
                          }}>
                            <Edit2 size={14} className="mr-2" /> Rename Note
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <div className="px-2 py-1.5">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                              <Folder size={10} /> Move to Project
                            </p>
                            <select
                              className="w-full bg-muted border border-border rounded-lg text-[11px] px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                              value={note.project_id || ''}
                              onChange={(e) => {
                                onMoveNoteToProject(note.id, e.target.value ? parseInt(e.target.value) : null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">No Project (Root)</option>
                              {activeProjects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
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
                          >
                            <Trash2 size={14} className="mr-2" /> Delete Note
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </div>
          ))}

          {view === 'drawings' && filteredDrawings.map((drawing) => (
            <div
              key={drawing.id}
              className={cn(
                "group flex flex-col px-1 py-1 rounded-xl transition-all border border-transparent relative",
                view === 'drawings' && activeDrawingId === drawing.id && !editingDrawingId
                  ? "bg-muted text-primary border-primary/20" 
                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {editingDrawingId === drawing.id ? (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editingDrawingTitle.trim()) {
                      onDrawingUpdate(drawing.id, editingDrawingTitle.trim());
                      setEditingDrawingId(null);
                    }
                  }}
                  className="w-full"
                >
                  <Input
                    autoFocus
                    type="text"
                    value={editingDrawingTitle}
                    onChange={(e) => setEditingDrawingTitle(e.target.value)}
                    onBlur={() => {
                      if (editingDrawingTitle.trim() && editingDrawingTitle !== drawing.title) {
                        onDrawingUpdate(drawing.id, editingDrawingTitle.trim());
                      }
                      setEditingDrawingId(null);
                    }}
                    className="h-9 bg-background border-primary rounded-lg px-3 py-2 text-xs focus:outline-none transition-all"
                  />
                </form>
              ) : (
                <div 
                  className="flex items-center justify-between w-full px-2 py-2 cursor-pointer"
                  onClick={() => onDrawingSelect(drawing.id)}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <PenTool className={cn("w-4 h-4 flex-shrink-0", view === 'drawings' && activeDrawingId === drawing.id ? "text-primary" : "text-muted-foreground")} />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-medium truncate">{drawing.title}</span>
                      {drawing.project_id && (
                        <span className="text-[9px] text-muted-foreground truncate flex items-center gap-1">
                          <Folder size={8} /> {projects.find(p => p.id === drawing.project_id)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-background rounded-lg text-muted-foreground hover:text-primary transition-all"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-[10px] font-bold text-primary uppercase tracking-widest">Drawing Options</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => {
                            setEditingDrawingId(drawing.id);
                            setEditingDrawingTitle(drawing.title);
                          }}>
                            <Edit2 size={14} className="mr-2" /> Rename Drawing
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <div className="px-2 py-1.5">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                              <Folder size={10} /> Move to Project
                            </p>
                            <select
                              className="w-full bg-muted border border-border rounded-lg text-[11px] px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                              value={drawing.project_id || ''}
                              onChange={(e) => {
                                onMoveDrawingToProject(drawing.id, e.target.value ? parseInt(e.target.value) : null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">No Project (Root)</option>
                              {activeProjects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
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
                          >
                            <Trash2 size={14} className="mr-2" /> Delete Drawing
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </div>
          ))}

          {view === 'trash' && (
            <div className="space-y-6 pt-2">
              <div className="px-3 flex items-center justify-between">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trash Bin</h2>
                {(trashData.projects.length > 0 || trashData.files.length > 0 || trashData.notes.length > 0 || trashData.drawings.length > 0) && (
                  <Button 
                    variant="ghost"
                    size="sm"
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
                    className="h-7 text-[9px] font-bold text-destructive hover:text-destructive hover:bg-destructive/10 uppercase tracking-tighter flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Clear All
                  </Button>
                )}
              </div>

              {/* Projects Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 flex items-center gap-2">
                  <Folder className="w-3 h-3" /> Projects Trash
                </h3>
                {trashData.projects.length === 0 ? (
                  <p className="px-3 text-[10px] text-muted-foreground italic">No deleted projects</p>
                ) : (
                  trashData.projects.map(project => (
                    <div key={project.id} className="group flex items-center justify-between px-4 py-2.5 bg-muted/30 rounded-xl text-muted-foreground text-sm border border-transparent hover:border-primary/20 transition-all">
                      <span className="truncate font-medium">{project.name}</span>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost"
                          size="icon"
                          onClick={() => onProjectRestore(project.id)} 
                          className="h-7 w-7 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </Button>
                        <Button 
                          variant="ghost"
                          size="icon"
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
                          className="h-7 w-7 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ERD Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> ERD Trash
                </h3>
                {trashData.files.length === 0 ? (
                  <p className="px-3 text-[10px] text-muted-foreground italic">No deleted diagrams</p>
                ) : (
                  trashData.files.map(file => (
                    <div key={file.id} className="group flex items-center justify-between px-4 py-2.5 bg-muted/30 rounded-xl text-muted-foreground text-sm border border-transparent hover:border-primary/20 transition-all">
                      <span className="truncate font-medium">{file.name}</span>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost"
                          size="icon"
                          onClick={() => onFileRestore(file.id)} 
                          className="h-7 w-7 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </Button>
                        <Button 
                          variant="ghost"
                          size="icon"
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
                          className="h-7 w-7 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Notes Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 flex items-center gap-2">
                  <StickyNote className="w-3 h-3" /> Notes Trash
                </h3>
                {trashData.notes.length === 0 ? (
                  <p className="px-3 text-[10px] text-muted-foreground italic">No deleted notes</p>
                ) : (
                  trashData.notes.map(note => (
                    <div key={note.id} className="group flex items-center justify-between px-4 py-2.5 bg-muted/30 rounded-xl text-muted-foreground text-sm border border-transparent hover:border-primary/20 transition-all">
                      <span className="truncate font-medium">{note.title}</span>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost"
                          size="icon"
                          onClick={() => onNoteRestore(note.id)} 
                          className="h-7 w-7 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </Button>
                        <Button 
                          variant="ghost"
                          size="icon"
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
                          className="h-7 w-7 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Drawings Trash */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 flex items-center gap-2">
                  <PenTool className="w-3 h-3" /> Drawings Trash
                </h3>
                {trashData.drawings.length === 0 ? (
                  <p className="px-3 text-[10px] text-muted-foreground italic">No deleted drawings</p>
                ) : (
                  trashData.drawings.map(drawing => (
                    <div key={drawing.id} className="group flex items-center justify-between px-4 py-2.5 bg-muted/30 rounded-xl text-muted-foreground text-sm border border-transparent hover:border-primary/20 transition-all">
                      <span className="truncate font-medium">{drawing.title}</span>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost"
                          size="icon"
                          onClick={() => onDrawingRestore(drawing.id)} 
                          className="h-7 w-7 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </Button>
                        <Button 
                          variant="ghost"
                          size="icon"
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
                          className="h-7 w-7 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          title="Delete Permanently"
                        >
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          </div>
        </ScrollArea>

        {/* Footer Status & More Menu */}
        <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-2 px-1">
            <div className={cn(
              "w-2 h-2 rounded-full transition-all duration-500",
              saveStatus === 'saving' && "bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.4)]",
              saveStatus === 'saved' && "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]",
              saveStatus === 'error' && "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
              saveStatus === 'idle' && "bg-muted-foreground/30"
            )} />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
              {saveStatus === 'saving' && 'Syncing'}
              {saveStatus === 'saved' && 'Synced'}
              {saveStatus === 'error' && 'Error'}
              {saveStatus === 'idle' && 'Cloud'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger render={
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => onViewChange('trash')}
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Trash className="w-4 h-4" />
                </Button>
              } />
              <TooltipContent side="top" className="font-bold text-[10px] uppercase tracking-widest">Trash Bin</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              } />
              <DropdownMenuContent align="end" side="top" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] font-bold text-primary uppercase tracking-widest">Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
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
