/**
 * GuestDataManagement — Import UI for authenticated users
 *
 * Allows authenticated users to upload a Guest Mode export JSON file
 * and import its contents into their database.
 *
 * Flow: Select file → Preview counts → Click Submit → Stream progress → Done
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, CheckCircle, AlertCircle, Database, RefreshCw,
  FileJson, ArrowRight, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
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

/** Extract preview counts from the parsed payload (client-side only). */
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

function countWorkUnits(payload: any): number {
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

export function GuestDataManagement() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const payloadRef = useRef<any>(null); // holds parsed JSON between preview → import

  const [importState, setImportState] = useState<ImportState>('idle');
  const [previewSummary, setPreviewSummary] = useState<ImportSummary | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 1, phase: '' });

  // Auto-reload the app after successful import so all data is fresh
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

  // ── Step 1: File select → parse & show preview ──

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Please select a .json export file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      toast.error('Invalid JSON file. Please select a valid Guest Mode export.');
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

    // Show preview — do NOT import yet
    payloadRef.current = payload;
    setPreviewSummary(preview);
    setErrorMsg('');
    setImportState('preview');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Step 2: User clicks Submit → start import ──

  const handleSubmitImport = useCallback(async () => {
    const payload = payloadRef.current;
    if (!payload) return;

    const totalWork = countWorkUnits(payload);
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
  }, []);

  // ── Actions ──

  const resetState = useCallback(() => {
    if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
    payloadRef.current = null;
    setImportState('idle');
    setSummary(null);
    setPreviewSummary(null);
    setErrorMsg('');
    setProgress({ current: 0, total: 1, phase: '' });
  }, []);

  const cancelPreview = useCallback(() => {
    payloadRef.current = null;
    setPreviewSummary(null);
    setImportState('idle');
  }, []);

  const reloadNow = useCallback(() => {
    if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
    window.location.reload();
  }, []);

  const cancelImport = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    payloadRef.current = null;
    setImportState('idle');
    setProgress({ current: 0, total: 1, phase: '' });
  }, []);

  const pct = Math.min(Math.round((progress.current / progress.total) * 100), 100);

  // ── Render: Post-import Done ──

  if (importState === 'done' && summary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle className="size-6 text-emerald-500 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm">Import Completed</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your Guest Mode data has been added to your workspace.
            </p>
          </div>
        </div>
        <SummaryGrid summary={summary} />
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
          App will reload automatically in a few seconds to refresh all data…
        </p>
      </div>
    );
  }

  // ── Render: Preview (before importing) ──

  if (importState === 'preview' && previewSummary) {
    const totalItems = Object.values(previewSummary).reduce((a, b) => a + (b || 0), 0);
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <FileJson className="size-5 text-blue-500 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm">Import Preview</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalItems} items found in the export. Review the data below, then click
              <strong> Submit </strong> to import into your workspace.
            </p>
          </div>
        </div>

        <SummaryGrid summary={previewSummary} />

        <div className="flex gap-3 pt-2">
          <Button variant="default" size="sm" onClick={handleSubmitImport}>
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

  // ── Render: Idle / Importing / Error ──

  return (
    <div className="space-y-5">
      {/* Info */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <Database className="size-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-medium">Import Guest Mode Data</p>
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
          accept=".json"
          className="hidden"
          onChange={handleFileSelect}
        />

        {importState === 'importing' ? (
          <div className="w-full max-w-sm mx-auto space-y-4">
            {/* Progress bar */}
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

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); cancelImport(); }}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-muted/30 rounded-full">
              <Upload className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Click to select an export file</p>
              <p className="text-xs text-muted-foreground mt-1">.json format from Guest Mode export</p>
            </div>
          </div>
        )}
      </div>

      {importState === 'error' && (
        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-600">
            <p className="font-medium">Import failed</p>
            <p className="mt-0.5">{errorMsg}</p>
            <Button variant="ghost" size="sm" className="mt-2 h-auto py-1 text-xs" onClick={resetState}>
              Try again
            </Button>
          </div>
        </div>
      )}
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
