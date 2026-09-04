import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Database, Plus, AlertTriangle } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';
import { parseSQLToERD } from '@/lib/sqlParser';
import { dbmlToERD } from '@/lib/dbml-converter';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Entity } from '@/types';
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
import { extractDBML, extractSQL } from './chatUtils';

export interface ErdFromSqlDialogProps {
  schema: string;
  onClose: () => void;
  diagrams: any[];
  targetProjectId: string | number | null | undefined;
  erdDefaultName?: string;
  handleSidebarDiagramCreate: (name: string, projectId?: any, options?: { silent?: boolean }) => Promise<any>;
  handleDiagramSelect: (uid: string) => Promise<any>;
  triggerPendingErdDiff: () => void;
  createSilently?: boolean;
  onCreated?: (diagram: any, schema: string) => void | Promise<void>;
  onUpdated?: (diagram: any, schema: string) => void | Promise<void>;
}

export function ErdFromSqlDialog({
  schema,
  onClose,
  diagrams,
  targetProjectId,
  erdDefaultName = 'New ERD',
  handleSidebarDiagramCreate,
  handleDiagramSelect,
  triggerPendingErdDiff,
  createSilently = false,
  onCreated,
  onUpdated,
}: ErdFromSqlDialogProps) {
  const [erdMode, setErdMode] = useState<'create' | 'update' | null>(null);
  const [erdUpdateUid, setErdUpdateUid] = useState<string | null>(null);
  const [erdExistingData, setErdExistingData] = useState<{ nodes: Node<Entity>[]; edges: Edge[] } | null>(null);
  const [erdFetchingExisting, setErdFetchingExisting] = useState(false);
  const [erdModeConfirming, setErdModeConfirming] = useState(false);

  const normalizedSchema = useMemo(() => {
    if (!schema) return '';
    return extractDBML(schema) || extractSQL(schema) || schema.trim();
  }, [schema]);

  const schemaKind = useMemo<'dbml' | 'sql'>(() => {
    const dbmlKeywords = /^\s*(?:Table|Enum)\s+(?:"[^"]+"|[\w.]+)\s*\{|^\s*Ref\s*:/im;
    const sqlKeywords = /\b(?:CREATE|ALTER)\s+TABLE\b/i;
    if (dbmlKeywords.test(normalizedSchema) && !sqlKeywords.test(normalizedSchema)) return 'dbml';
    return 'sql';
  }, [normalizedSchema]);

  // ── Memoized parsed schema ──
  const erdParsed = useMemo(() => {
    if (!normalizedSchema) return null;
    try {
      return schemaKind === 'dbml' ? dbmlToERD(normalizedSchema) : parseSQLToERD(normalizedSchema);
    } catch {
      return null;
    }
  }, [normalizedSchema, schemaKind]);

  // ── Memoized diff lines ──
  const erdDiff = useMemo(() => {
    if (!erdParsed || !erdExistingData || erdMode !== 'update') return null;
    const existingByName = new Map<string, any>();
    for (const node of erdExistingData.nodes) {
      existingByName.set(node.data.name.toLowerCase(), node.data);
    }

    const diffRows: { tableName: string; isNew: boolean; oldCols: any[]; newCols: any[] }[] = [];
    for (const node of erdParsed.nodes) {
      const existing = existingByName.get(node.data.name.toLowerCase());
      diffRows.push({
        tableName: node.data.name,
        isNew: !existing,
        oldCols: (existing?.columns || []).map((c: any) => ({ name: c.name, type: c.type, is_pk: !!c.is_pk, is_nullable: !!c.is_nullable })),
        newCols: (node.data.columns || []).map((c: any) => ({ name: c.name, type: c.type, is_pk: !!c.is_pk, is_nullable: !!c.is_nullable })),
      });
    }

    const deletedTables: string[] = [];
    for (const node of erdExistingData.nodes) {
      if (!erdParsed.nodes.find((n: any) => n.data.name.toLowerCase() === node.data.name.toLowerCase())) {
        deletedTables.push(node.data.name);
      }
    }

    if (diffRows.length === 0) return null;

    type DiffLine =
      | { type: 'header'; tableName: string; isNew?: boolean }
      | { type: 'add' | 'remove' | 'normal'; prefix: string; col: { name: string; type: string; is_pk: boolean; is_nullable: boolean } };

    const diffLines: DiffLine[] = [];
    for (const row of diffRows) {
      diffLines.push({ type: 'header', tableName: row.tableName, isNew: row.isNew });

      const oldByName = new Map(row.oldCols.map((c: any) => [c.name.toLowerCase(), c]));
      const newByName = new Map(row.newCols.map((c: any) => [c.name.toLowerCase(), c]));
      const allNames = new Set([...oldByName.keys(), ...newByName.keys()]);

      for (const name of allNames) {
        const old = oldByName.get(name);
        const nw = newByName.get(name);

        if (!old && nw) {
          diffLines.push({ type: 'add', prefix: '+', col: nw });
        } else if (old && !nw) {
          diffLines.push({ type: 'remove', prefix: '-', col: old });
        } else if (old && nw) {
          const changed = old.type !== nw.type || old.is_nullable !== nw.is_nullable;
          if (changed) {
            diffLines.push({ type: 'remove', prefix: '-', col: old });
            diffLines.push({ type: 'add', prefix: '+', col: nw });
          } else {
            diffLines.push({ type: 'normal', prefix: ' ', col: old });
          }
        }
      }
    }
    return { diffLines, deletedTables };
  }, [erdParsed, erdExistingData, erdMode]);

  // ── Fetch existing ERD data when user selects a target file for update ──
  useEffect(() => {
    if (!erdUpdateUid || erdMode !== 'update') {
      setErdExistingData(null);
      return;
    }
    let cancelled = false;
    setErdFetchingExisting(true);
    apiFetch(`/api/diagrams/${erdUpdateUid}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        if (!data || !data.entities) { setErdExistingData(null); return; }
        const nodes: Node<Entity>[] = data.entities.map((e: any) => ({
          id: e.id,
          type: 'entity',
          position: { x: e.x || 0, y: e.y || 0 },
          data: e,
        }));
        const edges: Edge[] = (data.relationships || []).map((r: any) => ({
          id: r.id,
          source: r.source_entity_id,
          target: r.target_entity_id,
          sourceHandle: r.source_handle || undefined,
          targetHandle: r.target_handle || undefined,
          label: r.label,
          type: 'smoothstep',
        }));
        setErdExistingData({ nodes, edges });
      })
      .catch(() => { if (!cancelled) setErdExistingData(null); })
      .finally(() => { if (!cancelled) setErdFetchingExisting(false); });
    return () => { cancelled = true; };
  }, [erdUpdateUid, erdMode]);

  const handleCreateErd = useCallback(async () => {
    if (!createSilently) localStorage.setItem('pending_create_erd_schema', normalizedSchema);
    toast.info('Creating new ERD diagram...');
    const d = await handleSidebarDiagramCreate(`ERD - ${erdDefaultName}`, targetProjectId, { silent: createSilently });
    if (d?.uid) {
      if (!createSilently) localStorage.setItem('chat_erd_uid', d.uid);
      onClose();
      await onCreated?.(d, normalizedSchema);
      return;
    }
    onClose();
  }, [normalizedSchema, handleSidebarDiagramCreate, targetProjectId, erdDefaultName, onClose]);

  const handleUpdateErd = useCallback(async (uid: string) => {
    const diagram = diagrams.find(item => String(item.uid ?? item.id) === String(uid));
    if (onUpdated && diagram) {
      await onUpdated(diagram, normalizedSchema);
      onClose();
      return;
    }
    localStorage.setItem('pending_update_erd_schema', normalizedSchema);
    localStorage.setItem('chat_erd_uid', uid);
    toast.info('Review schema changes in the ERD diff panel...');
    if (window.location.pathname === `/diagrams/${uid}`) {
      triggerPendingErdDiff();
      onClose();
      return;
    }
    await handleDiagramSelect(uid);
    onClose();
  }, [diagrams, normalizedSchema, handleDiagramSelect, triggerPendingErdDiff, onClose, onUpdated]);

  const eligibleDiagrams = useMemo(() => diagrams.filter((d: any) => {
    if (targetProjectId == null || targetProjectId === 'none') {
      return d.project_id == null || d.project_id === 'none' || d.project_id === '';
    }
    return String(d.project_id) === String(targetProjectId);
  }), [diagrams, targetProjectId]);

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogOverlay />
      <DialogContent size="md" showCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Database className="size-4 text-indigo-400" />
            </div>
            <div>
              <DialogTitle>Create ERD from DBML</DialogTitle>
              <DialogDescription>
                {erdMode === 'update'
                  ? `Select which ERD diagram to update with this ${schemaKind.toUpperCase()}`
                  : 'Create a new ERD diagram or update an existing one from DBML'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4">
            {/* Action selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setErdMode('create'); setErdUpdateUid(null); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                  erdMode === 'create'
                    ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-border/60 bg-muted/20 hover:bg-indigo-500/5 hover:border-indigo-500/20'
                }`}
              >
                <Plus className={`size-5 ${erdMode === 'create' ? 'text-indigo-300' : 'text-indigo-400'}`} />
                <div>
                  <p className="text-xs font-semibold text-foreground">Create New</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">New ERD diagram with these tables</p>
                </div>
              </button>

              <button
                onClick={() => setErdMode('update')}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                  erdMode === 'update'
                    ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30'
                    : 'border-border/60 bg-muted/20 hover:bg-amber-500/5 hover:border-amber-500/20'
                }`}
              >
                <Database className={`size-5 ${erdMode === 'update' ? 'text-amber-300' : 'text-amber-400'}`} />
                <div>
                  <p className="text-xs font-semibold text-foreground">Update Existing</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Merge or replace an existing ERD</p>
                </div>
              </button>
            </div>

            {/* Parse error: schema invalid */}
            {normalizedSchema && !erdParsed && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">Invalid {schemaKind.toUpperCase()} schema</p>
                    <p className="text-[11px] text-red-400/70 mt-1">
                      The schema could not be parsed. Use valid <code className="bg-red-500/10 px-1 rounded">Table</code> and <code className="bg-red-500/10 px-1 rounded">Ref</code> blocks for DBML. SQL <code className="bg-red-500/10 px-1 rounded">CREATE TABLE</code> is kept only as fallback compatibility.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {erdParsed && erdMode && (
              erdMode === 'update' ? (
                <div className="space-y-3 pt-2 border-t border-border/20">
                  <label className="text-[11px] font-medium text-muted-foreground">Target ERD</label>
                  <Select value={erdUpdateUid || ''} onValueChange={setErdUpdateUid}>
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder="Choose an ERD diagram...">
                        {(val: string | null) => {
                          if (!val) return null;
                          const d = diagrams.find((d: any) => (d.uid ?? String(d.id)) === val);
                          return d?.name || 'Untitled';
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleDiagrams.length === 0 ? (
                        <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">
                          No ERD diagrams in this project
                        </div>
                      ) : (
                        <SelectGroup>
                          <SelectLabel>ERD Diagrams</SelectLabel>
                          {eligibleDiagrams.map((d: any) => (
                            <SelectItem key={d.uid ?? d.id} value={d.uid ?? String(d.id)}>
                              <span>{d.name || 'Untitled'}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>

                  {erdUpdateUid && erdFetchingExisting && (
                    <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin mr-2" />
                      Loading existing schema...
                    </div>
                  )}

                  {erdUpdateUid && !erdFetchingExisting && erdDiff && (() => {
                    const deletedTables = erdDiff.deletedTables;
                    return (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Column Comparison
                          {deletedTables.length > 0 && (
                            <span className="ml-2 text-red-400/70 text-[10px]">
                              ({deletedTables.length} table{deletedTables.length > 1 ? 's' : ''} removed)
                            </span>
                          )}
                        </label>
                        <div className="rounded-lg border border-border/40 overflow-hidden max-h-75 overflow-y-auto custom-scrollbar text-[10px] font-mono leading-relaxed bg-muted/30">
                          <div className="divide-y divide-border/10">
                            {erdDiff.diffLines.map((line: any, li: number) => {
                              if (line.type === 'header') {
                                return (
                                  <div key={li} className="flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border/30">
                                    {line.isNew && (
                                      <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">NEW</span>
                                    )}
                                    <span className="text-[11px] font-semibold text-foreground">{line.tableName}</span>
                                  </div>
                                );
                              }
                              const isAdd = line.type === 'add';
                              const isRemove = line.type === 'remove';
                              const bg = isAdd ? 'bg-emerald-500/5 dark:bg-emerald-900/20' : isRemove ? 'bg-red-500/5 dark:bg-red-900/20' : '';
                              const prefixColor = isAdd ? 'text-emerald-600 dark:text-emerald-400' : isRemove ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/40';
                              const colNameColor = isAdd ? 'text-emerald-700 dark:text-emerald-300' : isRemove ? 'text-red-700 dark:text-red-400' : 'text-foreground';
                              const typeColor = isAdd ? 'text-emerald-600/60 dark:text-emerald-400/60' : isRemove ? 'text-red-600/60 dark:text-red-400/60' : 'text-muted-foreground';
                              const pkColor = isAdd ? 'text-emerald-600 dark:text-emerald-400' : isRemove ? 'text-red-600/70 dark:text-red-400/70' : 'text-amber-600 dark:text-amber-400';
                              const nulColor = isAdd ? 'text-emerald-600/50 dark:text-emerald-400/50' : isRemove ? 'text-red-600/50 dark:text-red-400/50' : 'text-muted-foreground/50';
                              return (
                                <div key={li} className={`flex items-center gap-1 px-3 py-0.5 ${bg}`}>
                                  <span className={`w-4 shrink-0 select-none ${prefixColor}`}>{line.prefix}</span>
                                  {line.col.is_pk && <span className={pkColor}>PK</span>}
                                  <span className={colNameColor}>{line.col.name}</span>
                                  <span className={typeColor}>{line.col.type}</span>
                                  {line.col.is_nullable && <span className={nulColor}>?</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {deletedTables.length > 0 && (
                          <p className="text-[9px] text-red-400/50 leading-relaxed">Tables not in the new schema will be kept as-is in the existing ERD.</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                // ── Create New: show table cards ──
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Tables ({erdParsed.nodes.length})
                  </label>
                  <div className="max-h-75 overflow-y-auto custom-scrollbar space-y-2">
                    {erdParsed.nodes.map((node: any) => (
                      <div key={node.id} className="rounded-lg border border-border/40 bg-muted overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/20 bg-muted/50">
                          <Database className="size-3 text-indigo-400 shrink-0" />
                          <span className="text-[11px] font-semibold text-foreground">{node.data.name}</span>
                          <span className="text-[9px] text-muted-foreground ml-auto">{node.data.columns.length} col</span>
                        </div>
                        <div className="divide-y divide-border/10">
                          {node.data.columns.map((col: any) => (
                            <div key={col.id} className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono">
                              <div className="flex items-center gap-1 w-15 shrink-0">
                                {col.is_pk && <span className="text-[8px] text-amber-600 dark:text-amber-400 font-semibold">PK</span>}
                                {col._is_fk && <span className="text-[8px] text-blue-600 dark:text-blue-400 font-semibold">FK</span>}
                              </div>
                              <span className="text-foreground min-w-10">{col.name}</span>
                              <span className="text-muted-foreground">{col.type}</span>
                              {col.is_nullable && <span className="text-muted-foreground/50 text-[8px]">nullable</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!erdMode || erdModeConfirming || !erdParsed || (erdMode === 'update' && !erdUpdateUid)}
            onClick={async () => {
              if (!erdMode) return;
              setErdModeConfirming(true);
              try {
                if (erdMode === 'create') {
                  await handleCreateErd();
                } else if (erdMode === 'update' && erdUpdateUid) {
                  await handleUpdateErd(erdUpdateUid);
                }
              } finally {
                setErdModeConfirming(false);
              }
            }}
          >
            {erdModeConfirming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Database className="size-3.5" />
            )}
            {erdMode === 'create' ? 'Create ERD' : 'Update ERD'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
