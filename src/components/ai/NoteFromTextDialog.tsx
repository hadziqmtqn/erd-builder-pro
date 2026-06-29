import { useState, useMemo, useCallback, useEffect } from 'react';
import { Loader2, FileText, Plus, Replace, ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { apiFetch } from '@/lib/api';
import {
  Dialog, DialogContent, DialogOverlay,
  DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectItem, SelectGroup, SelectLabel,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { stripAiFluff } from './chatUtils';

export interface NoteFromTextDialogProps {
  text: string;
  onClose: () => void;
  notes: any[];
  targetProjectId: string | number | null | undefined;
  noteDefaultName?: string;
  handleSidebarNoteCreate: (title: string, projectId?: any) => Promise<any>;
  handleNoteSelect: (uid: string) => Promise<void>;
  activeNoteContent?: string;
}

export function NoteFromTextDialog({
  text,
  onClose,
  notes,
  targetProjectId,
  noteDefaultName = 'New Note',
  handleSidebarNoteCreate,
  handleNoteSelect,
  activeNoteContent,
}: NoteFromTextDialogProps) {
  const isOnNotesPage = window.location.pathname.startsWith('/notes/');

  const [mode, setMode] = useState<'create' | 'replace' | 'append' | 'update' | null>(null);
  const [updateUid, setUpdateUid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [existingHtml, setExistingHtml] = useState<string | null>(null);
  const [fetchingExisting, setFetchingExisting] = useState(false);

  const newHtml = useMemo(() => {
    if (!text) return '';
    try {
      const cleaned = stripAiFluff(text);
      const html = marked.parse(cleaned, { gfm: true, breaks: true }) as string;
      return DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'] });
    } catch {
      return DOMPurify.sanitize(text);
    }
  }, [text]);

  const originalHtml = isOnNotesPage ? (activeNoteContent || '') : '';

  const diffHtml = useMemo(() => {
    const cleaned = stripAiFluff(text);
    let html = '';
    try {
      html = marked.parse(cleaned, { gfm: true, breaks: true }) as string;
      html = DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'] });
    } catch {
      html = DOMPurify.sanitize(cleaned);
    }
    if (mode === 'replace') return html;
    if (mode === 'append') {
      const separator = originalHtml.trim() ? '<br><hr><br>' : '';
      return originalHtml + separator + html;
    }
    return html;
  }, [mode, originalHtml, text]);

  useEffect(() => {
    if (!updateUid || mode !== 'update') {
      setExistingHtml(null);
      return;
    }
    let cancelled = false;
    setFetchingExisting(true);
    apiFetch(`/api/notes/${updateUid}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        if (data?.content) {
          setExistingHtml(data.content);
        } else {
          setExistingHtml('<p class="text-muted-foreground italic">(empty note)</p>');
        }
      })
      .catch(() => { if (!cancelled) setExistingHtml(null); })
      .finally(() => { if (!cancelled) setFetchingExisting(false); });
    return () => { cancelled = true; };
  }, [updateUid, mode]);

  const eligibleNotes = useMemo(() => notes.filter((n: any) => {
    if (targetProjectId == null || targetProjectId === 'none') {
      return n.project_id == null || n.project_id === 'none' || n.project_id === '';
    }
    return String(n.project_id) === String(targetProjectId);
  }), [notes, targetProjectId]);

  const showDiff = mode === 'replace' || mode === 'append' || mode === 'create' || (mode === 'update' && existingHtml);

  const handleCreate = useCallback(async () => {
    localStorage.setItem('pending_note_content', text);
    localStorage.setItem('pending_note_strategy', 'replace');
    toast.info('Creating new Note...');
    const n = await handleSidebarNoteCreate(`Note - ${noteDefaultName}`, targetProjectId);
    onClose();
  }, [text, noteDefaultName, handleSidebarNoteCreate, targetProjectId, onClose]);

  const handleUpdate = useCallback(async (uid: string) => {
    localStorage.setItem('pending_note_content', text);
    localStorage.setItem('pending_note_strategy', 'replace');
    toast.info('Navigating to note...');
    onClose();
    if (window.location.pathname !== `/notes/${uid}`) {
      await handleNoteSelect(uid);
    }
  }, [text, handleNoteSelect, onClose]);

  const handleInlineApply = useCallback(() => {
    if (!mode) return;
    localStorage.setItem('pending_note_content', text);
    localStorage.setItem('pending_note_strategy', mode);
    setTimeout(() => window.dispatchEvent(new CustomEvent('apply-pending-note')), 50);
    onClose();
  }, [mode, text, onClose]);

  const handleConfirm = useCallback(async () => {
    if (!mode) return;
    setConfirming(true);
    try {
      if (mode === 'create') {
        await handleCreate();
      } else if (mode === 'update' && updateUid) {
        await handleUpdate(updateUid);
      } else {
        handleInlineApply();
      }
    } finally {
      setConfirming(false);
    }
  }, [mode, handleCreate, handleUpdate, handleInlineApply, updateUid]);

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogOverlay />
      <DialogContent size="4xl" className="max-h-[85vh] flex flex-col p-0!">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileText className="size-4 text-amber-400" />
            </div>
            <div>
              <DialogTitle>Save as Note</DialogTitle>
              <DialogDescription>
                {mode === 'update'
                  ? 'Select which Note to update with this content'
                  : mode === 'replace'
                    ? 'This will replace the current Note content'
                    : mode === 'append'
                      ? 'This will append to the current Note content'
                      : 'Create a new Note or update an existing one'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-auto p-0! border-y">
          <div className="p-6 pb-0 space-y-4">
            <div className={`grid gap-3 ${isOnNotesPage ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button
                onClick={() => { setMode('create'); setUpdateUid(null); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                  mode === 'create'
                    ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30'
                    : 'border-border/60 bg-muted/20 hover:bg-amber-500/5 hover:border-amber-500/20'
                }`}
              >
                <Plus className={`size-5 ${mode === 'create' ? 'text-amber-300' : 'text-amber-400'}`} />
                <div>
                  <p className="text-xs font-semibold text-foreground">Create New</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">New Note with this content</p>
                </div>
              </button>

              {isOnNotesPage ? (
                <>
                  <button
                    onClick={() => setMode('replace')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                      mode === 'replace'
                        ? 'border-destructive/50 bg-destructive/10 ring-1 ring-destructive/30'
                        : 'border-border/60 bg-muted/20 hover:bg-destructive/5 hover:border-destructive/20'
                    }`}
                  >
                    <Replace className={`size-5 ${mode === 'replace' ? 'text-destructive' : 'text-destructive/60'}`} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Replace All</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Overwrite current Note content</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setMode('append')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                      mode === 'append'
                        ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border/60 bg-muted/20 hover:bg-primary/5 hover:border-primary/20'
                    }`}
                  >
                    <ArrowDownToLine className={`size-5 ${mode === 'append' ? 'text-primary' : 'text-primary/60'}`} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Append</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Add to current Note content</p>
                    </div>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setMode('update'); setUpdateUid(null); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                    mode === 'update'
                      ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'border-border/60 bg-muted/20 hover:bg-indigo-500/5 hover:border-indigo-500/20'
                  }`}
                >
                  <FileText className={`size-5 ${mode === 'update' ? 'text-indigo-300' : 'text-indigo-400'}`} />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Update Existing</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Replace content of an existing Note</p>
                  </div>
                </button>
              )}
            </div>

            {!isOnNotesPage && mode === 'update' && (
              <div className="pb-4">
                <label className="text-[11px] font-medium text-muted-foreground">Target Note</label>
                <Select value={updateUid || ''} onValueChange={setUpdateUid}>
                  <SelectTrigger className="w-full text-xs mt-1.5">
                    <SelectValue placeholder="Choose a Note...">
                      {(val: string | null) => {
                        if (!val) return null;
                        const n = notes.find((n: any) => (n.uid ?? String(n.id)) === val);
                        return n?.title || 'Untitled';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleNotes.length === 0 ? (
                      <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">
                        No Notes in this project
                      </div>
                    ) : (
                      <SelectGroup>
                        <SelectLabel>Notes</SelectLabel>
                        {eligibleNotes.map((n: any) => (
                          <SelectItem key={n.uid ?? n.id} value={n.uid ?? String(n.id)}>
                            <span>{n.title || 'Untitled'}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!isOnNotesPage && mode === 'update' && updateUid && fetchingExisting && (
            <div className="flex items-center justify-center py-10 text-[11px] text-muted-foreground border-t">
              <Loader2 className="size-3.5 animate-spin mr-2" />
              Loading existing note...
            </div>
          )}

          {showDiff && (
            <div className={mode === 'update' ? 'border-t' : ''}>
              {(mode === 'replace' || mode === 'append') && isOnNotesPage ? (
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div className="flex flex-col">
                    <div className="sticky top-0 z-10 px-4 py-2 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Original
                    </div>
                    <div className="flex-1 px-5 py-4 prose prose-sm dark:prose-invert max-w-none text-sm [&_.tiptap-editor-content]:min-h-0! [&_img]:max-w-full [&_img]:h-auto">
                      {originalHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: originalHtml }} />
                      ) : (
                        <p className="text-muted-foreground italic text-xs">(empty note)</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className={`sticky top-0 z-10 px-4 py-2 border-b text-[11px] font-semibold uppercase tracking-wider ${
                      mode === 'append'
                        ? 'bg-primary/5 text-primary/70'
                        : 'bg-destructive/5 text-destructive/70'
                    }`}>
                      {mode === 'replace' ? 'Replace With' : 'Appended Result'}
                    </div>
                    <div className="flex-1 px-5 py-4 prose prose-sm dark:prose-invert max-w-none text-sm [&_.tiptap-editor-content]:min-h-0! [&_img]:max-w-full [&_img]:h-auto">
                      <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
                    </div>
                  </div>
                </div>
              ) : mode === 'update' && existingHtml ? (
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div className="flex flex-col">
                    <div className="sticky top-0 z-10 px-4 py-2 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Original
                    </div>
                    <div className="flex-1 px-5 py-4 prose prose-sm dark:prose-invert max-w-none text-sm [&_.tiptap-editor-content]:min-h-0! [&_img]:max-w-full [&_img]:h-auto">
                      <div dangerouslySetInnerHTML={{ __html: existingHtml }} />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="sticky top-0 z-10 px-4 py-2 bg-green-50 dark:bg-green-950/20 border-b text-[11px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">
                      AI Changes
                    </div>
                    <div className="flex-1 px-5 py-4 prose prose-sm dark:prose-invert max-w-none text-sm [&_.tiptap-editor-content]:min-h-0! [&_img]:max-w-full [&_img]:h-auto">
                      <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col border-t">
                  <div className="px-4 py-2 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {mode === 'create' ? 'Note Content Preview' : 'Content Preview'}
                  </div>
                  <div className="px-5 py-4 prose prose-sm dark:prose-invert max-w-none text-sm [&_.tiptap-editor-content]:min-h-0! [&_img]:max-w-full [&_img]:h-auto">
                    <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="px-6 py-4 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!mode || confirming || (mode === 'update' && !updateUid)}
            onClick={handleConfirm}
          >
            {confirming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5" />
            )}
            {mode === 'create' ? 'Create Note' :
             mode === 'replace' ? 'Replace All' :
             mode === 'append' ? 'Append' :
             mode === 'update' ? 'Update Note' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
