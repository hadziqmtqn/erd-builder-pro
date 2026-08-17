import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Clock3, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type HistoryEntityType = 'notes' | 'flowcharts' | 'drawings' | 'diagrams';

type Revision = {
  id: string;
  version: number;
  change_type: string;
  created_at: string;
};

type RevisionDetail = Revision & {
  source: string;
  snapshot: Record<string, any>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: HistoryEntityType;
  entityUid: string;
  documentTitle: string;
  targetMinutes?: number;
  onRestored: () => void;
};

function parseData(value: unknown) {
  if (value && typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function plainText(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.body.textContent || '';
}

function Preview({ entityType, detail }: { entityType: HistoryEntityType; detail: RevisionDetail }) {
  const snapshot = detail.snapshot;
  if (entityType === 'notes') {
    return <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{plainText(String(snapshot.content || '')) || 'Empty note'}</pre>;
  }
  if (entityType === 'flowcharts') {
    const data = parseData(snapshot.data);
    return <Summary title={snapshot.title} items={[['Nodes', data.nodes?.length || 0], ['Connections', data.edges?.length || 0]]} />;
  }
  if (entityType === 'drawings') {
    const data = parseData(snapshot.data);
    const elements = Array.isArray(data) ? data : data.elements || [];
    return <Summary title={snapshot.title} items={[['Elements', elements.length], ['Files', Object.keys(data.files || {}).length]]} />;
  }
  const productionData = parseData(snapshot.data);
  const isProduction = snapshot.source_type === 'production_db';
  return (
    <Summary
      title={snapshot.name}
      items={isProduction
        ? [['Layout tables', Object.keys(productionData.nodes || {}).length], ['Database schema', 'Not changed']]
        : [['Tables', snapshot.entities?.length || 0], ['Relationships', snapshot.relationships?.length || 0]]}
    />
  );
}

function Summary({ title, items }: { title?: string; items: Array<[string, string | number]> }) {
  return (
    <div className="space-y-4">
      <div><div className="text-xs text-muted-foreground">Title</div><div className="font-medium">{title || 'Untitled'}</div></div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VersionHistoryPanel({ open, onOpenChange, entityType, entityUid, documentTitle, targetMinutes, onRestored }: Props) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RevisionDetail | null>(null);
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    apiFetch(`/api/entity-changes/${entityType}/${encodeURIComponent(entityUid)}?limit=100`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Failed to load version history');
        if (cancelled) return;
        const items = body.revisions || [];
        setRevisions(items);
        setCurrentUpdatedAt(body.current_updated_at || null);
        const target = targetMinutes ? Date.now() - targetMinutes * 60_000 : null;
        const selected = target
          ? items.find((item: Revision) => new Date(item.created_at).getTime() <= target)
          : items[0];
        setSelectedId(selected?.id ?? null);
        if (target && !selected) toast.info(`No version is available from ${targetMinutes} minutes ago.`);
      })
      .catch(error => toast.error(error.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, entityType, entityUid, targetMinutes]);

  useEffect(() => {
    if (!open || selectedId === null) { setDetail(null); return; }
    let cancelled = false;
    apiFetch(`/api/entity-changes/${entityType}/${encodeURIComponent(entityUid)}/${selectedId}`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Failed to load version');
        if (!cancelled) setDetail(body);
      })
      .catch(error => toast.error(error.message));
    return () => { cancelled = true; };
  }, [open, selectedId, entityType, entityUid]);

  const selected = useMemo(() => revisions.find(item => item.id === selectedId), [revisions, selectedId]);

  const restore = async () => {
    if (!selectedId) return;
    setRestoring(true);
    try {
      const response = await apiFetch(`/api/entity-changes/${entityType}/${encodeURIComponent(entityUid)}/${selectedId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_updated_at: currentUpdatedAt }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to restore version');
      toast.success('Version restored. The previous state was saved as a safety revision.');
      setConfirmOpen(false);
      onOpenChange(false);
      onRestored();
    } catch (error: any) {
      toast.error(error.message || 'Failed to restore version');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="4xl" className="h-[calc(100vh-2rem)] max-h-[760px] gap-0">
          <DialogHeader className="pr-14">
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription className="truncate">{documentTitle}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(140px,35%)_minmax(0,1fr)] md:grid-cols-[260px_1fr] md:grid-rows-1">
            <div className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r">
              {loading ? (
                <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading history…</div>
              ) : revisions.length === 0 ? (
                <div className="p-5 text-sm text-muted-foreground">No saved versions yet. A version is created after document changes.</div>
              ) : revisions.map(revision => (
                <button
                  key={revision.id}
                  type="button"
                  onClick={() => setSelectedId(revision.id)}
                  className={`w-full border-b px-4 py-3 text-left transition-colors ${selectedId === revision.id ? 'bg-accent' : 'hover:bg-muted/50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{formatDistanceToNow(new Date(revision.created_at), { addSuffix: true })}</span>
                    {revision.change_type === 'pre_restore' && <Badge variant="outline">Safety</Badge>}
                    {revision.change_type === 'restore' && <Badge variant="secondary">Restored</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{format(new Date(revision.created_at), 'MMM d, yyyy HH:mm:ss')}</div>
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {!selected ? (
                  <div className="text-sm text-muted-foreground">Select a version to preview.</div>
                ) : !detail ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading preview…</div>
                ) : <Preview entityType={entityType} detail={detail} />}
              </div>
              <div className="flex items-center justify-between gap-3 border-t p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" />Restore creates a safety version first.</div>
                <Button disabled={!detail || restoring} onClick={() => setConfirmOpen(true)}><RotateCcw className="size-4" />Restore</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogBody>The current document will be saved as a safety version before restoring {selected ? format(new Date(selected.created_at), 'MMM d, yyyy HH:mm:ss') : 'this version'}.</AlertDialogBody>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={restoring} onClick={event => { event.preventDefault(); void restore(); }}>{restoring ? 'Restoring…' : 'Restore version'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
