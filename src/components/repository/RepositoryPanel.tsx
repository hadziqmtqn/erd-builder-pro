import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { AlertTriangle, FolderGit2, FolderOpen, GitCompareArrows, Loader2, RefreshCw, Unplug, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Entity } from '@/types';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { alignRepositorySchema, parseRepositorySchema, type RepositorySourceKind } from '@/lib/repository-schema';
import { closeRepositoryPreview, showRepositoryPreview } from '@/lib/repository-preview';

type Source = { id: string; kind: RepositorySourceKind; label: string; path: string; file_count: number };
type GitRef = { value: string; name: string; commit: string; committed_at: string; current: boolean };
type Commit = { value: string; short: string; committed_at: string; subject: string };
type Inspection = { root: string; commit: string; current_ref: string; refs: GitRef[]; commits: Commit[]; sources: Source[] };
type StoredLink = { repositoryPath: string; ref: string; sourceId: string };

type Props = {
  diagramUid: string;
  nodes: Node<Entity>[];
  edges: Edge[];
  onClose: () => void;
};

const WORKTREE = 'WORKTREE';

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || 'Repository request failed');
  return value;
}

async function linkRequest(path: string, method: 'GET' | 'PUT' | 'DELETE', body?: StoredLink) {
  const response = await apiFetch(path, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repository_path: body.repositoryPath, ref: body.ref, source_id: body.sourceId }) } : {}),
  });
  const value = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value?.error || 'Repository link request failed');
  return value as StoredLink | null;
}

export function RepositoryPanel({ diagramUid, nodes, edges, onClose }: Props) {
  const storageKey = `erdbpro:repository-link:${diagramUid}`;
  const linkPath = `/api/repositories/link/${encodeURIComponent(diagramUid)}`;
  const [repositoryPath, setRepositoryPath] = useState('');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [selectedRef, setSelectedRef] = useState(WORKTREE);
  const [baseRef, setBaseRef] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState<'connect' | 'preview' | 'compare' | null>(null);
  const persistedLinkRef = useRef<string | null>(null);
  const isTauri = typeof window !== 'undefined' && !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

  const saveLink = useCallback((link: StoredLink) => {
    const signature = JSON.stringify(link);
    if (persistedLinkRef.current === signature) return;
    localStorage.setItem(storageKey, JSON.stringify(link));
    void linkRequest(linkPath, 'PUT', link)
      .then(() => {
        persistedLinkRef.current = signature;
        localStorage.removeItem(storageKey);
      })
      .catch(() => { /* legacy local fallback remains available */ });
  }, [linkPath, storageKey]);

  const inspect = useCallback(async (path: string, ref: string, preferredSource = '') => {
    const value = await postJson('/api/repositories/inspect', { repository_path: path, ref }) as Inspection;
    const nextSource = value.sources.find(source => source.id === preferredSource)?.id || value.sources[0]?.id || '';
    setRepositoryPath(value.root);
    setInspection(value);
    setSelectedRef(ref);
    setSourceId(nextSource);
    setBaseRef(current => current || value.current_ref || value.refs.find(item => item.current)?.value || '');
    if (nextSource) saveLink({ repositoryPath: value.root, ref, sourceId: nextSource });
    return value;
  }, [saveLink]);

  useEffect(() => {
    setLoading('connect');
    linkRequest(linkPath, 'GET')
      .then(stored => {
        if (stored?.repositoryPath) {
          persistedLinkRef.current = JSON.stringify(stored);
          return stored;
        }
        try { return JSON.parse(localStorage.getItem(storageKey) || 'null') as StoredLink | null; }
        catch { return null; }
      })
      .then(stored => stored?.repositoryPath ? inspect(stored.repositoryPath, stored.ref || WORKTREE, stored.sourceId) : undefined)
      .catch(error => toast.error(error.message))
      .finally(() => setLoading(null));
  }, [inspect, linkPath, storageKey]);

  useEffect(() => () => closeRepositoryPreview(), []);

  const refOptions = useMemo(() => {
    if (!inspection) return [];
    return [
      { value: WORKTREE, label: 'Working tree' },
      ...inspection.refs.map(ref => ({ value: ref.value, label: `${ref.name}${ref.current ? ' (current)' : ''}` })),
      ...inspection.commits.map(commit => ({ value: commit.value, label: `${commit.short} · ${commit.subject}` })),
    ];
  }, [inspection]);
  const selectedSource = inspection?.sources.find(source => source.id === sourceId);

  const connect = async () => {
    if (!repositoryPath.trim()) return;
    setLoading('connect');
    setWarnings([]);
    try {
      const value = await inspect(repositoryPath.trim(), WORKTREE);
      if (!value.sources.length) toast.info('Repository connected, but no supported schema source was found');
      else toast.success('Repository connected');
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(null); }
  };

  const changeRef = async (ref: string) => {
    if (!inspection) return;
    setLoading('connect');
    setWarnings([]);
    try { await inspect(inspection.root, ref, sourceId); }
    catch (error: any) { toast.error(error.message); }
    finally { setLoading(null); }
  };

  const read = async (ref: string) => {
    if (!inspection || !sourceId) throw new Error('Select a schema source first');
    const snapshot = await postJson('/api/repositories/read', { repository_path: inspection.root, ref, source_id: sourceId });
    const parsed = parseRepositorySchema(snapshot.source.kind, snapshot.files);
    if (!parsed.nodes.length) throw new Error('No tables could be parsed from this schema source');
    return { ...snapshot, ...parsed };
  };

  const preview = async () => {
    setLoading('preview');
    setWarnings([]);
    try {
      const snapshot = await read(selectedRef);
      const aligned = alignRepositorySchema(nodes, edges, snapshot.nodes, snapshot.edges);
      setWarnings(snapshot.warnings);
      showRepositoryPreview({ proposedNodes: aligned.nodes, proposedEdges: aligned.edges, sourceLabel: labelForRef(selectedRef, refOptions), commit: snapshot.commit, dbmlSource: snapshot.dbml, canApply: true });
      saveLink({ repositoryPath: inspection!.root, ref: selectedRef, sourceId });
      toast.info('Repository schema preview opened on the canvas');
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(null); }
  };

  const compare = async () => {
    if (!baseRef || baseRef === selectedRef) return;
    setLoading('compare');
    setWarnings([]);
    try {
      const [base, target] = await Promise.all([read(baseRef), read(selectedRef)]);
      const aligned = alignRepositorySchema(base.nodes, base.edges, target.nodes, target.edges);
      setWarnings([...base.warnings, ...target.warnings]);
      showRepositoryPreview({ originalNodes: base.nodes, originalEdges: base.edges, proposedNodes: aligned.nodes, proposedEdges: aligned.edges, sourceLabel: `${labelForRef(baseRef, refOptions)} → ${labelForRef(selectedRef, refOptions)}`, commit: target.commit, canApply: false });
      toast.info('Git ref comparison opened on the canvas');
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(null); }
  };

  const browse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false, title: 'Select Git repository' });
    if (typeof selected === 'string') setRepositoryPath(selected);
  };

  const close = () => { closeRepositoryPreview(); onClose(); };
  const disconnect = async () => {
    try {
      await linkRequest(linkPath, 'DELETE');
      persistedLinkRef.current = null;
      localStorage.removeItem(storageKey);
      closeRepositoryPreview();
      setInspection(null);
      setSourceId('');
      setWarnings([]);
    } catch (error: any) { toast.error(error.message); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Repository Schema</h2>
          <p className="truncate text-xs text-muted-foreground">{inspection?.root || 'Link this ERD to a local Git repository'}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={close} aria-label="Close repository panel"><X className="size-4" /></Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {!inspection ? (
          <section className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted"><FolderGit2 className="size-5 text-muted-foreground" /></div>
            <div><h3 className="text-sm font-medium">Connect a repository</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Only supported schema files are read. The repository and active branch are never modified.</p></div>
            <label className="block space-y-1.5"><span className="text-xs font-medium">Repository path</span><div className="flex gap-2"><Input value={repositoryPath} onChange={event => setRepositoryPath(event.target.value)} placeholder="/path/to/project" onKeyDown={event => { if (event.key === 'Enter') void connect(); }} />{isTauri && <Button variant="outline" size="icon" onClick={() => void browse()} aria-label="Browse repository"><FolderOpen className="size-4" /></Button>}</div></label>
            <Button className="w-full" disabled={!repositoryPath.trim() || loading !== null} onClick={() => void connect()}>{loading === 'connect' ? <Loader2 className="size-4 animate-spin" /> : <FolderGit2 className="size-4" />}Connect repository</Button>
          </section>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schema source</h3><Button variant="ghost" size="sm" onClick={disconnect}><Unplug className="size-3.5" />Disconnect</Button></div>
              <Field label="Git ref"><SearchableSelect value={selectedRef} onChange={value => void changeRef(value)} items={refOptions} disabled={loading !== null} placeholder="Select Git ref" searchPlaceholder="Search branch or commit..." emptyMessage="No Git ref found" className="h-9 text-sm" getItemValue={option => option.value} getItemLabel={option => option.label} filterItem={(option, query) => option.label.toLowerCase().includes(query.toLowerCase())} /></Field>
              <Field label="Schema"><Select value={sourceId} disabled={loading !== null || !inspection.sources.length} onValueChange={value => { if (!value) return; setSourceId(value); saveLink({ repositoryPath: inspection.root, ref: selectedRef, sourceId: value }); }}><SelectTrigger><SelectValue placeholder="Select schema">{selectedSource?.label}</SelectValue></SelectTrigger><SelectContent>{inspection.sources.map(source => <SelectItem key={source.id} value={source.id}>{source.label}</SelectItem>)}</SelectContent></Select></Field>
              {!inspection.sources.length && <p className="text-xs text-muted-foreground">Supported sources: Laravel migrations, DBML, and SQL schema/migration files.</p>}
              <Button className="w-full" disabled={!sourceId || loading !== null} onClick={() => void preview()}>{loading === 'preview' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Preview against current ERD</Button>
            </section>

            <section className="space-y-3 border-t pt-5">
              <div><h3 className="text-sm font-medium">Compare Git refs</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Compare branches or commits without checking them out. This preview cannot modify the current ERD.</p></div>
              <Field label="Base ref"><SearchableSelect value={baseRef} onChange={setBaseRef} items={refOptions.filter(option => option.value !== WORKTREE)} disabled={loading !== null} placeholder="Select base ref" searchPlaceholder="Search branch or commit..." emptyMessage="No Git ref found" className="h-9 text-sm" getItemValue={option => option.value} getItemLabel={option => option.label} filterItem={(option, query) => option.label.toLowerCase().includes(query.toLowerCase())} /></Field>
              <Button variant="outline" className="w-full" disabled={!sourceId || !baseRef || baseRef === selectedRef || loading !== null} onClick={() => void compare()}>{loading === 'compare' ? <Loader2 className="size-4 animate-spin" /> : <GitCompareArrows className="size-4" />}Compare with selected ref</Button>
            </section>
          </>
        )}

        {warnings.length > 0 && <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"><div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="size-4" />{warnings.length} migration statement{warnings.length === 1 ? '' : 's'} need review</div><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{warnings.slice(0, 8).map(warning => <li key={warning} className="break-words">{warning}</li>)}</ul></section>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium">{label}</span>{children}</label>;
}

function labelForRef(ref: string, options: Array<{ value: string; label: string }>) {
  return options.find(option => option.value === ref)?.label || ref.slice(0, 12);
}
