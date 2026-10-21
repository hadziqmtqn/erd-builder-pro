import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useEditorActive } from '@/contexts/FileSessionContext';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Undo2, Redo2, Move, LayoutGrid, Eraser } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { normalizeFlowchartCanvas } from '@/lib/flowchart-canvas';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFlowchartHistoryShortcuts } from '@/hooks/useFlowchartHistoryShortcuts';

import FlowchartNode, { FlowchartNodeData } from '../FlowchartNode';
import { initialNodes, initialEdges } from '../flowchart/flowchartConstants';
import { DEFAULT_FLOWCHART_COLOR } from '../flowchart/flowchartColors';
import { Flowchart } from '@/types';
import { AddSymbolModal } from '../flowchart/AddSymbolModal';
import { SymbolPropertiesModal } from '../flowchart/SymbolPropertiesModal';
import { ConnectorPropertiesModal } from '../flowchart/ConnectorPropertiesModal';
import { JumpToNode } from '../JumpToNode';
import { useAIAction } from '@/contexts/AIActionContext';
import { toast } from 'sonner';
import { previewFlowchartContent, applyInsertBetween, clearParseCache, FlowchartApplyResult } from '@/components/ai/actions/flowchartActions';
import { FlowchartPreviewModal } from '@/components/flowchart/FlowchartPreviewModal';
import { FlowchartExportModal } from '@/components/flowchart/FlowchartExportModal';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { autoLayoutFlowchart } from '@/lib/autoLayoutFlowchart';
import { isPendingFlowchartTarget, PENDING_FLOWCHART_EVENT, PENDING_FLOWCHART_TARGET } from '@/lib/pending-flowchart';
import { useWorkspace } from '@/providers/WorkspaceContext';
import type { FlowchartExportHandler } from '@/providers/WorkspaceContext';
import { PrepareCommentAnchor, type CommentAnchor } from '@/components/diagram/ERDComments';
import { storedHasAnchor } from '@/lib/fileComments';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const nodeTypes = {
  custom: FlowchartNode,
};

interface FlowchartViewProps {
  activeFlowchartId: number | string | null;
  activeFlowchart: Flowchart;
  handleFlowchartChange: (nodes: any[], edges: any[]) => void;
  isReadOnly?: boolean;
  isLoading?: boolean;
  saveFlowchart?: (flowchart: any) => Promise<any>;
  triggerDebouncedSync?: () => void;
  /** Embedded Notes workspace: keep editing tools, omit file-level integrations. */
  companionMode?: boolean;
  commentsEnabled?: boolean;
}

const FlowchartCanvas = React.memo(({
  activeFlowchartId, 
  activeFlowchart, 
  handleFlowchartChange, 
  isReadOnly = false,
  isLoading = false,
  saveFlowchart,
  triggerDebouncedSync,
  companionMode = false,
  commentsEnabled = false,
}: FlowchartViewProps) => {
  // ── Hooks FIRST (before any conditional return — Rule of Hooks) ──
  const { registerContentHandler, setActionContextData } = useAIAction();
  const editorActive = useEditorActive();
  const isMobile = useIsMobile();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowchartNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [isClearingCanvas, setIsClearingCanvas] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<FlowchartApplyResult | null>(null);
  const [exportPreview, setExportPreview] = useState<{ nodes: Node<FlowchartNodeData>[]; edges: Edge[]; filename: string } | null>(null);
  const [newNodeData, setNewNodeData] = useState<FlowchartNodeData>({
    label: 'New Symbol',
    shape: 'rectangle',
    color: DEFAULT_FLOWCHART_COLOR,
  });
  const initialLoadRef = React.useRef(true);
  const isParsingFromDataRef = React.useRef(false);
  const isDraggingRef = React.useRef(false);
  const pendingContentAppliedRef = React.useRef(false);
  const { fitView } = useReactFlow();
  const lastFlowchartIdRef = React.useRef(activeFlowchartId);
  const isEditingEdgeRef = React.useRef(false);
  const isEditingNodeRef = React.useRef(false);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const emptySetRef = React.useRef(new Set<string>());
  const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo();
  const pendingApplyModeRef = React.useRef<'append' | 'insert' | 'replace'>('append');

  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    const repositions = autoLayoutFlowchart(nodes, edges);
    takeSnapshot(nodesRef.current, edgesRef.current);
    setNodes(repositions.nodes);
    setEdges(repositions.edges);
    requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: 0.15 })));
  }, [nodes, edges, setNodes, setEdges, takeSnapshot, fitView]);
  const handleUndo = useCallback(() => {
    const previous = undo(nodesRef.current, edgesRef.current);
    if (!previous) return;
    setNodes(previous.nodes);
    setEdges(previous.edges);
  }, [undo, setNodes, setEdges]);
  const handleRedo = useCallback(() => {
    const next = redo(nodesRef.current, edgesRef.current);
    if (!next) return;
    setNodes(next.nodes);
    setEdges(next.edges);
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
  useFlowchartHistoryShortcuts(!isReadOnly && !showLoader && !isAddingNode && !isClearingCanvas && !selectedNodeId && !selectedEdgeId && !pendingPreview && !exportPreview, handleUndo, handleRedo);

  // Initialize from db or use defaults
  // Depend on activeFlowchain.data instead of just id,
  // because data arrives async after selectFlowchart completes
  useEffect(() => {
    if (activeFlowchart.data === JSON.stringify({ nodes: nodesRef.current, edges: edgesRef.current })) {
      initialLoadRef.current = false;
      isParsingFromDataRef.current = false;
      return;
    }
    isParsingFromDataRef.current = true;
    initialLoadRef.current = true;
    try {
      const parsed = parseFlowchartData(activeFlowchart.data) || { nodes: [], edges: [] };
      const hasPending = localStorage.getItem('pending_create_flowchart_json') || localStorage.getItem('pending_update_flowchart_json');
      const nodesData = Array.isArray(parsed.nodes) ? parsed.nodes : (hasPending || pendingContentAppliedRef.current ? [] : initialNodes);
      const edgesData = Array.isArray(parsed.edges) ? parsed.edges : (hasPending || pendingContentAppliedRef.current ? [] : initialEdges);
      
      if (!pendingContentAppliedRef.current) {
        const canvas = normalizeFlowchartCanvas(nodesData, edgesData);
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
      }

      // Only reset selection when switching to a different flowchart, not on data refresh (auto-save cycle)
      const flowchartChanged = lastFlowchartIdRef.current !== activeFlowchartId;
      if (flowchartChanged) {
        lastFlowchartIdRef.current = activeFlowchartId;
        pendingContentAppliedRef.current = false;
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    } catch {
      const hasPending = localStorage.getItem('pending_create_flowchart_json') || localStorage.getItem('pending_update_flowchart_json');
      if (!pendingContentAppliedRef.current) {
        setNodes(hasPending ? [] : initialNodes);
        setEdges(hasPending ? [] : initialEdges);
      }
    }

    // Reset flag setelah render cycle selesai — ini biar auto-save trigger
    // effect bisa detek bahwa perubahan nodes/edges berasal dari parsing data,
    // bukan dari user edit.
    const timer = setTimeout(() => {
      isParsingFromDataRef.current = false;
      initialLoadRef.current = false;
    }, 0);
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
    handleFlowchartChangeRef.current(nodes, edges);
  }, [nodes, edges]);

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    takeSnapshot(nodesRef.current, edgesRef.current);
  }, [takeSnapshot]);

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
    const id = Math.random().toString(36).substring(2, 11);
    const data = { ...newNodeData };
    // Auto-generate groupId for Start nodes
    if (data.label.trim().toLowerCase() === 'start' && !data.groupId) {
      data.groupId = `grp_${Math.random().toString(36).substring(2, 8)}`;
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

  const validateSection = useCallback((section: string): boolean => {
    const trimmed = section.trim();
    if (!trimmed) return true;
    const duplicate = nodes.some(n =>
      n.id !== selectedNodeId &&
      n.data.section?.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      toast.error('Group title already exists', {
        description: `Another group is already named "${trimmed}". Each group must have a unique title.`,
      });
      return false;
    }
    return true;
  }, [nodes, selectedNodeId]);

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
    const nextEdges = edgesRef.current.filter(e => e.id !== selectedEdgeId);
    setEdges(nextEdges);
    handleFlowchartChangeRef.current(nodesRef.current, nextEdges);
    setSelectedEdgeId(null);
  };

  const clearCanvas = () => {
    takeSnapshot(nodesRef.current, edgesRef.current);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedGroup(null);
    setNodes([]);
    setEdges([]);
    handleFlowchartChangeRef.current([], []);
    setIsClearingCanvas(false);
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
      handleFlowchartChangeRef.current(nodes, edges);
    }
  }, [selectedEdgeId, selectedNodeId]); // Intentionally omit nodes/edges — closure captures latest values on modal close

  // Keyboard shortcut: Delete/Backspace to remove selected node or edge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editorActive()) return;
      if (isReadOnly) return;
      const target = e.target as HTMLElement;
      // Skip if typing in input/textarea OR inside SearchableTypeSelect dropdown
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      // Check data-keyboard-trap on target itself (portal elements won't have ancestors)
      if (target.hasAttribute?.('data-keyboard-trap')) return;
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
        labelBgStyle: { fill: 'var(--popover)' }, 
        labelStyle: { fill: 'var(--popover-foreground)' } 
      });
    }
  };

  // ── SVG Export ──
  const { setFlowchartExportHandler, resolvedTheme, syncDrafts, hasPendingSyncs, isLocalSaving } = useWorkspace();
  const bgColor = resolvedTheme === 'dark' ? '#222' : '#ccc';

  // The server rejects a comment anchor it has not saved yet (symbols added moments ago, or a template nobody has saved),
  // so before a new thread starts, save the canvas and push it unless the server already has that symbol.
  const prepareAnchor = async (anchor: CommentAnchor) => {
    if (isReadOnly || !saveFlowchart || !nodesRef.current.some((node) => node.id === anchor.id)) return;
    if (storedHasAnchor(activeFlowchart.data, anchor) && !isLocalSaving && !hasPendingSyncs) return;
    await saveFlowchart({ ...activeFlowchart, data: JSON.stringify({ nodes: nodesRef.current, edges: edgesRef.current }) });
    await syncDrafts();
  };

  const getExportFilename = (suffix?: string) => {
    const base = activeFlowchart?.title?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'flowchart';
    return suffix ? `${base}-${suffix}` : base;
  };

  const handleExportSVGAll = useCallback(() => {
    const previewNodes = nodesRef.current;
    const previewEdges = edgesRef.current;
    if (previewNodes.length === 0) { toast.error('No nodes to export'); return; }
    setExportPreview({ nodes: previewNodes, edges: previewEdges, filename: getExportFilename() });
  }, []);

  const handleExportSVGGroup = useCallback((group: string) => {
    const groupNodeIds = new Set(
      nodesRef.current.filter(n => n.data.section === group).map(n => n.id)
    );
    if (groupNodeIds.size === 0) { toast.error(`No nodes found in group "${group}"`); return; }

    const startIds = [...groupNodeIds];
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

    const filteredNodes = nodesRef.current.filter(n => connectedIds.has(n.id));
    const filteredEdges = edgesRef.current.filter(e => connectedIds.has(e.source) && connectedIds.has(e.target));

    if (filteredNodes.length === 0) { toast.error('No nodes to export'); return; }
    setExportPreview({ nodes: filteredNodes, edges: filteredEdges, filename: getExportFilename(group) });
  }, []);

  const canvasGroups = useMemo(() => {
    return nodes
      .map(n => n.data.section)
      .filter((s): s is string => !!s)
      .filter((s, i, arr) => arr.indexOf(s) === i);
  }, [nodes]);

  // Register SVG export handler in workspace context
  useEffect(() => {
    if (companionMode) return;
    setFlowchartExportHandler({
      exportAll: handleExportSVGAll,
      exportGroup: handleExportSVGGroup,
      groups: canvasGroups,
    });
    return () => setFlowchartExportHandler(null);
  }, [companionMode, handleExportSVGAll, handleExportSVGGroup, canvasGroups, setFlowchartExportHandler]);

  const selectedGroupNodeIds = useMemo(() => {
    if (!selectedGroup) return emptySetRef.current;
    const startIds = nodes.filter(n => n.data.section === selectedGroup).map(n => n.id);
    if (startIds.length === 0) return emptySetRef.current;
    const connectedIds = new Set<string>(startIds);
    const queue = [...startIds];
    let qi = 0;
    while (qi < queue.length) {
      const currentId = queue[qi++];
      for (const edge of edges) {
        if (edge.source === currentId && !connectedIds.has(edge.target)) {
          connectedIds.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    return connectedIds;
  }, [selectedGroup, nodes, edges]);

  const groupBounds = useMemo(() => {
    if (selectedGroupNodeIds.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const NODE_W = 160;
    const NODE_H = 70;
    for (const n of nodes) {
      if (selectedGroupNodeIds.has(n.id)) {
        const x = n.position.x;
        const y = n.position.y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + NODE_W);
        maxY = Math.max(maxY, y + NODE_H);
      }
    }
    if (minX === Infinity) return null;
    return { x: minX - 14, y: minY - 14, width: maxX - minX + 28, height: maxY - minY + 28 };
  }, [selectedGroupNodeIds, nodes]);

  const memoizedNodes = useMemo(() => {
    return nodes.map((n) => {
      const isSelected = n.id === selectedNodeId;
      const isGroupMember = selectedGroupNodeIds.has(n.id);
      const selected = isSelected || isGroupMember;
      // commentsEnabled is never set on a public link; a read-only Team viewer may still comment.
      const canComment = commentsEnabled && !companionMode;

      return !!n.selected === selected && n.data._commentsEnabled === canComment && n.data._readOnly === isReadOnly
        ? n
        : { ...n, selected, data: { ...n.data, _commentsEnabled: canComment, _readOnly: isReadOnly } };
    });
  }, [companionMode, commentsEnabled, isReadOnly, nodes, selectedNodeId, selectedGroupNodeIds]);

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
    if (companionMode) return;
    if (isDraggingRef.current) return;
    const timer = setTimeout(() => {
      setActionContextData({
        nodes: nodesRef.current,
        edges: edgesRef.current,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [companionMode, nodes, edges, setActionContextData]);

  // AI Content Handler (show preview before applying)
  const pendingContentRef = React.useRef<string | null>(null);
  const pendingActionIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (companionMode) return;
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
  }, [companionMode, registerContentHandler, setNodes, setEdges, takeSnapshot]);

  useEffect(() => {
    if (companionMode) return;
    const consumePending = () => {
      // A stale hand-off must not land in whichever flowchart opens next.
      if (!isPendingFlowchartTarget(activeFlowchart, localStorage.getItem(PENDING_FLOWCHART_TARGET))) return;
      const pendingFlowchart = localStorage.getItem('pending_create_flowchart_json');
      if (pendingFlowchart) {
        localStorage.removeItem(PENDING_FLOWCHART_TARGET);
        localStorage.removeItem('pending_create_flowchart_json');
        const result = previewFlowchartContent(pendingFlowchart);
        if (result && result.nodes.length > 0) {
          pendingContentAppliedRef.current = true;
          takeSnapshot(nodesRef.current, edgesRef.current);
          setNodes(result.nodes);
          setEdges(result.edges);
        
          // Save immediately to DB to prevent empty state on reload
          const dataString = JSON.stringify({ nodes: result.nodes, edges: result.edges });
          if (saveFlowchart && activeFlowchart) {
            saveFlowchart({
              ...activeFlowchart,
              data: dataString
            }).then(() => {
              triggerDebouncedSync?.();
            }).catch(err => {
              console.error('Error saving generated flowchart:', err);
            });
          } else {
            handleFlowchartChange(result.nodes, result.edges);
          }
        
          // An already-open pane keeps its old viewport, which can hide the new symbols.
        setTimeout(() => fitView({ padding: 0.2 }), 50);
        toast.success('Applied generated architecture Flowchart to new canvas');
        }
      }

      // Update mode: replace existing flowchart with AI-generated content
      const pendingUpdateFlowchart = localStorage.getItem('pending_update_flowchart_json');
      if (pendingUpdateFlowchart) {
        localStorage.removeItem('pending_update_flowchart_json');
        localStorage.removeItem(PENDING_FLOWCHART_TARGET);
        const result = previewFlowchartContent(pendingUpdateFlowchart);
        if (result && result.nodes.length > 0) {
          pendingContentAppliedRef.current = true;
          takeSnapshot(nodesRef.current, edgesRef.current);
          setNodes(result.nodes);
          setEdges(result.edges);
        
          const dataString = JSON.stringify({ nodes: result.nodes, edges: result.edges });
          if (saveFlowchart && activeFlowchart) {
            saveFlowchart({
              ...activeFlowchart,
              data: dataString
            }).then(() => {
              triggerDebouncedSync?.();
            }).catch(err => {
              console.error('Error updating flowchart:', err);
            });
          } else {
            handleFlowchartChange(result.nodes, result.edges);
          }
        
          // An already-open pane keeps its old viewport, which can hide the new symbols.
        setTimeout(() => fitView({ padding: 0.2 }), 50);
        toast.success('Updated Flowchart with AI-generated content');
        }
      }
    };
    consumePending();
    // The target may already be open in a side-by-side pane, where no remount re-runs this effect.
    window.addEventListener(PENDING_FLOWCHART_EVENT, consumePending);
    return () => window.removeEventListener(PENDING_FLOWCHART_EVENT, consumePending);
  }, [companionMode, setNodes, setEdges, takeSnapshot, handleFlowchartChange, saveFlowchart, activeFlowchart, triggerDebouncedSync, fitView]);

  const handleConfirmAppend = useCallback((result: FlowchartApplyResult) => {
    takeSnapshot(nodesRef.current, edgesRef.current);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodes(result.nodes);
    setEdges(result.edges);
    handleFlowchartChangeRef.current(result.nodes, result.edges);
    setPendingPreview(null);
    pendingContentRef.current = null;
    clearParseCache();
    requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: 0.15 })));
  }, [setNodes, setEdges, takeSnapshot, fitView]);

  const memoizedEdges = useMemo(() => edges.map(e => {
    const isHovered = e.id === hoveredEdgeId;
    const isSelected = e.id === selectedEdgeId;

    let baseEdge = e;

    if (!isHovered && !isSelected) return baseEdge;

    const overrideMarker = (marker: any) => {
      if (!marker) return undefined;
      if (typeof marker === 'string') return marker;
      return { ...marker, color: '#ffffff', width: 14, height: 14 };
    };

    const overriddenStyle = isSelected
      ? { ...(baseEdge.style || {}), stroke: '#ffffff', strokeWidth: 2.5 }
      : baseEdge.style;

    return {
      ...baseEdge,
      style: overriddenStyle,
      markerEnd: isSelected ? overrideMarker(baseEdge.markerEnd) : baseEdge.markerEnd,
      markerStart: isSelected ? overrideMarker(baseEdge.markerStart) : baseEdge.markerStart,
    };
  }), [edges, hoveredEdgeId, selectedEdgeId]);

  // ── EARLY RETURN (setelah semua hooks) ──
  if (showLoader) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading flowchart...</p>
      </div>
    );
  }

  return (
    <Card className="w-full h-full border rounded-xl bg-muted/20 flex flex-col overflow-hidden relative py-0">
      <PrepareCommentAnchor prepare={prepareAnchor} />

      {!isReadOnly && (
        <div className={cn('absolute z-10 flex pointer-events-none', isMobile ? 'top-6 inset-x-0 justify-center px-3' : 'top-4 left-4 bottom-28 items-start')}>
          <div role="group" aria-label="Flowchart tools" className={cn('flex gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto no-scrollbar', isMobile ? 'items-center max-w-full overflow-x-auto' : 'flex-col items-center max-h-full overflow-y-auto')}>
            <JumpToNode nodes={nodes} label="Symbol" iconOnly={!isMobile} />
            {canvasGroups.length > 0 && (
              <>
                <div className={cn('bg-border shrink-0', isMobile ? 'w-px h-6 mx-0.5' : 'h-px w-6 my-0.5')} />
                <Select value={selectedGroup ?? ''} onValueChange={(val) => { setSelectedGroup(val || null); setSelectedNodeId(null); }}>
                  <Tooltip>
                    <TooltipTrigger render={
                      <SelectTrigger className={cn('shrink-0 border-none bg-transparent hover:bg-muted cursor-pointer', isMobile ? 'h-9 w-auto max-w-48 px-2' : 'size-9 justify-center p-0 [&>svg:last-child]:hidden')} aria-label="Select a group to move">
                        <Move />
                        <SelectValue className={isMobile ? 'min-w-0 truncate' : 'sr-only'}>{selectedGroup ?? 'Move Group'}</SelectValue>
                      </SelectTrigger>
                    } />
                    <TooltipContent side={isMobile ? 'bottom' : 'right'}>{selectedGroup ? `Move group: ${selectedGroup}` : 'Select a group to move'}</TooltipContent>
                  </Tooltip>
                  <SelectContent side={isMobile ? 'bottom' : 'right'} alignItemWithTrigger={false} className="w-64 max-w-[calc(100vw-2rem)]">
                    <SelectGroup>
                      {canvasGroups.map((g) => (
                        <SelectItem key={g} value={g}><span className="max-w-48 truncate">{g}</span></SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </>
            )}
            <>
              <div className={cn('bg-border shrink-0', isMobile ? 'w-px h-6 mx-0.5' : 'h-px w-6 my-0.5')} />
              <Button onClick={handleAutoLayout} variant="outline" size={isMobile ? 'sm' : 'icon-lg'} aria-label="Auto Layout" title={isMobile ? 'Auto Layout' : undefined} className={isMobile ? 'h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer' : undefined}>
                <LayoutGrid className={cn('w-3.5 h-3.5', isMobile && 'sm:mr-1.5')} />
                {isMobile && <span className="hidden sm:inline">Auto Layout</span>}
              </Button>
              <Button onClick={() => setIsAddingNode(true)} size={isMobile ? 'sm' : 'icon-lg'} aria-label="Add Symbol" title={isMobile ? 'Add Symbol' : undefined} className={isMobile ? 'h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer' : undefined}>
                <Plus className={cn('w-4 h-4', isMobile && 'sm:mr-2')} />
                {isMobile && <span className="hidden sm:inline">Add Symbol</span>}
              </Button>
            </>
            <div className={cn('bg-border shrink-0', isMobile ? 'w-px h-6 mx-0.5' : 'h-px w-6 my-0.5')} />
            <Button onClick={handleUndo} disabled={!canUndo} size={isMobile ? 'sm' : 'icon-lg'} variant="ghost" aria-label="Undo" aria-keyshortcuts="Control+z Meta+z" className={isMobile ? 'h-9 w-9 p-0 cursor-pointer' : undefined} title="Undo (Ctrl/Cmd+Z)">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button onClick={handleRedo} disabled={!canRedo} size={isMobile ? 'sm' : 'icon-lg'} variant="ghost" aria-label="Redo" aria-keyshortcuts="Control+Shift+z Meta+Shift+z" className={isMobile ? 'h-9 w-9 p-0 cursor-pointer' : undefined} title="Redo (Ctrl/Cmd+Shift+Z)">
              <Redo2 className="w-4 h-4" />
            </Button>
            <Button onClick={() => setIsClearingCanvas(true)} disabled={nodes.length === 0 && edges.length === 0} size="icon-lg" variant="ghost" aria-label="Clear Canvas" title="Clear Canvas">
              <Eraser className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          id={activeFlowchartId ? `flowchart-${activeFlowchartId}` : undefined}
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
          onNodeClick={(e, node) => { setSelectedEdgeId(null); setSelectedNodeId(node.id); }}
          onEdgeClick={(e, edge) => { setSelectedNodeId(null); setSelectedEdgeId(edge.id); }}
          onEdgeMouseEnter={(e, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setSelectedGroup(null); }}
          fitView
          colorMode={resolvedTheme}
          onlyRenderVisibleElements={true}
          nodesDraggable={!isReadOnly}
          nodesConnectable={!isReadOnly}
          elementsSelectable={!isReadOnly || commentsEnabled}
          minZoom={0.1}
          maxZoom={2.5}
          onMove={(e, v) => setViewport(v)}
        >
          <Controls className="bg-background/95 border-border shadow-md" showInteractive={!isReadOnly} />
          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color={bgColor} />
        </ReactFlow>
        {groupBounds && (
          <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
            <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
              <rect
                x={groupBounds.x}
                y={groupBounds.y}
                width={groupBounds.width}
                height={groupBounds.height}
                fill="rgba(99, 102, 241, 0.04)"
                stroke="#6366f1"
                strokeWidth={1.5 / viewport.zoom}
                strokeDasharray={`${6 / viewport.zoom} ${3 / viewport.zoom}`}
                rx={8 / viewport.zoom}
                ry={8 / viewport.zoom}
              />
            </g>
          </svg>
        )}
      </div>

      {!isReadOnly && (
        <>
          <ConfirmModal
            isOpen={isClearingCanvas}
            title="Clear Flowchart Canvas?"
            message="Remove all symbols and connectors from this flowchart. You can restore them with Undo."
            confirmText="Clear Canvas"
            onConfirm={clearCanvas}
            onCancel={() => setIsClearingCanvas(false)}
          />
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
            onValidateSection={validateSection}
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
          mode={pendingApplyModeRef.current}
          existingNodes={nodes}
          existingEdges={edges}
          onConfirm={handleConfirmAppend}
          onCancel={() => { setPendingPreview(null); pendingContentRef.current = null; }}
          confirmLabel={pendingApplyModeRef.current === 'insert' ? 'Confirm Insert' : pendingApplyModeRef.current === 'replace' ? 'Replace All' : 'Confirm Append'}
          canvasGroups={pendingApplyModeRef.current === 'replace' ? nodes.map(n => n.data.section).filter((s): s is string => !!s).filter((s, i, arr) => arr.indexOf(s) === i) : []}
        />
      )}

      {exportPreview && (
        <FlowchartExportModal
          nodes={exportPreview.nodes}
          edges={exportPreview.edges}
          filename={exportPreview.filename}
          onCancel={() => setExportPreview(null)}
        />
      )}
    </Card>
  );
});

// ERD and Flowchart must not share React Flow's live nodes or renderer registry.
export const FlowchartView = React.memo((props: FlowchartViewProps) => (
  <ReactFlowProvider key={props.activeFlowchartId}>
    <FlowchartCanvas {...props} />
  </ReactFlowProvider>
));
