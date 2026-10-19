import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { toast } from 'sonner';
import type { WorkspaceContextValue } from '@/providers/WorkspaceContext';
import type { AIActionContextValue } from '@/contexts/AIActionContext';
import type { FileSessionScope } from '@/contexts/FileSessionContext';
import { FilePanesContext } from '@/contexts/FilePanesContext';
import { paneKey, paneRequest, paneUrl, PANE_FLUSH_CHILDREN, PANE_REQUEST, validPaneFile, type PaneFile } from '@/lib/file-panes';
import { flushPaneFile } from '@/lib/pane-save';
import { NativeFileSession, type FileSession } from './NativeFileSession';
import { ProjectFileTabs } from './ProjectFileTabs';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogBody, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from './ui/alert-dialog';

export function FileWorkspace({ children, root, mainAI, teamState, discussionTarget, onFocusedSession, onPairChange }: {
  children: ReactNode; root: WorkspaceContextValue; mainAI: AIActionContextValue; teamState: unknown; discussionTarget: HTMLElement | null; onFocusedSession: (session: FileSession | null) => void; onPairChange: (paired: boolean) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [panes, setPanes] = useState<PaneFile[]>([]);
  const split = desktop && panes.length === 2;
  useLayoutEffect(() => {
    onPairChange(split);
    return () => onPairChange(false);
  }, [split, onPairChange]);
  const [focused, setFocused] = useState('');
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const [pending, setPending] = useState<PaneFile | null>(null);
  const [replaceKey, setReplaceKey] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const lastRoute = useRef(location.pathname + location.search);
  const rollbackRoute = useRef<string | null>(null);
  const sessions = useRef(new Map<string, FileSession>());
  const scopes = useRef(new Map<string, FileSessionScope>());
  const host = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(50);
  const dragging = useRef(false);
  const team = teamState as { activeTeamId?: string | null; activeTeam?: unknown; isLoading?: boolean };
  const editorTeam = useMemo(() => ({ activeTeamId: team.activeTeamId, activeTeam: team.activeTeam, isLoading: team.isLoading }), [team.activeTeamId, team.activeTeam, team.isLoading]);
  const match = location.pathname.match(/^\/(notes|diagrams|flowcharts|drawings)\/([^/]+)$/);
  const types: Record<string, PaneFile['type']> = { notes: 'notes', diagrams: 'erd', flowcharts: 'flowchart', drawings: 'drawings' };
  const type = match ? types[match[1]] : null;
  const currentDocument = type === 'notes' ? root.activeNote : type === 'erd' ? root.activeDiagram : type === 'flowchart' ? root.activeFlowchart : root.activeDrawing;
  const projectId = currentDocument?.project_id ?? currentDocument?.projectId;
  const loaded: PaneFile | null = type && currentDocument && projectId != null ? {
    type, uid: String(currentDocument.uid ?? currentDocument.id), title: currentDocument.title || currentDocument.name || 'Untitled', projectId: String(projectId),
  } : null;
  const current = loaded ?? panes[0] ?? null;
  const scope = `${root.user?.id}:${root.teamScopeVersion}`;
  const publish = useCallback((key: string, session: FileSession) => {
    sessions.current.set(key, session);
    if (key === focusedRef.current) onFocusedSession(session);
  }, [onFocusedSession]);
  useEffect(() => { onFocusedSession(sessions.current.get(focused) ?? null); }, [focused, onFocusedSession]);
  useEffect(() => () => onFocusedSession(null), [onFocusedSession]);
  useEffect(() => {
    setPanes([]); setPending(null); setFocused(''); sessions.current.clear(); scopes.current.clear(); onFocusedSession(null);
  }, [scope, onFocusedSession]);
  useEffect(() => {
    if (root.isPublicView) { setPanes([]); setPending(null); setFocused(''); onFocusedSession(null); }
  }, [root.isPublicView, onFocusedSession]);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const change = () => setDesktop(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const flush = useCallback(async (file: PaneFile) => {
    const session = sessions.current.get(paneKey(file));
    if (!session) throw new Error('Wait for the editor to finish loading.');
    await session.flush();
  }, []);
  useEffect(() => {
    const save = (event: Event) => {
      if (panes.length) (event as CustomEvent<Promise<void>[]>).detail.push(Promise.all(panes.map(flush)).then(() => {}));
    };
    window.addEventListener(PANE_FLUSH_CHILDREN, save);
    return () => window.removeEventListener(PANE_FLUSH_CHILDREN, save);
  }, [panes, flush]);
  const perform = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not switch files.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const focus = (file: PaneFile) => {
    focusedRef.current = paneKey(file); setFocused(paneKey(file));
    onFocusedSession(sessions.current.get(paneKey(file)) ?? null);
  };
  const open = (file: PaneFile) => {
    const base = panes[0] ?? current;
    if ((!desktop && !file.previewSchema) || !base || paneRequest(panes, base, file) === 'reject') return;
    if (panes.some(p => paneKey(p) === paneKey(file))) {
      if (file.previewSchema) setPanes(files => files.map(open => paneKey(open) === paneKey(file) ? file : open));
      focus(file); return;
    }
    if (!panes.length && paneKey(base) === paneKey(file)) return;
    if (panes.length === 2) { setPending(file); setReplaceKey(''); return; }
    void perform(async () => {
      if (!panes.length) await flushPaneFile(root);
      setPanes([...(panes.length ? panes : [base]), file]); focus(file);
    });
  };
  const select = (file: PaneFile) => {
    if (panes.some(p => paneKey(p) === paneKey(file))) { focus(file); return; }
    if (panes.length === 2 && desktop) { open(file); return; }
    void perform(async () => {
      if (panes.length) await Promise.all(panes.map(flush)); else await flushPaneFile(root);
      setPanes([]); setFocused(''); onFocusedSession(null); navigate(paneUrl(file));
    });
  };
  const close = (file: PaneFile) => void perform(async () => {
    await flush(file);
    const remaining = panes.filter(p => paneKey(p) !== paneKey(file));
    sessions.current.delete(paneKey(file)); scopes.current.delete(paneKey(file));
    setPanes(remaining);
    if (remaining[0]) {
      focus(remaining[0]);
      if (location.pathname !== paneUrl(remaining[0]).split('?')[0]) navigate(paneUrl(remaining[0]), { replace: true });
    }
  });
  const onNavigate = (url: string) => {
    const destination = url.match(/^\/(notes|diagrams|flowcharts|drawings)\/([^/?]+)/);
    if (destination && current) {
      const nextType = types[destination[1]];
      const uid = decodeURIComponent(destination[2]);
      const list = nextType === 'notes' ? root.notes : nextType === 'erd' ? root.diagrams : nextType === 'flowchart' ? root.flowcharts : root.drawings;
      const file = list.find(item => String(item.uid) === uid || String(item.id) === uid)
        ?? [...sessions.current.values()].find(session => session.file.type === nextType && (String(session.workspace.activeDocument?.id) === uid || session.file.uid === uid))?.workspace.activeDocument;
      select({ type: nextType, uid: String(file?.uid ?? file?.id ?? uid), title: file?.title || file?.name || 'Untitled', projectId: String(file?.project_id ?? file?.projectId ?? current.projectId) });
    } else void perform(async () => {
      await Promise.all(panes.map(flush)); setPanes([]); setFocused(''); onFocusedSession(null); navigate(url);
    });
  };
  const requestRef = useRef(open);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const navigateSession = useCallback((url: string) => navigateRef.current(url), []);
  requestRef.current = open;
  useEffect(() => {
    const route = location.pathname + location.search;
    if (!panes.length) { lastRoute.current = route; return; }
    if (busy) return;
    if (lastRoute.current === route) return;
    if (match && (!loaded || (loaded.uid !== decodeURIComponent(match[2]) && String(currentDocument?.id) !== decodeURIComponent(match[2])))) return;
    const before = lastRoute.current;
    lastRoute.current = route;
    const existing = loaded && panes.find(file => paneKey(file) === paneKey(loaded));
    if (match && existing) { focus(existing); return; }
    if (match && loaded && panes.length === 2 && loaded.projectId === panes[0].projectId) {
      rollbackRoute.current = before; setPending(loaded); setReplaceKey(''); return;
    }
    void perform(async () => {
      try {
        await Promise.all(panes.map(flush)); setPanes([]); setFocused(''); onFocusedSession(null);
      } catch (error) {
        lastRoute.current = before; navigate(before, { replace: true }); throw error;
      }
    });
  }, [location.pathname, location.search, loaded?.uid, loaded?.projectId, panes, busy, flush, navigate, onFocusedSession]);
  const cancelReplacement = () => {
    if (busy) return;
    setPending(null);
    if (rollbackRoute.current) {
      lastRoute.current = rollbackRoute.current; navigate(rollbackRoute.current, { replace: true }); rollbackRoute.current = null;
    }
  };
  useEffect(() => {
    const request = (event: Event) => {
      const file = (event as CustomEvent).detail?.file;
      if (validPaneFile(file)) requestRef.current(file);
    };
    window.addEventListener(PANE_REQUEST, request);
    return () => window.removeEventListener(PANE_REQUEST, request);
  }, []);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current || !host.current) return;
      const rect = host.current.getBoundingClientRect();
      setPercent(Math.max(30, Math.min(70, (event.clientX - rect.left) / rect.width * 100)));
    };
    const stop = () => { dragging.current = false; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, []);
  if (!current || (!match && !panes.length) || root.isPublicView) return <>{children}</>;
  const selected = panes.find(file => paneKey(file) === focused) ?? current;
  const selectedDocument = sessions.current.get(paneKey(selected))?.workspace.activeDocument
    ?? (loaded && paneKey(selected) === paneKey(loaded) ? currentDocument : undefined);
  // React 18 drops a boolean `inert`; the empty-string attribute is what blocks input while saves flush.
  // shortcut: React 18 only, switch back to `inert={busy}` when upgrading to React 19.
  const inertWhileBusy = (busy ? { inert: '' } : {}) as { inert?: boolean };
  return <FilePanesContext.Provider value={{ files: panes, focused, desktop, open, select, close }}>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ProjectFileTabs host currentView={selected.type} currentFile={selectedDocument} />
      {!panes.length ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden" {...inertWhileBusy}>{children}</div> : <div ref={host} className="flex min-h-0 flex-1 overflow-hidden" aria-label="Open files">
        {panes.map((file, index) => {
          const key = paneKey(file);
          let sessionScope = scopes.current.get(key);
          if (!sessionScope) { sessionScope = { active: { current: focused === key }, host: { current: null } }; scopes.current.set(key, sessionScope); }
          return <div key={key} className={split ? 'contents' : focused === key ? 'contents' : 'hidden'}>
            {split && index === 1 && <div role="separator" aria-label="Resize editors" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(percent)} tabIndex={0}
              className="w-2 shrink-0 cursor-col-resize touch-none border-x bg-muted/30 focus-visible:bg-accent"
              onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
              onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setPercent(value => Math.max(30, Math.min(70, value + (event.key === 'ArrowLeft' ? -2 : 2)))); } }} />}
            <section data-file-session={key} data-active={focused === key} aria-label={file.title} {...inertWhileBusy}
              onPointerDownCapture={() => focus(file)} onFocusCapture={() => { if (focused !== key) focus(file); }}
              className="relative flex min-h-0 min-w-0 flex-col overflow-hidden" style={split ? { width: index === 0 ? `${percent}%` : undefined, flex: index === 1 ? 1 : undefined } : { flex: 1 }}>
              {split && <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3 text-sm">
                <span className="truncate">{file.title}</span><Button variant="ghost" size="icon-sm" aria-label={`Close pane: ${file.title}`} disabled={busy} onClick={() => close(file)}><X /></Button>
              </div>}
              <div ref={sessionScope.host} className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden [transform:translateZ(0)]">
                <NativeFileSession file={file} active={focused === key} scope={sessionScope} root={root} mainAI={mainAI} teamState={editorTeam} discussionTarget={discussionTarget} onUpdate={publish} onNavigate={navigateSession} />
              </div>
            </section>
          </div>;
        })}
      </div>}
    </div>
    <AlertDialog open={!!pending} onOpenChange={value => { if (!value) cancelReplacement(); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Replace an open file</AlertDialogTitle><AlertDialogDescription>Choose the file to close before opening {pending?.title}.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogBody className="p-4">
          <RadioGroup aria-label="File to replace" value={replaceKey} onValueChange={value => setReplaceKey(String(value))} className="flex flex-col gap-2">
            {panes.map(file => <label key={paneKey(file)} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
              <Radio.Root value={paneKey(file)} className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input data-checked:border-primary focus-visible:ring-2 focus-visible:ring-ring"><Radio.Indicator className="size-2 rounded-full bg-primary" /></Radio.Root>
              <span className="min-w-0"><span className="block truncate">{file.title}</span><span className="text-xs text-muted-foreground">{{ notes: 'Notes', erd: 'ERD Builder', flowchart: 'Flowchart', drawings: 'Drawings' }[file.type]}</span></span>
            </label>)}
          </RadioGroup>
        </AlertDialogBody>
        <AlertDialogFooter><Button variant="outline" disabled={busy} onClick={cancelReplacement}>Cancel</Button>
          <Button disabled={!replaceKey || busy} onClick={() => void perform(async () => {
            const replaced = panes.find(file => paneKey(file) === replaceKey);
            if (!pending || !replaced) return;
            await flush(replaced); sessions.current.delete(replaceKey); scopes.current.delete(replaceKey);
            setPanes(panes.map(file => paneKey(file) === replaceKey ? pending : file)); focus(pending); setPending(null);
            rollbackRoute.current = null;
            if (loaded && paneKey(loaded) === paneKey(replaced)) navigate(paneUrl(pending), { replace: true });
          })}>Replace file</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </FilePanesContext.Provider>;
}
