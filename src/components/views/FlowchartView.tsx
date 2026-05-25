import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Undo2, Redo2 } from 'lucide-react';

import FlowchartNode, { FlowchartNodeData } from '../FlowchartNode';
import { initialNodes, initialEdges } from '../flowchart/flowchartConstants';
import { Flowchart } from '@/types';
import { AddSymbolModal } from '../flowchart/AddSymbolModal';
import { SymbolPropertiesModal } from '../flowchart/SymbolPropertiesModal';
import { ConnectorPropertiesModal } from '../flowchart/ConnectorPropertiesModal';
import { JumpToNode } from '../JumpToNode';
import { useAIAction } from '@/contexts/AIActionContext';
import { toast } from 'sonner';
import { applyToFlowchartContent, previewFlowchartContent, applyInsertBetween, applyReplaceAll, clearParseCache, FlowchartApplyResult } from '@/components/ai/actions/flowchartActions';
import { FlowchartPreviewModal } from '@/components/flowchart/FlowchartPreviewModal';
import { useUndoRedo } from '@/hooks/useUndoRedo';

const nodeTypes = {
  custom: FlowchartNode,
};

interface FlowchartViewProps {
  activeFlowchartId: number | string | null;
  activeFlowchart: Flowchart;
  handleFlowchartChange: (nodes: any[], edges: any[]) => void;
  isReadOnly?: boolean;
  isLoading?: boolean;
}

export const FlowchartView = React.memo(({ 
  activeFlowchartId, 
  activeFlowchart, 
  handleFlowchartChange, 
  isReadOnly = false,
  isLoading = false 
}: FlowchartViewProps) => {
  // ── Hooks FIRST (before any conditional return — Rule of Hooks) ──
  const { registerContentHandler, setActionContextData } = useAIAction();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowchartNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<FlowchartApplyResult | null>(null);
  const [newNodeData, setNewNodeData] = useState<FlowchartNodeData>({
    label: 'New Symbol',
    shape: 'rectangle',
    color: '#8b5cf6',
  });
  const initialLoadRef = React.useRef(true);
  const isParsingFromDataRef = React.useRef(false);
  const isDraggingRef = React.useRef(false);
  const lastFlowchartIdRef = React.useRef(activeFlowchartId);
  const isEditingEdgeRef = React.useRef(false);
  const isEditingNodeRef = React.useRef(false);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo();
  const pendingApplyModeRef = React.useRef<'append' | 'insert' | 'replace'>('append');

  const handleUndo = useCallback(() => {
    const previousState = undo(nodesRef.current, edgesRef.current);
    if (previousState) {
      setNodes(previousState.nodes);
      setEdges(previousState.edges);
    }
  }, [undo, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    const nextState = redo(nodesRef.current, edgesRef.current);
    if (nextState) {
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
    }
  }, [redo, setNodes, setEdges]);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const parseFlowchartData = (raw: any) => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  // ── Derived (guaranteed stable number of hooks) ──
  const showLoader = isLoading && (!activeFlowchart || !activeFlowchart.data);

  // Initialize from db or use defaults
  // Depend on activeFlowchain.data instead of just id,
  // because data arrives async after selectFlowchart completes
  useEffect(() => {
    isParsingFromDataRef.current = true;
    initialLoadRef.current = true;
    try {
      const parsed = parseFlowchartData(activeFlowchart.data) || { nodes: [], edges: [] };
      const nodesData = (parsed.nodes && parsed.nodes.length > 0) ? parsed.nodes : initialNodes;
      const edgesData = (parsed.edges && parsed.edges.length > 0) ? parsed.edges : initialEdges;
      
      setNodes(nodesData);
      setEdges(edgesData);

      // Only reset selection when switching to a different flowchart, not on data refresh (auto-save cycle)
      const flowchartChanged = lastFlowchartIdRef.current !== activeFlowchartId;
      if (flowchartChanged) {
        lastFlowchartIdRef.current = activeFlowchartId;
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    } catch {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }

    // Reset flag setelah render cycle selesai — ini biar auto-save trigger
    // effect bisa detek bahwa perubahan nodes/edges berasal dari parsing data,
    // bukan dari user edit.
    const timer = setTimeout(() => {
      isParsingFromDataRef.current = false;
      initialLoadRef.current = false;
    }, 2000);
    return () => {
      clearTimeout(timer);
      isParsingFromDataRef.current = false;
    };
  }, [activeFlowchartId, activeFlowchart.data]); // ← re-run when data loads asynchronously

  const handleFlowchartChangeRef = React.useRef(handleFlowchartChange);
  useEffect(() => {
    handleFlowchartChangeRef.current = handleFlowchartChange;
  }, [handleFlowchartChange]);

  // Trigger autosave internally when local state changes (skip initial load, data parsing, and dragging)
  useEffect(() => {
    if (initialLoadRef.current || isParsingFromDataRef.current || isDraggingRef.current || isEditingEdgeRef.current || isEditingNodeRef.current) {
      return;
    }
    if (nodes.length > 0 || edges.length > 0) {
      handleFlowchartChangeRef.current(nodes, edges);
    }
  }, [nodes, edges]);

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(() => {
    isDraggingRef.current = false;
    if (nodesRef.current.length > 0 || edgesRef.current.length > 0) {
      handleFlowchartChangeRef.current(nodesRef.current, edgesRef.current);
    }
  }, []);

  const defaultEdgeOptions = useMemo(() => ({
    type: 'smoothstep' as const,
    reconnectable: true,
    style: { stroke: '#b1b1b7' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
  }), []);

  const onConnect = useCallback(
    (params: Connection) => {
      takeSnapshot(nodesRef.current, edgesRef.current);
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        style: { stroke: '#b1b1b7' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
        animated: false,
      } as Edge, eds));
    },
    [setEdges, takeSnapshot],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((eds) => eds.map((e) => e.id === oldEdge.id
        ? { ...e, source: newConnection.source, target: newConnection.target, sourceHandle: newConnection.sourceHandle, targetHandle: newConnection.targetHandle }
        : e
      ));
      takeSnapshot(nodesRef.current, edgesRef.current);
    },
    [setEdges, takeSnapshot],
  );

  const confirmAddSymbol = () => {
    takeSnapshot(nodesRef.current, edgesRef.current);
    const id = Math.random().toString(36).substr(2, 9);
    const data = { ...newNodeData };
    // Auto-generate groupId for Start nodes
    if (data.label.trim().toLowerCase() === 'start' && !data.groupId) {
      data.groupId = `grp_${Math.random().toString(36).substr(2, 6)}`;
    }
    const newNode: Node<FlowchartNodeData> = {
      id,
      type: 'custom',
      position: { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 100 },
      data,
    };
    setNodes((nds) => nds.concat(newNode));
    setIsAddingNode(false);
  };

  const updateNodeData = (updates: Partial<FlowchartNodeData>) => {
    if (!selectedNodeId) return;

    // Prevent duplicate group titles across different Start nodes
    if ('section' in updates) {
      const newSection = updates.section?.trim();
      if (newSection) {
        const duplicate = nodes.some(n =>
          n.id !== selectedNodeId &&
          n.data.section?.toLowerCase() === newSection.toLowerCase()
        );
        if (duplicate) {
          toast.error('Group title already exists', {
            description: `Another group is already named "${newSection}". Each group must have a unique title.`,
          });
          return;
        }
      }
    }

    takeSnapshot(nodesRef.current, edgesRef.current);
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNodeId) {
          return { ...n, data: { ...n.data, ...updates } };
        }
        return n;
      })
    );
  };

  const updateEdgeData = (updates: Partial<Edge>) => {
    if (!selectedEdgeId) return;
    takeSnapshot(nodesRef.current, edgesRef.current);
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id === selectedEdgeId) {
          return { ...e, ...updates };
        }
        return e;
      })
    );
  };

  const deleteNode = () => {
    if (!selectedNodeId) return;
    takeSnapshot(nodesRef.current, edgesRef.current);
    const targetIds = [selectedNodeId];
    setNodes((nds) => nds.filter(n => !targetIds.includes(n.id)));
    setEdges((eds) => eds.filter(e => !targetIds.includes(e.source) && !targetIds.includes(e.target)));
    setSelectedNodeId(null);
  };

  const deleteGroup = () => {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node || !node.data.section) return;
    takeSnapshot(nodesRef.current, edgesRef.current);
    const section = node.data.section;

    // Find all Start nodes with this section title
    const startIds = nodes.filter(n => n.data.section === section).map(n => n.id);
    if (startIds.length === 0) return;

    // BFS to collect all descendants reachable from any Start node
    const connectedIds = new Set<string>(startIds);
    const queue = [...startIds];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const edge of edges) {
        if (edge.source === currentId && !connectedIds.has(edge.target)) {
          connectedIds.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    const idsToDelete = [...connectedIds];
    setNodes((nds) => nds.filter(n => !idsToDelete.includes(n.id)));
    setEdges((eds) => eds.filter(e => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)));
    setSelectedNodeId(null);
  };

  const deleteEdge = () => {
    if (!selectedEdgeId) return;
    takeSnapshot(nodesRef.current, edgesRef.current);
    setEdges((eds) => eds.filter(e => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  };

  // Track modal editing state to prevent auto-save while a property dialog is open
  const prevSelectedEdgeIdRef = React.useRef(selectedEdgeId);
  const prevSelectedNodeIdRef = React.useRef(selectedNodeId);
  useEffect(() => {
    isEditingEdgeRef.current = selectedEdgeId !== null;
    isEditingNodeRef.current = selectedNodeId !== null;

    // Flush pending save when any editor modal closes
    const edgeClosed = prevSelectedEdgeIdRef.current !== null && selectedEdgeId === null;
    const nodeClosed = prevSelectedNodeIdRef.current !== null && selectedNodeId === null;
    prevSelectedEdgeIdRef.current = selectedEdgeId;
    prevSelectedNodeIdRef.current = selectedNodeId;

    if ((edgeClosed || nodeClosed) && !initialLoadRef.current && !isParsingFromDataRef.current) {
      if (nodes.length > 0 || edges.length > 0) {
        handleFlowchartChangeRef.current(nodes, edges);
      }
    }
  }, [selectedEdgeId, selectedNodeId]); // Intentionally omit nodes/edges — closure captures latest values on modal close

  // Keyboard shortcut: Delete/Backspace to remove selected node or edge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isReadOnly) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) { deleteNode(); return; }
        if (selectedEdgeId) { deleteEdge(); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdgeId, isReadOnly]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  // Derived Edge Properties
  const isDashed = selectedEdge?.animated === true || selectedEdge?.style?.strokeDasharray === '5,5';
  
  let arrowType = 'end';
  if (selectedEdge?.markerStart && selectedEdge?.markerEnd) arrowType = 'both';
  else if (selectedEdge?.markerStart && !selectedEdge?.markerEnd) arrowType = 'start';
  else if (!selectedEdge?.markerStart && !selectedEdge?.markerEnd) arrowType = 'none';

  const handleEdgeTypeChange = (val: string) => {
    if (val === 'dashed') updateEdgeData({ animated: false, style: { ...selectedEdge?.style, strokeDasharray: '5,5' } });
    else updateEdgeData({ animated: false, style: { ...selectedEdge?.style, strokeDasharray: undefined } });
  };

  const handleArrowChange = (val: string) => {
    const color = (selectedEdge?.style?.stroke as string) || '#b1b1b7';
    const marker = { type: MarkerType.ArrowClosed, color };
    
    if (val === 'none') updateEdgeData({ markerStart: undefined, markerEnd: undefined });
    else if (val === 'start') updateEdgeData({ markerStart: marker, markerEnd: undefined });
    else if (val === 'end') updateEdgeData({ markerStart: undefined, markerEnd: marker });
    else if (val === 'both') updateEdgeData({ markerStart: marker, markerEnd: marker });
  };

  const handleEdgeLabelChange = (val: string) => {
    if (val.trim() === '') {
      updateEdgeData({ label: undefined });
    } else {
      updateEdgeData({ 
        label: val, 
        labelBgStyle: { fill: '#1e1e24' }, 
        labelStyle: { fill: '#fff' } 
      });
    }
  };

  const memoizedNodes = useMemo(() => {
    return nodes.map((n) => {
      const selected = n.id === selectedNodeId;
      if (n.selected === selected) return n;
      return { ...n, selected };
    });
  }, [nodes, selectedNodeId]);

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      const dataChanges = changes.filter((change: any) => change.type !== 'select');
      if (dataChanges.length === 0) return;
      onNodesChange(dataChanges);
    },
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      const dataChanges = changes.filter((change: any) => change.type !== 'select');
      if (dataChanges.length === 0) return;
      onEdgesChange(dataChanges);
    },
    [onEdgesChange],
  );

  // Sync AI action context (for ChatInput dropdown actions)
  // NOTE: skip during drag — prevents cascading re-render on every drag frame
  useEffect(() => {
    if (isDraggingRef.current) return;
    setActionContextData({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
  }, [nodes, edges, setActionContextData]);

  // AI Content Handler (show preview before applying)
  const pendingContentRef = React.useRef<string | null>(null);
  const pendingActionIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const unregister = registerContentHandler((content, strategy, actionId) => {
      try {
        pendingActionIdRef.current = actionId || null;

        // Insert — show preview (ignores strategy)
        if (actionId === 'flowchart-insert') {
          const result = applyInsertBetween(nodesRef.current, edgesRef.current, content);
          if (result && result.nodes.length > 0) {
            pendingContentRef.current = content;
            pendingApplyModeRef.current = 'insert';
            setPendingPreview(result);
            return;
          }
        }

        // Import — show preview in replace mode (ignores strategy)
        if (actionId === 'flowchart-import') {
          const preview = previewFlowchartContent(content);
          if (preview && preview.nodes.length > 0) {
            pendingContentRef.current = content;
            pendingApplyModeRef.current = 'replace';
            setPendingPreview(preview);
            return;
          }
        }

        // Append — preview with append mode
        if (strategy === 'append') {
          const preview = previewFlowchartContent(content);
          if (preview && preview.nodes.length > 0) {
            pendingContentRef.current = content;
            pendingApplyModeRef.current = 'append';
            setPendingPreview(preview);
            return;
          }
        }

        // Replace — preview with replace mode (generic, no actionId)
        if (strategy === 'replace') {
          const preview = previewFlowchartContent(content);
          if (preview && preview.nodes.length > 0) {
            pendingContentRef.current = content;
            pendingApplyModeRef.current = 'replace';
            setPendingPreview(preview);
            return;
          }
        }

        // Parsing failed (nodes empty or exceeded limits)
        if (!pendingContentRef.current) {
          toast.error('Could not parse flowchart data. The response may be too large or in an unsupported format.');
        }
      } catch (err) {
        console.error('Flowchart content handler error:', err);
        toast.error('Failed to apply AI content to flowchart');
      }
    }, ['append', 'replace']);

    return unregister;
  }, [registerContentHandler, setNodes, setEdges, takeSnapshot]);

  const handleConfirmAppend = useCallback((replaceGroupSection?: string) => {
    const content = pendingContentRef.current;
    if (!content) return;

    takeSnapshot(nodesRef.current, edgesRef.current);

    if (replaceGroupSection) {
      // Replace only the specified group
      const startIds = nodesRef.current.filter(n => n.data.section === replaceGroupSection).map(n => n.id);
      const connectedIds = new Set<string>(startIds);
      const queue = [...startIds];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        for (const edge of edgesRef.current) {
          if (edge.source === currentId && !connectedIds.has(edge.target)) {
            connectedIds.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      const idsToRemove = [...connectedIds];
      setNodes((nds) => {
        const kept = nds.filter(n => !idsToRemove.includes(n.id));
        const parsed = applyReplaceAll(content);
        if (parsed) return [...kept, ...parsed.nodes];
        return nds;
      });
      setEdges((eds) => {
        const kept = eds.filter(e => !idsToRemove.includes(e.source) && !idsToRemove.includes(e.target));
        const parsed = applyReplaceAll(content);
        if (parsed) return [...kept, ...parsed.edges];
        return eds;
      });
    } else if (pendingApplyModeRef.current === 'replace') {
      const result = applyReplaceAll(content);
      if (result) {
        setNodes(result.nodes);
        setEdges(result.edges);
      }
    } else if (pendingApplyModeRef.current === 'insert') {
      const result = applyInsertBetween(nodesRef.current, edgesRef.current, content);
      if (result) {
        setNodes(result.nodes);
        setEdges(result.edges);
      }
    } else {
      const result = applyToFlowchartContent(nodesRef.current, edgesRef.current, content);
      if (result) {
        setNodes(result.nodes);
        setEdges(result.edges);
      }
    }
    setPendingPreview(null);
    pendingContentRef.current = null;
    clearParseCache();
  }, [setNodes, setEdges, takeSnapshot]);
  
  const memoizedEdges = useMemo(() => edges.map(e => {
    const isHovered = e.id === hoveredEdgeId;
    const isSelected = e.id === selectedEdgeId;

    // Preserve reference for non-active edges
    if (!isHovered && !isSelected) return e;

    const overrideMarker = (marker: any) => {
      if (!marker) return undefined;
      if (typeof marker === 'string') return marker;
      return { ...marker, color: '#ffffff', width: 14, height: 14 };
    };

    return {
      ...e,
      selected: isSelected,
      style: { ...e.style, stroke: '#ffffff', strokeWidth: 2.5, cursor: 'pointer', transition: 'stroke 0.2s, stroke-width 0.2s' },
      markerEnd: overrideMarker(e.markerEnd),
      markerStart: overrideMarker(e.markerStart),
    };
  }), [edges, hoveredEdgeId, selectedEdgeId]);

  // ── EARLY RETURN (setelah semua hooks) ──
  if (showLoader) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <Loader2 className="w-10 h-10 text-primary animate-spin opacity-50" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading flowchart...</p>
      </div>
    );
  }

  return (
    <Card className="w-full h-full border-0 rounded-none bg-muted/20 flex flex-col overflow-hidden relative">
      
      {/* Top Bar */}
      {!isReadOnly && (
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <JumpToNode nodes={nodes} label="Symbol" />
            <div className="w-px h-6 bg-border mx-0.5" />
            <Button onClick={() => setIsAddingNode(true)} size="sm" className="h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Symbol</span>
            </Button>
            <div className="w-px h-6 bg-border mx-0.5" />
            <Button onClick={handleUndo} disabled={!canUndo} size="sm" variant="ghost" className="h-9 w-9 p-0 cursor-pointer" title="Undo">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button onClick={handleRedo} disabled={!canRedo} size="sm" variant="ghost" className="h-9 w-9 p-0 cursor-pointer" title="Redo">
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={memoizedNodes}
          edges={memoizedEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          onNodeClick={(e, node) => setSelectedNodeId(node.id)}
          onEdgeClick={(e, edge) => setSelectedEdgeId(edge.id)}
          onEdgeMouseEnter={(e, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
          fitView
          colorMode="dark"
          onlyRenderVisibleElements={true}
          nodesDraggable={!isReadOnly}
          nodesConnectable={!isReadOnly}
          elementsSelectable={!isReadOnly}
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Controls className="bg-background/95 border-border shadow-md" showInteractive={!isReadOnly} />
          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
        </ReactFlow>
      </div>

      {!isReadOnly && (
        <>
          <AddSymbolModal 
            isOpen={isAddingNode}
            onOpenChange={setIsAddingNode}
            nodeData={newNodeData}
            onNodeDataChange={setNewNodeData}
            onConfirm={confirmAddSymbol}
          />

          <SymbolPropertiesModal
            selectedNodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            selectedNode={selectedNode}
            onUpdateNodeData={updateNodeData}
            onDeleteNode={deleteNode}
            onDeleteGroup={deleteGroup}
          />

          <ConnectorPropertiesModal
            selectedEdgeId={selectedEdgeId}
            onClose={() => setSelectedEdgeId(null)}
            selectedEdge={selectedEdge}
            isDashed={isDashed}
            arrowType={arrowType}
            onEdgeTypeChange={handleEdgeTypeChange}
            onArrowChange={handleArrowChange}
            onLabelChange={handleEdgeLabelChange}
            onDeleteEdge={deleteEdge}
          />
        </>
      )}

      {pendingPreview && (
        <FlowchartPreviewModal
          nodes={pendingPreview.nodes}
          edges={pendingPreview.edges}
          onConfirm={handleConfirmAppend}
          onCancel={() => { setPendingPreview(null); pendingContentRef.current = null; }}
          confirmLabel={pendingApplyModeRef.current === 'insert' ? 'Confirm Insert' : pendingApplyModeRef.current === 'replace' ? 'Confirm Replace' : 'Confirm Append'}
          canvasGroups={pendingApplyModeRef.current === 'replace' ? nodes.map(n => n.data.section).filter((s): s is string => !!s).filter((s, i, arr) => arr.indexOf(s) === i) : []}
        />
      )}
    </Card>
  );
});
