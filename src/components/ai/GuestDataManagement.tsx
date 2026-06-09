/**
 * GuestDataManagement — Import UI for authenticated users
 *
 * Allows authenticated users to upload a Guest Mode export JSON file
 * and import its contents into their database.
 */

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, Database } from 'lucide-react';
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

type ImportState = 'idle' | 'importing' | 'done' | 'error';

export function GuestDataManagement() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
      toast.error('Please select a .json export file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Read file
    let payload: any;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch {
      toast.error('Invalid JSON file. Please select a valid Guest Mode export.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate structure
    if (!payload.data || typeof payload.data !== 'object') {
      toast.error('Invalid export format. Missing "data" field.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Confirm size
    const totalItems = payload.total_items || {};
    const itemCount = Object.values(totalItems).reduce((a: number, b: unknown) => a + (Number(b) || 0), 0);
    if (itemCount === 0) {
      toast.info('The export file contains no data to import.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Send to server
    setImportState('importing');
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/guest/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || `Server returned ${res.status}`);
      }

      setSummary(result.summary);
      setImportState('done');
      toast.success(result.message || 'Import completed successfully!');
    } catch (err: any) {
      setImportState('error');
      setErrorMsg(err.message || 'Import failed');
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetState = () => {
    setImportState('idle');
    setSummary(null);
    setErrorMsg('');
  };

  // ── Render ──

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

        {summary.skipped_existing > 0 && (
          <p className="text-xs text-muted-foreground">
            {summary.skipped_existing} existing items were skipped (already present).
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={resetState}>
            Import Another File
          </Button>
        </div>
      </div>
    );
  }

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
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
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
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importing data…</p>
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
          </div>
        </div>
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
