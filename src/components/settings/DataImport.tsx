/**
 * DataImport — Unified Import UI
 *
 * Supports JSON data import via `/api/guest/import` in all auth modes.
 * Desktop app also supports `.db` via `/api/desktop/restore/database`.
 *
 * Guest mode is available on all platforms (web + desktop).
 * Database file restore is only available in Desktop (SQLite) mode.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, CheckCircle, AlertCircle, Database, RefreshCw,
  FileJson, ArrowRight, X, HardDrive, FileType2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { localPersistence } from '@/lib/localPersistence';
import { toast } from 'sonner';

interface ImportSummary {
  projects: number;
  notes: number;
  diagrams: number;
  entities: number;
  columns: number;
  relationships: number;
  flowcharts: number;
  drawings: number;
  ai_chat_sessions: number;
  ai_chat_messages: number;
  skipped_existing: number;
}

type ImportState = 'idle' | 'preview' | 'importing' | 'done' | 'error';

interface ProgressState {
  current: number;
  total: number;
  phase: string;
}

// ── JSON helpers ──

function extractPreviewSummary(payload: any): ImportSummary {
  const data = payload?.data;
  if (!data) return { projects: 0, notes: 0, diagrams: 0, entities: 0, columns: 0, relationships: 0, flowcharts: 0, drawings: 0, ai_chat_sessions: 0, ai_chat_messages: 0, skipped_existing: 0 };

  let entities = 0, columns = 0, relationships = 0;
  for (const d of data.diagrams || []) {
    entities += (d.entities || []).length;
    for (const e of d.entities || []) columns += (e.columns || []).length;
    relationships += (d.relationships || []).length;
  }

  let aiMessages = 0;
  for (const s of data.ai_chat_sessions || []) {
    aiMessages += (s.messages || []).length;
  }

  return {
    projects: (data.projects || []).length,
    notes: (data.notes || []).length,
    diagrams: (data.diagrams || []).length,
    entities,
    columns,
    relationships,
    flowcharts: (data.flowcharts || []).length,
    drawings: (data.drawings || []).length,
    ai_chat_sessions: (data.ai_chat_sessions || []).length,
    ai_chat_messages: aiMessages,
    skipped_existing: 0,
  };
}

function countJsonWorkUnits(payload: any): number {
  const data = payload?.data;
  if (!data) return 1;
  let total = 0;
  total += (data.projects || []).length;
  total += (data.notes || []).length;
  for (const d of data.diagrams || []) {
    total += 1;
    const entities = d.entities || [];
    total += entities.length;
    for (const e of entities) total += (e.columns || []).length;
    total += (d.relationships || []).length;
  }
  total += (data.flowcharts || []).length;
  total += (data.drawings || []).length;
  for (const s of data.ai_chat_sessions || []) {
    total += 1;
    total += (s.messages || []).length;
  }
  return Math.max(total, 1);
}

// ── DB file info ──

interface DbFileInfo {
  fileName: string;
  fileSize: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Mode detection ──

function getMode(): 'guest' | 'desktop' | 'web' {
  if (sessionStorage.getItem('auth_mode') === 'guest') return 'guest';
  const isDesktop = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  if (isDesktop) return 'desktop';
  return 'web';
}

type FileType = 'json' | 'db' | null;

export function DataImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const payloadRef = useRef<any>(null);
  const fileRef = useRef<File | null>(null);

  const [importState, setImportState] = useState<ImportState>('idle');
  const [fileType, setFileType] = useState<FileType>(null);
  const [previewSummary, setPreviewSummary] = useState<ImportSummary | null>(null);
  const [dbInfo, setDbInfo] = useState<DbFileInfo | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 1, phase: '' });

  const mode = getMode();

  useEffect(() => {
    if (importState === 'done') {
      reloadTimerRef.current = setTimeout(() => {
        window.location.reload();
      }, 2500);
    }
    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [importState]);

  // ── File selection ──

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();

    // .db / .sqlite — desktop only
    if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
      if (getMode() !== 'desktop') {
        toast.error('Database file restore is only available in the Desktop app.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setFileType('db');
      setDbInfo({ fileName: file.name, fileSize: formatFileSize(file.size) });
      setPreviewSummary(null);
      setErrorMsg('');
      setImportState('preview');
      fileRef.current = file;
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // .json — all modes
    if (ext === 'json') {
      let payload: any;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        toast.error('Invalid JSON file. Please select a valid export file.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      if (!payload.data || typeof payload.data !== 'object') {
        toast.error('Invalid export format. Missing "data" field.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const preview = extractPreviewSummary(payload);
      const totalItems = Object.values(preview).reduce((a, b) => a + (b || 0), 0);
      if (totalItems <= 1) {
        toast.info('The export file contains no data to import.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      payloadRef.current = payload;
      setFileType('json');
      setPreviewSummary(preview);
      setDbInfo(null);
      setErrorMsg('');
      setImportState('preview');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    toast.error(`Unsupported file type ".${ext}". Please select a .json, .db, or .sqlite file.`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── JSON submit ──

  const handleSubmitJson = useCallback(async () => {
    const payload = payloadRef.current;
    if (!payload) return;

    const totalWork = countJsonWorkUnits(payload);
    setImportState('importing');
    setErrorMsg('');
    setProgress({ current: 0, total: totalWork, phase: 'Preparing import…' });

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const res = await apiFetch('/api/guest/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });

      if (!res.ok) {
        let errorText = `Server returned ${res.status}`;
        try { const errBody = await res.json(); errorText = errBody.error || errorText; } catch { /* */ }
        throw new Error(errorText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Browser does not support streaming responses.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'progress') {
              setProgress({
                current: Number(msg.current) || 0,
                total: Number(msg.total) || totalWork,
                phase: String(msg.phase || ''),
              });
            } else if (msg.type === 'complete') {
              setSummary(msg.summary);
              setImportState('done');
              toast.success(msg.message || 'Import completed successfully!');
              abortRef.current = null;
              return;
            } else if (msg.type === 'error') {
              throw new Error(msg.error || 'Import failed on server.');
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      throw new Error('Stream ended unexpectedly. Import may be incomplete.');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setImportState('error');
      setErrorMsg(err.message || 'Import failed');
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    }

    abortRef.current = null;
  }, [mode]);

  // ── Database restore submit ──

  const handleSubmitDb = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;

    setImportState('importing');
    setErrorMsg('');
    setProgress({ current: 0, total: 5, phase: 'Uploading database file…' });

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const formData = new FormData();
      formData.append('database', file);

      const res = await apiFetch('/api/desktop/restore/database', {
        method: 'POST',
        body: formData,
        signal: abort.signal,
      });

      if (!res.ok) {
        let errorText = `Server returned ${res.status}`;
        try { const errBody = await res.json(); errorText = errBody.error || errorText; } catch { /* */ }
        throw new Error(errorText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Browser does not support streaming responses.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'progress') {
              setProgress({
                current: Number(msg.current) || 0,
                total: Number(msg.total) || 5,
                phase: String(msg.phase || ''),
              });
            } else if (msg.type === 'complete') {
              await localPersistence.clearAllPendingSyncs();
              setImportState('done');
              toast.success(msg.message || 'Database restored successfully!');
              abortRef.current = null;
              return;
            } else if (msg.type === 'error') {
              throw new Error(msg.error || 'Restore failed on server.');
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      throw new Error('Stream ended unexpectedly. Restore may be incomplete.');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setImportState('error');
      setErrorMsg(err.message || 'Restore failed');
      toast.error('Restore failed: ' + (err.message || 'Unknown error'));
    }

    abortRef.current = null;
  }, []);

  // ── Shared actions ──

  const resetState = useCallback(() => {
    if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
    payloadRef.current = null;
    fileRef.current = null;
    setImportState('idle');
    setFileType(null);
    setSummary(null);
    setPreviewSummary(null);
    setDbInfo(null);
    setErrorMsg('');
    setProgress({ current: 0, total: 1, phase: '' });
  }, []);

  const cancelPreview = useCallback(() => {
    payloadRef.current = null;
    fileRef.current = null;
    setPreviewSummary(null);
    setDbInfo(null);
    setImportState('idle');
    setFileType(null);
  }, []);

  const reloadNow = useCallback(() => {
    if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
    window.location.reload();
  }, []);

  const cancelImport = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    payloadRef.current = null;
    fileRef.current = null;
    setImportState('idle');
    setFileType(null);
    setProgress({ current: 0, total: 1, phase: '' });
  }, []);

  const handleSubmit = useCallback(() => {
    if (fileType === 'db') {
      handleSubmitDb();
    } else {
      handleSubmitJson();
    }
  }, [fileType, handleSubmitDb, handleSubmitJson]);

  const pct = Math.min(Math.round((progress.current / progress.total) * 100), 100);

  // ── Resolve accepted file types and upload label ──

  const { accept, acceptLabel } = mode === 'desktop'
    ? { accept: '.json,.db,.sqlite,.sqlite3', acceptLabel: '.json (data) or .db / .sqlite (database restore)' }
    : { accept: '.json', acceptLabel: '.json format from Guest Mode export' };

  // ── Render: Done ──

  if (importState === 'done') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle className="size-6 text-emerald-500 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm">
              {fileType === 'db' ? 'Database Restored' : 'Import Completed'}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fileType === 'db'
                ? 'The database file has been restored. The app will reload to apply the changes.'
                : 'Data has been added to your workspace.'}
            </p>
          </div>
        </div>
        {summary && <SummaryGrid summary={summary} />}
        <div className="flex gap-3">
          <Button variant="default" size="sm" onClick={reloadNow}>
            <RefreshCw className="size-3.5 mr-1.5" />
            Reload App Now
          </Button>
          <Button variant="outline" size="sm" onClick={resetState}>
            Import Another File
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          App will reload automatically in a few seconds…
        </p>
      </div>
    );
  }

  // ── Render: Preview ──

  if (importState === 'preview') {
    if (fileType === 'db' && dbInfo) {
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <FileType2 className="size-5 text-blue-500 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">Restore Database File</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                This will <strong className="text-amber-500">replace</strong> your current local database
                with the selected file. A safety backup will be created automatically before the restore.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Use this if you reinstalled the app and want to restore from a previous
                <code className="bg-muted px-1 rounded text-[11px] mx-0.5">.db</code> file that you saved manually.
              </p>
            </div>
          </div>

          <div className="bg-muted/20 border border-border/40 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">File</span>
              <span className="font-medium">{dbInfo.fileName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Size</span>
              <span className="font-medium">{dbInfo.fileSize}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="default" size="sm" onClick={handleSubmit}>
              <ArrowRight className="size-3.5 mr-1.5" />
              Restore Database
            </Button>
            <Button variant="outline" size="sm" onClick={cancelPreview}>
              <X className="size-3.5 mr-1.5" />
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    if (fileType === 'json' && previewSummary) {
      const totalItems = Object.values(previewSummary).reduce((a, b) => a + (b || 0), 0);
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <FileJson className="size-5 text-blue-500 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">Import Preview</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalItems} items found in the export file. Click <strong>Submit</strong> to import the data.
              </p>
            </div>
          </div>
          <SummaryGrid summary={previewSummary} />
          <div className="flex gap-3 pt-2">
            <Button variant="default" size="sm" onClick={handleSubmit}>
              <ArrowRight className="size-3.5 mr-1.5" />
              Submit
            </Button>
            <Button variant="outline" size="sm" onClick={cancelPreview}>
              <X className="size-3.5 mr-1.5" />
              Cancel
            </Button>
          </div>
        </div>
      );
    }
  }

  // ── Render: Error ──

  if (importState === 'error') {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-600">
            <p className="font-medium">
              {fileType === 'db' ? 'Database restore failed' : 'Import failed'}
            </p>
            <p className="mt-0.5">{errorMsg}</p>
            <Button variant="ghost" size="sm" className="mt-2 h-auto py-1 text-xs" onClick={resetState}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Idle / Importing ──

  return (
    <div className="space-y-5">
      {/* Info */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <HardDrive className="size-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-medium">Import Data</p>
          <p className="text-xs text-muted-foreground">
            Upload a <code className="bg-muted px-1 rounded text-[11px]">.json</code> file
            exported from Guest Mode. All data will be <strong>added</strong> to your workspace
            — existing items with the same ID will be skipped. New projects will be created
            for any project‑scoped items.
          </p>
          <p className="text-xs text-muted-foreground">
            Supports: Notes, ERD Diagrams (entities, columns, relationships),
            Flowcharts, Drawings, AI Chat sessions &amp; messages, and Projects.
          </p>
          {mode === 'desktop' && (
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
              <strong className="text-amber-500">Desktop only:</strong> You can also restore a
              <code className="bg-muted px-1 rounded text-[11px] mx-0.5">.db</code> database file
              — useful after reinstalling the app to recover data from a manually saved copy.
              A safety backup is created automatically.
            </p>
          )}
        </div>
      </div>

      {/* Upload area */}
      <div
        onClick={() => { if (importState !== 'importing') fileInputRef.current?.click(); }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && importState !== 'importing')
            fileInputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        className="border-2 border-dashed border-border/50 hover:border-primary/40 rounded-xl p-8 text-center cursor-pointer transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileSelect}
        />

        {importState === 'importing' ? (
          <div className="w-full max-w-sm mx-auto space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate mr-2">{progress.phase || 'Importing…'}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {progress.current.toLocaleString()} / {progress.total.toLocaleString()} items
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); cancelImport(); }} className="text-xs">
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-muted/30 rounded-full">
              <Upload className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Click to select a file</p>
              <p className="text-xs text-muted-foreground mt-1">{acceptLabel}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared components ──

function SummaryGrid({ summary }: { summary: ImportSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard label="Projects" value={summary.projects} />
        <SummaryCard label="Notes" value={summary.notes} />
        <SummaryCard label="ERD Diagrams" value={summary.diagrams} />
        <SummaryCard label="Tables (Entities)" value={summary.entities} />
        <SummaryCard label="Columns" value={summary.columns} />
        <SummaryCard label="Relationships" value={summary.relationships} />
        <SummaryCard label="Flowcharts" value={summary.flowcharts} />
        <SummaryCard label="Drawings" value={summary.drawings} />
        <SummaryCard label="AI Sessions" value={summary.ai_chat_sessions} />
      </div>
      {summary.ai_chat_messages > 0 && (
        <p className="text-[11px] text-muted-foreground px-0.5">
          Includes {summary.ai_chat_messages.toLocaleString()} AI chat messages.
        </p>
      )}
      {summary.skipped_existing > 0 && (
        <p className="text-[11px] text-amber-500 px-0.5">
          {summary.skipped_existing.toLocaleString()} item(s) already existed and were skipped.
        </p>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/20 border border-border/40 rounded-lg p-3 text-center">
      <p className="text-lg font-bold">{value.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
