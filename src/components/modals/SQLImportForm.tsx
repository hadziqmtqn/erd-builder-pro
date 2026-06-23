import React, { useState, useRef } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { parseSQLToERD } from '@/lib/sqlParser';
import { FileCode, Upload, AlertCircle, Loader2, Plus, ArrowRight, ArrowUpDown } from 'lucide-react';
import { DraftType } from '@/types';
import { BroadcastMessageType } from '@/hooks/useBroadcastChannel';
import type { Node, Edge } from '@xyflow/react';
import type { Entity, Column } from '@/types';

interface ColumnChange {
  type: 'add' | 'modify';
  column: Column;
  existing?: Column;
}

interface TableChange {
  tableName: string;
  existingNode: Node<Entity>;
  columnChanges: ColumnChange[];
}

export interface SQLImportFormProps {
  nodes?: any[];
  edges?: any[];
  setNodes?: (nodes: any[]) => void;
  setEdges?: (edges: any[]) => void;
  activeDiagramId?: number | string | null;
  takeSnapshot?: (nodes: any[], edges: any[]) => void;
  saveDiagram?: (nodes: any[], edges: any[], viewport: any) => Promise<void>;
  triggerDebouncedSync?: () => void;
  broadcastMessage?: (type: BroadcastMessageType, draftType: DraftType, id: number | string) => void;
  setIsLocalSaving?: (loading: boolean) => void;
  viewportRef?: { current: any };
  lastLoadedDiagramIdRef?: { current: number | string | null };
  onComplete?: () => void;
}

export function SQLImportForm({
  nodes,
  edges,
  setNodes,
  setEdges,
  activeDiagramId,
  takeSnapshot,
  saveDiagram,
  triggerDebouncedSync,
  broadcastMessage,
  setIsLocalSaving,
  viewportRef,
  lastLoadedDiagramIdRef,
  onComplete,
}: SQLImportFormProps) {
  const [sql, setSql] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme } = useWorkspace();

  const [step, setStep] = useState<'input' | 'review'>('input');
  const [tableChanges, setTableChanges] = useState<TableChange[]>([]);
  const [parsedResult, setParsedResult] = useState<{ nodes: Node<Entity>[]; edges: Edge[]; allParsedNodes: Node<Entity>[] } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.sql')) {
      setError("Invalid file format. Please upload a .sql file.");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSql(content);
      toast.success(`Successfully loaded ${file.name}`);
    };
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  function computeDiff(existingCols: Column[], parsedCols: Column[]): ColumnChange[] {
    const changes: ColumnChange[] = [];

    for (const parsedCol of parsedCols) {
      const match = existingCols.find(
        c => c.name.toLowerCase() === parsedCol.name.toLowerCase()
      );

      if (!match) {
        changes.push({ type: 'add', column: { ...parsedCol } });
      } else if (
        match.type !== parsedCol.type ||
        match.is_pk !== parsedCol.is_pk ||
        match.is_nullable !== parsedCol.is_nullable
      ) {
        changes.push({ type: 'modify', column: { ...parsedCol }, existing: { ...match } });
      }
    }

    return changes;
  }

  function getExistingNodeByName(name: string): Node<Entity> | undefined {
    return (nodes as Node<Entity>[] | undefined)?.find(
      n => n.data.name.toLowerCase() === name.toLowerCase()
    );
  }

  const handleParse = () => {
    if (!sql.trim()) return;

    setIsImporting(true);
    setError(null);

    setTimeout(() => {
      try {
        const result = parseSQLToERD(sql);
        if (result.nodes.length === 0) {
          const hasAlter = /ALTER\s+TABLE\s+/i.test(sql);
          if (hasAlter) {
            toast.error("ALTER TABLE requires an existing table in the diagram. Only CREATE TABLE can create new tables.");
          } else {
            toast.error("No valid CREATE TABLE statements found.");
          }
          setIsImporting(false);
          return;
        }

        if (nodes && nodes.length > 0) {
          const allResultNodes = result.nodes;
          const changes: TableChange[] = [];
          const uniqueNewNodes: Node<Entity>[] = [];

          for (const parsedNode of allResultNodes) {
            const existingNode = getExistingNodeByName(parsedNode.data.name);
            if (existingNode) {
              const columnChanges = computeDiff(
                existingNode.data.columns,
                parsedNode.data.columns
              );
              if (columnChanges.length > 0) {
                changes.push({
                  tableName: parsedNode.data.name,
                  existingNode,
                  columnChanges,
                });
              }
            } else {
              uniqueNewNodes.push(parsedNode);
            }
          }

          if (changes.length > 0) {
            setTableChanges(changes);
            setParsedResult({ nodes: uniqueNewNodes, edges: result.edges, allParsedNodes: allResultNodes });
            setStep('review');
            setIsImporting(false);
            return;
          }
        }

        applyImport(result.nodes, result.edges, undefined, result.nodes);
        setIsImporting(false);
      } catch (err) {
        console.error(err);
        setError("Failed to parse SQL. Check your syntax.");
        setIsImporting(false);
      }
    }, 100);
  };

  function applyImport(
    newNodes: Node<Entity>[],
    newEdges: Edge[],
    existingChanges?: TableChange[],
    allParsedNodes?: Node<Entity>[]
  ) {
    if (nodes && edges && setNodes && setEdges && takeSnapshot) {
      takeSnapshot(nodes, edges);

      let updatedNodes = [...nodes];
      const updatedEdges = [...edges];

      const idMapping: Record<string, string> = {};

      if (existingChanges) {
        for (const change of existingChanges) {
          idMapping[change.existingNode.id] = change.existingNode.id;

          const idx = updatedNodes.findIndex(
            n => n.id === change.existingNode.id
          );
          if (idx === -1) continue;

          const node = { ...updatedNodes[idx] };
          const mergedCols = [...node.data.columns];

          for (const colChange of change.columnChanges) {
            if (colChange.type === 'add') {
              mergedCols.push({
                ...colChange.column,
                id: `col-${Math.random().toString(36).substring(2, 11)}`,
                sort_order: mergedCols.length,
              });
            } else if (colChange.type === 'modify') {
              const colIdx = mergedCols.findIndex(
                c => c.name.toLowerCase() === colChange.column.name.toLowerCase()
              );
              if (colIdx !== -1) {
                mergedCols[colIdx] = {
                  ...mergedCols[colIdx],
                  type: colChange.column.type,
                  is_pk: colChange.column.is_pk,
                  is_nullable: colChange.column.is_nullable,
                };
              }
            }
          }

          updatedNodes[idx] = {
            ...node,
            data: { ...node.data, columns: mergedCols },
          };
        }
      }

      const existingNames = updatedNodes.map(n => n.data.name.toLowerCase());

      if (allParsedNodes) {
        for (const parsedNode of allParsedNodes) {
          const match = updatedNodes.find(
            n => n.data.name.toLowerCase() === parsedNode.data.name.toLowerCase()
          );
          if (match) {
            idMapping[parsedNode.id] = match.id;
          }
        }
      }

      for (const newNode of newNodes) {
        let name = newNode.data.name;
        let counter = 1;
        while (existingNames.includes(name.toLowerCase())) {
          name = `${newNode.data.name}_imported_${counter}`;
          counter++;
        }
        if (name !== newNode.data.name) {
          newNode.data.name = name;
        }
        const newId = `node-${Math.random().toString(36).substring(2, 11)}`;
        idMapping[newNode.id] = newId;
        newNode.id = newId;
        newNode.data.id = newId;
        updatedNodes.push(newNode);
      }

      for (const edge of newEdges) {
        const sourceId = idMapping[edge.source] || edge.source;
        const targetId = idMapping[edge.target] || edge.target;
        updatedEdges.push({
          ...edge,
          id: `e-${Math.random().toString(36).substring(2, 11)}`,
          source: sourceId,
          target: targetId,
        });
      }

      setNodes(updatedNodes);
      setEdges(updatedEdges);

      if (activeDiagramId && saveDiagram && triggerDebouncedSync && broadcastMessage && setIsLocalSaving && viewportRef && lastLoadedDiagramIdRef) {
        lastLoadedDiagramIdRef.current = activeDiagramId;
        setIsLocalSaving(true);
        saveDiagram(updatedNodes, updatedEdges, viewportRef.current).then(() => {
          setIsLocalSaving(false);
          triggerDebouncedSync();
          broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.ERD, activeDiagramId);
        });
      }

      const updatedCount = existingChanges?.length || 0;
      const newCount = newNodes.length;
      const parts: string[] = [];
      if (updatedCount > 0) parts.push(`${updatedCount} table(s) updated`);
      if (newCount > 0) parts.push(`${newCount} table(s) added`);
      toast.success(`Success! ${parts.join(', ')}.`);
    }

    setSql('');
    setError(null);
    setStep('input');
    setTableChanges([]);
    setParsedResult(null);
    onComplete?.();
  }

  const handleApplyChanges = () => {
    if (!parsedResult) return;
    applyImport(parsedResult.nodes, parsedResult.edges, tableChanges, parsedResult.allParsedNodes);
  };

  const handleCancelReview = () => {
    setStep('input');
    setTableChanges([]);
    setParsedResult(null);
    setIsImporting(false);
  };

  const resetState = () => {
    setStep('input');
    setTableChanges([]);
    setParsedResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".sql"
        onChange={handleFileChange}
      />

      {step === 'input' ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SQL Schema Editor</label>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-bold border-dashed border-primary/50 hover:border-primary hover:bg-primary/5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3 h-3 mr-2" />
                Upload .sql File
              </Button>
            </div>

            <CodeMirror
              value={sql}
              height="280px"
              theme={resolvedTheme === 'dark' ? oneDark : undefined}
              extensions={[sqlLang()]}
              placeholder="CREATE TABLE users (&#10;  id SERIAL PRIMARY KEY,&#10;  email VARCHAR(255) NOT NULL&#10;);"
              className="border border-border/50 rounded-lg overflow-hidden text-xs"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: false,
                bracketMatching: true,
                closeBrackets: true,
                indentOnInput: true,
              }}
              onChange={(value) => {
                setSql(value);
                if (error) setError(null);
              }}
            />

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground italic bg-muted/30 p-2 rounded-md border border-border/50">
            * Supports PostgreSQL and MySQL syntax. Ensure each statement ends with a semicolon (;).
          </p>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleParse}
              disabled={!sql.trim() || isImporting}
              className="font-bold min-w-[120px]"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <FileCode className="w-4 h-4 mr-2" />
                  Import SQL
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-4 max-h-[340px] overflow-y-auto custom-scrollbar">
            {tableChanges.map((change, idx) => (
              <div key={idx} className="bg-muted/20 border border-border/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="size-2 rounded-full bg-amber-500" />
                  <span className="text-xs font-semibold">{change.tableName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    — {change.columnChanges.length} column change(s)
                  </span>
                </div>

                <div className="space-y-1.5">
                  {change.columnChanges.map((colChange, ci) => (
                    <div key={ci} className="flex items-start gap-2.5 text-xs bg-background/60 rounded-md px-3 py-2 border border-border/30">
                      {colChange.type === 'add' ? (
                        <Plus className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <ArrowUpDown className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{colChange.column.name}</div>
                        {colChange.type === 'add' ? (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {colChange.column.type}{colChange.column.is_nullable ? ' NULL' : ' NOT NULL'}{colChange.column.is_pk ? ' PK' : ''}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                            <span className="line-through text-destructive/60">
                              {colChange.existing?.type}{colChange.existing?.is_nullable ? ' NULL' : ' NOT NULL'}{colChange.existing?.is_pk ? ' PK' : ''}
                            </span>
                            <ArrowRight className="size-3 text-muted-foreground/40" />
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {colChange.column.type}{colChange.column.is_nullable ? ' NULL' : ' NOT NULL'}{colChange.column.is_pk ? ' PK' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {parsedResult && parsedResult.nodes.length > 0 && (
              <div className="bg-muted/20 border border-border/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="size-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold">New Tables</span>
                  <span className="text-[10px] text-muted-foreground">
                    — {parsedResult.nodes.length} brand new table(s)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {parsedResult.nodes.map((n, ni) => (
                    <span key={ni} className="text-[11px] bg-background/60 border border-border/30 rounded-md px-2 py-1">
                      {n.data.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleCancelReview}>
              Cancel
            </Button>
            <Button onClick={handleApplyChanges} className="font-bold min-w-[120px]">
              <FileCode className="w-4 h-4 mr-2" />
              Apply Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
