import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, GitBranch, Plus, AlertTriangle } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';
import { previewFlowchartContent } from '@/components/ai/actions/flowchartActions';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
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
import { FlowchartNodeData } from '@/components/FlowchartNode';

export interface FlowchartFromJsonDialogProps {
  json: string;
  onClose: () => void;
  flowcharts: any[];
  targetProjectId: string | number | null | undefined;
  flowchartDefaultName?: string;
  handleSidebarFlowchartCreate: (name: string, projectId?: any) => Promise<any>;
  handleFlowchartSelect: (uid: string) => Promise<any>;
}

export function FlowchartFromJsonDialog({
  json,
  onClose,
  flowcharts,
  targetProjectId,
  flowchartDefaultName = 'New Flowchart',
  handleSidebarFlowchartCreate,
  handleFlowchartSelect,
}: FlowchartFromJsonDialogProps) {
  const [mode, setMode] = useState<'create' | 'update' | null>(null);
  const [updateUid, setUpdateUid] = useState<string | null>(null);
  const [existingData, setExistingData] = useState<{ nodes: Node<FlowchartNodeData>[]; edges: Edge[] } | null>(null);
  const [fetchingExisting, setFetchingExisting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ── Parse new nodes/edges from AI JSON ──
  const newNodes = useMemo(() => {
    if (!json) return [];
    const result = previewFlowchartContent(json);
    return result?.nodes || [];
  }, [json]);

  const newEdges = useMemo(() => {
    if (!json) return [];
    const result = previewFlowchartContent(json);
    return result?.edges || [];
  }, [json]);

  // ── Fetch existing flowchart data for update mode ──
  useEffect(() => {
    if (!updateUid || mode !== 'update') {
      setExistingData(null);
      return;
    }
    let cancelled = false;
    setFetchingExisting(true);
    apiFetch(`/api/flowcharts/${updateUid}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        if (!data || !data.data) { setExistingData(null); return; }
        try {
          const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          const nodes: Node<FlowchartNodeData>[] = (parsed.nodes || []).map((n: any) => ({
            id: n.id,
            type: 'flowchartNode',
            position: n.position || { x: 0, y: 0 },
            data: n.data || n,
          }));
          const edges: Edge[] = (parsed.edges || []).map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            label: e.label,
            type: 'smoothstep',
          }));
          setExistingData({ nodes, edges });
        } catch {
          setExistingData(null);
        }
      })
      .catch(() => { if (!cancelled) setExistingData(null); })
      .finally(() => { if (!cancelled) setFetchingExisting(false); });
    return () => { cancelled = true; };
  }, [updateUid, mode]);

  // ── Compute diff for update mode (ERD-style comparison) ──
  const diff = useMemo(() => {
    if (!existingData || !newNodes.length || mode !== 'update') return null;

    const existingByLabel = new Map<string, Node<FlowchartNodeData>>();
    for (const node of existingData.nodes) {
      existingByLabel.set((node.data.label || '').toLowerCase(), node);
    }
    const newByLabel = new Map<string, Node<FlowchartNodeData>>();
    for (const node of newNodes) {
      newByLabel.set((node.data.label || '').toLowerCase(), node);
    }

    type DiffRow = {
      nodeName: string;
      isNew: boolean;
      isRemoved: boolean;
      shapeOld?: string; shapeNew?: string; shapeChanged?: boolean;
      colorOld?: string; colorNew?: string; colorChanged?: boolean;
      labelOld?: string; labelNew?: string; labelChanged?: boolean;
    };

    const rows: DiffRow[] = [];

    // New + modified nodes
    for (const node of newNodes) {
      const label = node.data.label || 'Untitled';
      const existing = existingByLabel.get(label.toLowerCase());
      if (!existing) {
        rows.push({ nodeName: label, isNew: true, isRemoved: false });
      } else {
        const shapeChanged = existing.data.shape !== node.data.shape;
        const colorChanged = existing.data.color !== node.data.color;
        const labelChanged = (existing.data.label || '') !== label;
        if (shapeChanged || colorChanged || labelChanged) {
          rows.push({
            nodeName: label,
            isNew: false,
            isRemoved: false,
            shapeOld: existing.data.shape, shapeNew: node.data.shape, shapeChanged,
            colorOld: existing.data.color, colorNew: node.data.color, colorChanged,
            labelOld: existing.data.label || label, labelNew: label, labelChanged,
          });
        }
      }
    }

    // Removed nodes
    for (const node of existingData.nodes) {
      const label = node.data.label || '';
      if (!newByLabel.has(label.toLowerCase())) {
        rows.push({ nodeName: label, isNew: false, isRemoved: true });
      }
    }

    // Edge diff
    const oldEdgeKeys = new Set(
      existingData.edges.map(e => {
        const src = existingData.nodes.find(n => n.id === e.source)?.data.label || e.source;
        const tgt = existingData.nodes.find(n => n.id === e.target)?.data.label || e.target;
        return `${src.toLowerCase()}→${tgt.toLowerCase()}`;
      })
    );
    const newEdgeKeys = new Set(
      newEdges.map(e => {
        const src = newNodes.find(n => n.id === e.source)?.data.label || e.source;
        const tgt = newNodes.find(n => n.id === e.target)?.data.label || e.target;
        return `${src.toLowerCase()}→${tgt.toLowerCase()}`;
      })
    );
    const addedEdges = [...newEdgeKeys].filter(k => !oldEdgeKeys.has(k));
    const removedEdges = [...oldEdgeKeys].filter(k => !newEdgeKeys.has(k));

    return { rows, addedEdges, removedEdges };
  }, [existingData, newNodes, newEdges, mode]);

  // ── Create new flowchart ──
  const handleCreate = useCallback(async () => {
    localStorage.setItem('pending_create_flowchart_json', json);
    toast.info('Creating new Flowchart...');
    await handleSidebarFlowchartCreate(`Flowchart - ${flowchartDefaultName}`, targetProjectId);
    onClose();
  }, [json, handleSidebarFlowchartCreate, targetProjectId, flowchartDefaultName, onClose]);

  // ── Update existing flowchart ──
  const handleUpdate = useCallback(async (uid: string) => {
    localStorage.setItem('pending_update_flowchart_json', json);
    localStorage.setItem('chat_flowchart_uid', uid);
    toast.info('Review changes in the Flowchart...');
    if (window.location.pathname === `/flowcharts/${uid}`) {
      onClose();
      return;
    }
    await handleFlowchartSelect(uid);
    onClose();
  }, [json, handleFlowchartSelect, onClose]);

  // ── Filter flowcharts by project ──
  const eligibleFlowcharts = useMemo(() => flowcharts.filter((f: any) => {
    if (targetProjectId == null || targetProjectId === 'none') {
      return f.project_id == null || f.project_id === 'none' || f.project_id === '';
    }
    return String(f.project_id) === String(targetProjectId);
  }), [flowcharts, targetProjectId]);

  const hasNodes = newNodes.length > 0;

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogOverlay />
      <DialogContent size="md" showCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <GitBranch className="size-4 text-emerald-400" />
            </div>
            <div>
              <DialogTitle>Flowchart from AI</DialogTitle>
              <DialogDescription>
                {mode === 'update'
                  ? 'Select which Flowchart to update'
                  : 'Create a new Flowchart or update an existing one'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4">
            {/* Action selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setMode('create'); setUpdateUid(null); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                  mode === 'create'
                    ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                    : 'border-border/60 bg-muted/20 hover:bg-emerald-500/5 hover:border-emerald-500/20'
                }`}
              >
                <Plus className={`size-5 ${mode === 'create' ? 'text-emerald-300' : 'text-emerald-400'}`} />
                <div>
                  <p className="text-xs font-semibold text-foreground">Create New</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">New Flowchart with these symbols</p>
                </div>
              </button>

              <button
                onClick={() => setMode('update')}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                  mode === 'update'
                    ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30'
                    : 'border-border/60 bg-muted/20 hover:bg-amber-500/5 hover:border-amber-500/20'
                }`}
              >
                <GitBranch className={`size-5 ${mode === 'update' ? 'text-amber-300' : 'text-amber-400'}`} />
                <div>
                  <p className="text-xs font-semibold text-foreground">Update Existing</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Merge or replace an existing Flowchart</p>
                </div>
              </button>
            </div>

            {/* Parse error: flowchart JSON invalid */}
            {json && !hasNodes && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">Invalid Flowchart JSON</p>
                    <p className="text-[11px] text-red-400/70 mt-1">
                      The JSON could not be parsed. Ensure it contains a valid <code className="bg-red-500/10 px-1 rounded">{'{ "nodes": [...], "edges": [...] }'}</code> structure.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Preview: Create mode — show symbol cards */}
            {hasNodes && mode === 'create' && (
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Symbols ({newNodes.length})
                </label>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
                  {newNodes.map((node: any) => (
                    <div key={node.id} className="rounded-lg border border-border/40 bg-muted overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/20 bg-muted/50">
                        <GitBranch className="size-3 text-emerald-400 shrink-0" />
                        <span className="text-[11px] font-semibold text-foreground">{node.data.label}</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{node.data.shape}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono">
                        <span className="text-muted-foreground">Shape:</span>
                        <span className="text-foreground/80">{node.data.shape}</span>
                        {node.data.color && (
                          <>
                            <span className="text-muted-foreground ml-2">Color:</span>
                            <span className="text-gray-300">{node.data.color}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview: Update mode — target selector + diff */}
            {mode === 'update' && (
              <div className="space-y-3 pt-2 border-t border-border/20">
                <label className="text-[11px] font-medium text-muted-foreground">Target Flowchart</label>
                <Select value={updateUid || ''} onValueChange={setUpdateUid}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Choose a Flowchart...">
                      {(val: string | null) => {
                        if (!val) return null;
                        const f = flowcharts.find((f: any) => (f.uid ?? String(f.id)) === val);
                        return f?.title || f?.name || 'Untitled';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleFlowcharts.length === 0 ? (
                      <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">
                        No Flowcharts in this project
                      </div>
                    ) : (
                      <SelectGroup>
                        <SelectLabel>Flowcharts</SelectLabel>
                        {eligibleFlowcharts.map((f: any) => (
                          <SelectItem key={f.uid ?? f.id} value={f.uid ?? String(f.id)}>
                            <span>{f.title || f.name || 'Untitled'}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>

                {updateUid && fetchingExisting && (
                  <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin mr-2" />
                    Loading existing Flowchart...
                  </div>
                )}

                {updateUid && !fetchingExisting && diff && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Comparison
                      {diff.rows.filter(r => r.isRemoved).length > 0 && (
                        <span className="ml-2 text-red-400/70 text-[10px]">
                          ({diff.rows.filter(r => r.isRemoved).length} node{diff.rows.filter(r => r.isRemoved).length > 1 ? 's' : ''} removed)
                        </span>
                      )}
                    </label>
                    <div className="rounded-lg border border-border/40 overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar text-[10px] font-mono leading-relaxed">
                      <div className="divide-y divide-border/10">
                        {diff.rows.map((row, ri) => (
                          <div key={ri}>
                            {/* Node header */}
                            <div className={`flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border/30 ${row.isRemoved ? 'bg-red-500/10' : ''}`}>
                              {row.isNew && (
                                <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">NEW</span>
                              )}
                              {row.isRemoved && (
                                <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">DEL</span>
                              )}
                              <span className={`text-[11px] font-semibold ${row.isRemoved ? 'text-red-300/70 line-through' : 'text-foreground'}`}>{row.nodeName}</span>
                            </div>
                            {/* Property lines */}
                            {row.isNew ? (
                              <>
                                <div className="flex items-center gap-1 px-3 py-[2px] bg-emerald-900/20">
                                  <span className="w-4 shrink-0 select-none text-emerald-400">+</span>
                                  <span className="w-16 shrink-0 text-emerald-400/60">shape</span>
                                  <span className="text-emerald-300">{row.shapeNew || 'rectangle'}</span>
                                </div>
                                {row.colorNew && (
                                  <div className="flex items-center gap-1 px-3 py-[2px] bg-emerald-900/20">
                                    <span className="w-4 shrink-0 select-none text-emerald-400">+</span>
                                    <span className="w-16 shrink-0 text-emerald-400/60">color</span>
                                    <span className="text-emerald-300">{row.colorNew}</span>
                                  </div>
                                )}
                              </>
                            ) : row.isRemoved ? (
                              <>
                                <div className="flex items-center gap-1 px-3 py-[2px] bg-red-900/20">
                                  <span className="w-4 shrink-0 select-none text-red-400">-</span>
                                  <span className="w-16 shrink-0 text-red-400/60">shape</span>
                                  <span className="text-red-400/70 line-through">{row.shapeOld || 'rectangle'}</span>
                                </div>
                                <div className="flex items-center gap-1 px-3 py-[2px] bg-red-900/20">
                                  <span className="w-4 shrink-0 select-none text-red-400">-</span>
                                  <span className="w-16 shrink-0 text-red-400/60">removed</span>
                                  <span className="text-red-400/70 line-through">entire node</span>
                                </div>
                              </>
                            ) : (
                              <>
                                {row.shapeChanged ? (
                                  <>
                                    <div className="flex items-center gap-1 px-3 py-[2px] bg-red-900/20">
                                      <span className="w-4 shrink-0 select-none text-red-400">-</span>
                                      <span className="w-16 shrink-0 text-red-400/60">shape</span>
                                      <span className="text-red-400/70 line-through">{row.shapeOld}</span>
                                    </div>
                                    <div className="flex items-center gap-1 px-3 py-[2px] bg-emerald-900/20">
                                      <span className="w-4 shrink-0 select-none text-emerald-400">+</span>
                                      <span className="w-16 shrink-0 text-emerald-400/60">shape</span>
                                      <span className="text-emerald-300">{row.shapeNew}</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-1 px-3 py-[2px]">
                                    <span className="w-4 shrink-0 select-none text-gray-600"> </span>
                                    <span className="w-16 shrink-0 text-gray-500">shape</span>
                                    <span className="text-gray-300">{row.shapeOld}</span>
                                  </div>
                                )}
                                {row.colorChanged ? (
                                  <>
                                    <div className="flex items-center gap-1 px-3 py-[2px] bg-red-900/20">
                                      <span className="w-4 shrink-0 select-none text-red-400">-</span>
                                      <span className="w-16 shrink-0 text-red-400/60">color</span>
                                      <span className="text-red-400/70 line-through">{row.colorOld}</span>
                                    </div>
                                    <div className="flex items-center gap-1 px-3 py-[2px] bg-emerald-900/20">
                                      <span className="w-4 shrink-0 select-none text-emerald-400">+</span>
                                      <span className="w-16 shrink-0 text-emerald-400/60">color</span>
                                      <span className="text-emerald-300">{row.colorNew}</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-1 px-3 py-[2px]">
                                    <span className="w-4 shrink-0 select-none text-gray-600"> </span>
                                    <span className="w-16 shrink-0 text-gray-500">color</span>
                                    <span className="text-gray-300">{row.colorOld}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Edge diff */}
                    {(diff.addedEdges.length > 0 || diff.removedEdges.length > 0) && (
                      <div className="rounded-lg border border-border/40 overflow-hidden text-[10px] font-mono leading-relaxed">
                        <div className="px-3 py-1.5 bg-muted border-b border-border/30">
                          <span className="text-[11px] font-semibold text-foreground">Connections</span>
                        </div>
                        <div className="divide-y divide-border/10">
                          {diff.addedEdges.map((e, i) => (
                            <div key={`add-${i}`} className="flex items-center gap-1 px-3 py-[2px] bg-emerald-500/10">
                              <span className="w-4 shrink-0 select-none text-emerald-400">+</span>
                              <span className="text-emerald-600 dark:text-emerald-400">{e}</span>
                            </div>
                          ))}
                          {diff.removedEdges.map((e, i) => (
                            <div key={`rem-${i}`} className="flex items-center gap-1 px-3 py-[2px] bg-red-500/10">
                              <span className="w-4 shrink-0 select-none text-red-400">-</span>
                              <span className="text-red-400/70 line-through">{e}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {diff.rows.filter(r => r.isRemoved).length === 0 && diff.addedEdges.length === 0 && diff.removedEdges.length === 0 && diff.rows.every(r => !r.isNew) && (
                      <p className="text-[9px] text-muted-foreground/50 leading-relaxed">No changes detected — all symbols are identical.</p>
                    )}
                  </div>
                )}
              </div>
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
            disabled={!mode || confirming || !hasNodes || (mode === 'update' && !updateUid)}
            onClick={async () => {
              if (!mode) return;
              setConfirming(true);
              try {
                if (mode === 'create') {
                  await handleCreate();
                } else if (mode === 'update' && updateUid) {
                  await handleUpdate(updateUid);
                }
              } finally {
                setConfirming(false);
              }
            }}
          >
            {confirming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GitBranch className="size-3.5" />
            )}
            {mode === 'create' ? 'Create Flowchart' : 'Update Flowchart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
