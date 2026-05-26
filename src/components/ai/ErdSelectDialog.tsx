import { useState, useMemo, useEffect, memo } from 'react';
import {
  Dialog, DialogContent, DialogOverlay, DialogClose,
  DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  ReactFlow, Background, Controls, Handle, Position,
  NodeProps, Node, Edge, MarkerType, BackgroundVariant,
} from '@xyflow/react';
import { Entity } from '@/types';
import { parseSQLToERD } from '@/lib/sqlParser';
import { computeSchemaDiff, DiffResult } from '@/lib/schema-diff';
import { Button } from '@/components/ui/button';
import { Database, Plus, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DiagramItem {
  uid: string;
  name: string;
  project_id?: string | number | null;
}

interface ErdSelectDialogProps {
  open: boolean;
  sql: string;
  projectId: string | number | null;
  diagrams: DiagramItem[];
  onConfirm: (action: 'create' | 'update', diagramUid?: string) => void;
  onCancel: () => void;
  fetchEntitiesForDiff?: (diagramUid: string) => Promise<{ nodes: Node<Entity>[]; edges: Edge[] } | null>;
}

function getDiffBorderColor(diffState: string | undefined): string {
  if (diffState === 'new') return 'border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.15)]';
  if (diffState === 'modified') return 'border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.15)]';
  if (diffState === 'deleted') return 'border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.1)]';
  return 'border-border';
}

function getDiffBadge(diffState: string | undefined): { label: string; className: string } | null {
  if (diffState === 'new') return { label: 'NEW', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  if (diffState === 'modified') return { label: 'MOD', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  if (diffState === 'deleted') return { label: 'DEL', className: 'bg-red-500/15 text-red-400 border-red-500/30' };
  return null;
}

const ErdPreviewNode = memo(({ data }: NodeProps<Node<Entity>>) => {
  const colDiffState = (data as any).diffState as string | undefined;
  const badge = getDiffBadge(colDiffState);
  const borderColor = getDiffBorderColor(colDiffState);
  const isDeleted = colDiffState === 'deleted';

  return (
    <div className={`rounded-lg border-2 bg-card shadow-lg min-w-[200px] ${borderColor} ${isDeleted ? 'opacity-55' : ''}`}>
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-indigo-500/10 rounded-t-lg relative">
        {badge && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${badge.className} absolute -top-2 -right-2`}>
            {badge.label}
          </span>
        )}
        <Database className="size-3.5 text-indigo-400" />
        <span className="text-xs font-semibold text-foreground">{data.name}</span>
      </div>
      <div className="divide-y divide-border/30">
        {data.columns.map((col: any) => {
          const colDiff = col.diffState as string | undefined;
          const colDeleted = colDiff === 'deleted';
          const colNew = colDiff === 'new';
          return (
            <div key={col.id} className={`relative px-3 py-1.5 flex items-center justify-between text-[10px] group hover:bg-muted/30 ${colDeleted ? 'opacity-40' : ''}`}>
              <Handle
                type="target"
                position={Position.Left}
                id={`col-${col.id}-target`}
                className="!w-1.5 !h-1.5 !border-0 !bg-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ top: '50%', left: '-4px' }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`col-${col.id}-source`}
                className="!w-1.5 !h-1.5 !border-0 !bg-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ top: '50%', right: '-4px' }}
              />
              <div className="flex items-center gap-1.5 min-w-0">
                {colNew && <span className="text-[9px] text-emerald-400 shrink-0 font-bold">+</span>}
                {colDeleted && <span className="text-[9px] text-red-400 shrink-0 font-bold">−</span>}
                {col.is_pk && <span className="text-[8px] text-amber-400 shrink-0">🔑</span>}
                {col._is_fk && <span className="text-[8px] text-blue-400 shrink-0">🔗</span>}
                <span className={`font-medium text-foreground/80 truncate ${colDeleted ? 'line-through text-red-400/60' : ''}`}>
                  {col.name}
                </span>
              </div>
              <span className={`shrink-0 ml-2 ${colDeleted ? 'text-red-400/40 line-through' : 'text-muted-foreground'}`}>
                {col.type}
              </span>
            </div>
          );
        })}
        {data.columns.length === 0 && (
          <div className="px-3 py-2 text-[10px] text-muted-foreground/50 italic">No columns</div>
        )}
      </div>
    </div>
  );
});

const previewNodeTypes = { entity: ErdPreviewNode };

export function ErdSelectDialog({
  open, sql, projectId, diagrams, onConfirm, onCancel, fetchEntitiesForDiff,
}: ErdSelectDialogProps) {
  const [selectedAction, setSelectedAction] = useState<'create' | 'update'>('create');
  const [selectedDiagramUid, setSelectedDiagramUid] = useState<string | null>(null);
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [isFetchingExisting, setIsFetchingExisting] = useState(false);

  // Filter diagrams by project
  const eligibleDiagrams = useMemo(() => {
    return diagrams.filter(d => {
      if (projectId == null || projectId === 'none') {
        return d.project_id == null || d.project_id === 'none' || d.project_id === '';
      }
      return String(d.project_id) === String(projectId);
    });
  }, [diagrams, projectId]);

  // Parse SQL into nodes/edges for preview
  const preview = useMemo(() => {
    try {
      const result = parseSQLToERD(sql);
      if (result.nodes.length === 0) return null;
      const edges: Edge[] = result.edges.map(e => ({
        ...e,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.Arrow, width: 15, height: 15 },
      }));
      return { nodes: result.nodes, edges };
    } catch {
      return null;
    }
  }, [sql]);

  // Fetch existing diagram entities and compute diff when user selects an existing ERD
  useEffect(() => {
    if (selectedAction !== 'update' || !selectedDiagramUid || !preview || !fetchEntitiesForDiff) {
      setDiffResult(null);
      return;
    }

    let cancelled = false;
    setIsFetchingExisting(true);
    setDiffResult(null);

    fetchEntitiesForDiff(selectedDiagramUid)
      .then(existing => {
        if (cancelled || !existing) {
          setDiffResult(null);
          return;
        }
        const result = computeSchemaDiff(existing.nodes, existing.edges, preview.nodes, preview.edges);
        if (!cancelled) {
          setDiffResult(result);
        }
      })
      .catch(() => {
        if (!cancelled) setDiffResult(null);
      })
      .finally(() => {
        if (!cancelled) setIsFetchingExisting(false);
      });

    return () => { cancelled = true; };
  }, [selectedDiagramUid, selectedAction, preview?.nodes, preview?.edges, fetchEntitiesForDiff]);

  const handleConfirm = () => {
    if (selectedAction === 'update' && !selectedDiagramUid) {
      toast.error('Please select an ERD diagram to update');
      return;
    }
    onConfirm(selectedAction, selectedDiagramUid || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogOverlay />
      <DialogContent size="3xl" showCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Database className="size-4 text-indigo-400" />
            </div>
            <div>
              <DialogTitle>Create ERD from SQL</DialogTitle>
              <DialogDescription>
                Choose to create a new ERD or update an existing one
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4">
            {/* Target selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Target ERD</label>
              <select
                className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedAction === 'create' ? '__create__' : selectedDiagramUid || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__create__') {
                    setSelectedAction('create');
                    setSelectedDiagramUid(null);
                  } else {
                    setSelectedAction('update');
                    setSelectedDiagramUid(val);
                  }
                }}
              >
                <option value="__create__">
                  ✨ Create new ERD diagram
                </option>
                {eligibleDiagrams.length > 0 && (
                  <optgroup label="── Update existing ──">
                    {eligibleDiagrams.map(d => (
                      <option key={d.uid} value={d.uid}>{d.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* SQL text (collapsible) */}
            <div className="space-y-1.5">
              <button
                onClick={() => setSqlExpanded(!sqlExpanded)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={`size-3 transition-transform ${sqlExpanded ? '' : '-rotate-90'}`} />
                SQL Source
              </button>
              {sqlExpanded && (
                <pre className="text-[10px] leading-relaxed bg-[#0d1117] text-gray-300 rounded-lg p-3 overflow-x-auto max-h-[180px] overflow-y-auto custom-scrollbar border border-border/50 font-mono whitespace-pre-wrap break-all">
                  <code>{sql}</code>
                </pre>
              )}
            </div>

            {/* React Flow preview */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                {diffResult ? 'Schema Diff Preview' : 'Schema Preview'}
              </label>
              <div className="h-[320px] rounded-lg border border-border overflow-hidden bg-[#0f0f14] relative">

                {/* Diff summary banner */}
                {diffResult && (diffResult.newCount > 0 || diffResult.modifiedCount > 0 || diffResult.deletedCount > 0) && (
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-background/80 backdrop-blur-sm border border-border/60 text-[10px] font-medium shadow-sm">
                    {diffResult.newCount > 0 && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        {diffResult.newCount} New
                      </span>
                    )}
                    {diffResult.modifiedCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="size-1.5 rounded-full bg-amber-400" />
                        {diffResult.modifiedCount} Mod
                      </span>
                    )}
                    {diffResult.deletedCount > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <span className="size-1.5 rounded-full bg-red-400" />
                        {diffResult.deletedCount} Del
                      </span>
                    )}
                  </div>
                )}

                {/* Loading overlay */}
                {isFetchingExisting && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0f0f14]/70 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Fetching existing schema...
                    </div>
                  </div>
                )}

                {isFetchingExisting ? null : (preview ? (
                  <ReactFlow
                    nodes={diffResult ? diffResult.nodes : preview.nodes}
                    edges={diffResult ? diffResult.edges : preview.edges}
                    nodeTypes={previewNodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.3 }}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    colorMode="dark"
                    minZoom={0.2}
                    maxZoom={2}
                    defaultEdgeOptions={{
                      type: 'smoothstep',
                      markerEnd: { type: MarkerType.Arrow, width: 15, height: 15 },
                    }}
                  >
                    <Background variant={BackgroundVariant.Dots} gap={40} size={1} color="#333" />
                    <Controls position="bottom-right" showInteractive={false} />
                  </ReactFlow>
                ) : (
                  <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground/40">
                    No tables found in SQL
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button size="sm" onClick={handleConfirm}>
            {selectedAction === 'create' ? 'Create ERD' : 'Update ERD'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
