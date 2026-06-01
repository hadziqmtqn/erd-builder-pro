import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  ReactFlow,
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
import { Plus, Loader2, Undo2, Redo2, Move, Play, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
import { FlowchartExportModal } from '@/components/flowchart/FlowchartExportModal';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { autoLayoutFlowchart } from '@/lib/autoLayoutFlowchart';
import { useWorkspace } from '@/providers/WorkspaceContext';
import type { FlowchartExportHandler } from '@/providers/WorkspaceContext';

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
}

export const FlowchartView = React.memo(({ 
  activeFlowchartId, 
  activeFlowchart, 
  handleFlowchartChange, 
  isReadOnly = false,
  isLoading = false,
  saveFlowchart,
  triggerDebouncedSync,
}: FlowchartViewProps) => {
  // ── Hooks FIRST (before any conditional return — Rule of Hooks) ──
  const { registerContentHandler, setActionContextData } = useAIAction();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowchartNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<FlowchartApplyResult | null>(null);
  const [exportPreview, setExportPreview] = useState<{ nodes: Node<FlowchartNodeData>[]; edges: Edge[]; filename: string } | null>(null);
  const [newNodeData, setNewNodeData] = useState<FlowchartNodeData>({
    label: 'New Symbol',
    shape: 'rectangle',
    color: '#8b5cf6',
  });
  const initialLoadRef = React.useRef(true);
  const isParsingFromDataRef = React.useRef(false);
  const isDraggingRef = React.useRef(false);
  const pendingContentAppliedRef = React.useRef(false);
  const lastFlowchartIdRef = React.useRef(activeFlowchartId);
  const isEditingEdgeRef = React.useRef(false);
  const isEditingNodeRef = React.useRef(false);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const emptySetRef = React.useRef(new Set<string>());
  const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo();
  const pendingApplyModeRef = React.useRef<'append' | 'insert' | 'replace'>('append');

  // ─── Simulation Sandbox States ───────────────────────
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationContext, setSimulationContext] = useState<string>('{\n  "amount": 150,\n  "role": "admin",\n  "status": "pending",\n  "tries": 0\n}');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [visitedNodeIds, setVisitedNodeIds] = useState<string[]>([]);
  const [visitedEdgeIds, setVisitedEdgeIds] = useState<string[]>([]);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [simError, setSimError] = useState<string | null>(null);
  const [showSimPanel, setShowSimPanel] = useState(false);

  const startSimulationMode = () => {
    setIsSimulating(true);
    setShowSimPanel(true);
    setActiveNodeId(null);
    setVisitedNodeIds([]);
    setVisitedEdgeIds([]);
    setSimulationLogs(['Simulation sandbox opened. Customize input variables below and click "Start Run".']);
    setSimError(null);
  };

  const stopSimulationMode = () => {
    setIsSimulating(false);
    setShowSimPanel(false);
    setActiveNodeId(null);
    setVisitedNodeIds([]);
    setVisitedEdgeIds([]);
    setSimError(null);
  };

  const handleStepSimulation = useCallback(() => {
    setSimError(null);

    // 1. Initial State: Start at the "Start" node
    if (!activeNodeId) {
      const startNode = nodes.find(n => n.data.label.trim().toLowerCase().includes('start')) || 
                        nodes.find(n => n.data.shape === 'oval') ||
                        nodes[0];
      
      if (!startNode) {
        toast.error('No symbols found on canvas to simulate');
        return;
      }

      try {
        JSON.parse(simulationContext);
      } catch (err) {
        const msg = 'Invalid Input JSON: ' + (err as Error).message;
        setSimError(msg);
        toast.error('Simulation Input JSON error');
        return;
      }

      setActiveNodeId(startNode.id);
      setVisitedNodeIds([]);
      setVisitedEdgeIds([]);
      setSimulationLogs([
        `[START] Simulation initialized.`,
        `[STEP] Starting at node: "${startNode.data.label}" (${startNode.data.shape})`
      ]);
      return;
    }

    // 2. Running State: Process current node
    const currentNode = nodes.find(n => n.id === activeNodeId);
    if (!currentNode) {
      setSimError('Active node not found');
      return;
    }

    let contextObj = {};
    try {
      contextObj = JSON.parse(simulationContext);
    } catch (err) {
      setSimError('Failed to parse variables: ' + (err as Error).message);
      return;
    }

    let resultBranch: any = null;
    if (currentNode.data.code && String(currentNode.data.code).trim()) {
      try {
        const runner = new Function('context', `
          const run = (context) => {
            ${currentNode.data.code}
          };
          return run(context);
        `);
        resultBranch = runner(contextObj);
        setSimulationContext(JSON.stringify(contextObj, null, 2));
      } catch (err) {
        const errMsg = 'Error executing code: ' + (err as Error).message;
        setSimulationLogs(prev => [...prev, `[ERROR] ${errMsg}`]);
        setSimError(errMsg);
        return;
      }
    }

    const outgoingEdges = edges.filter(e => e.source === activeNodeId);

    if (outgoingEdges.length === 0) {
      setSimulationLogs(prev => [
        ...prev, 
        `[LOG] Processed node: "${currentNode.data.label}"`,
        `[END] Reached end node. Simulation completed successfully.`
      ]);
      setVisitedNodeIds(prev => [...prev, activeNodeId]);
      setActiveNodeId(null);
      toast.success('Simulation Finished!');
      return;
    }

    let selectedEdge: Edge | null = null;

    if (outgoingEdges.length === 1) {
      selectedEdge = outgoingEdges[0];
    } else {
      if (resultBranch !== null && resultBranch !== undefined) {
        selectedEdge = outgoingEdges.find(e => 
          String(e.label || '').trim().toLowerCase() === String(resultBranch).trim().toLowerCase()
        ) || null;

        if (!selectedEdge) {
          setSimulationLogs(prev => [
            ...prev,
            `[WARNING] Code returned "${resultBranch}", but no matching connector label was found.`
          ]);
        }
      }
    }

    if (selectedEdge) {
      const targetNode = nodes.find(n => n.id === selectedEdge!.target);
      const nextLabel = targetNode ? targetNode.data.label : 'Unknown';
      const branchText = selectedEdge.label ? ` via branch "${selectedEdge.label}"` : '';

      setSimulationLogs(prev => [
        ...prev,
        `[LOG] Processed: "${currentNode.data.label}"`,
        `[STEP] Moving to "${nextLabel}"${branchText}`
      ]);

      const prevActiveId = activeNodeId;
      setVisitedNodeIds(prev => [...prev, prevActiveId]);
      setVisitedEdgeIds(prev => [...prev, selectedEdge!.id]);
      setActiveNodeId(selectedEdge.target);
    } else {
      setSimulationLogs(prev => [
        ...prev,
        `[PAUSE] Multiple paths available from "${currentNode.data.label}". Please select a connector manually below.`
      ]);
    }
  }, [activeNodeId, nodes, edges, simulationContext]);

  const handleResetSimulation = () => {
    setActiveNodeId(null);
    setVisitedNodeIds([]);
    setVisitedEdgeIds([]);
    setSimulationLogs(['Simulation reset. Ready to start again.']);
    setSimError(null);
  };

  const pausedBranches = useMemo(() => {
    if (!activeNodeId) return [];
    const outgoing = edges.filter(e => e.source === activeNodeId);
    if (outgoing.length <= 1) return [];
    return outgoing;
  }, [activeNodeId, edges]);

  const handleManualBranchSelect = (edge: Edge) => {
    const targetNode = nodes.find(n => n.id === edge.target);
    const nextLabel = targetNode ? targetNode.data.label : 'Unknown';
    const branchText = edge.label ? ` via branch "${edge.label}"` : '';

    setSimulationLogs(prev => [
      ...prev,
      `[MANUAL] Followed branch "${edge.label || 'Unnamed Branch'}"`,
      `[STEP] Moving to "${nextLabel}"${branchText}`
    ]);

    const prevActiveId = activeNodeId;
    setVisitedNodeIds(prev => prevActiveId ? [...prev, prevActiveId] : prev);
    setVisitedEdgeIds(prev => [...prev, edge.id]);
    setActiveNodeId(edge.target);
  };

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

  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    const repositions = autoLayoutFlowchart(nodes, edges);
    takeSnapshot(nodesRef.current, edgesRef.current);
    setNodes(repositions.nodes);
    setEdges(repositions.edges);
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);
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
      const hasPending = localStorage.getItem('pending_create_flowchart_json') || localStorage.getItem('pending_update_flowchart_json');
      const nodesData = (parsed.nodes && parsed.nodes.length > 0) ? parsed.nodes : (hasPending || pendingContentAppliedRef.current ? [] : initialNodes);
      const edgesData = (parsed.edges && parsed.edges.length > 0) ? parsed.edges : (hasPending || pendingContentAppliedRef.current ? [] : initialEdges);
      
      if (!pendingContentAppliedRef.current) {
        setNodes(nodesData);
        setEdges(edgesData);
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

  // ── SVG Export ──
  const { setFlowchartExportHandler } = useWorkspace();

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
    setFlowchartExportHandler({
      exportAll: handleExportSVGAll,
      exportGroup: handleExportSVGGroup,
      groups: canvasGroups,
    });
    return () => setFlowchartExportHandler(null);
  }, [handleExportSVGAll, handleExportSVGGroup, canvasGroups, setFlowchartExportHandler]);

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
      
      const nodeToMap = !!n.selected === selected ? n : { ...n, selected };

      if (!isSimulating) return nodeToMap;

      const isActive = nodeToMap.id === activeNodeId;
      const isVisited = visitedNodeIds.includes(nodeToMap.id);

      return {
        ...nodeToMap,
        data: {
          ...nodeToMap.data,
          isSimulationActive: isActive,
          isSimulationVisited: isVisited,
        }
      };
    });
  }, [nodes, selectedNodeId, selectedGroupNodeIds, isSimulating, activeNodeId, visitedNodeIds]);

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
    const timer = setTimeout(() => {
      setActionContextData({
        nodes: nodesRef.current,
        edges: edgesRef.current,
      });
    }, 500);
    return () => clearTimeout(timer);
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

  useEffect(() => {
    const pendingFlowchart = localStorage.getItem('pending_create_flowchart_json');
    if (pendingFlowchart) {
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
        
        toast.success('Applied generated architecture Flowchart to new canvas');
      }
    }

    // Update mode: replace existing flowchart with AI-generated content
    const pendingUpdateFlowchart = localStorage.getItem('pending_update_flowchart_json');
    if (pendingUpdateFlowchart) {
      localStorage.removeItem('pending_update_flowchart_json');
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
        
        toast.success('Updated Flowchart with AI-generated content');
      }
    }
  }, [setNodes, setEdges, takeSnapshot, handleFlowchartChange, saveFlowchart, activeFlowchart, triggerDebouncedSync]);

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

    let baseEdge = e;

    if (isSimulating) {
      const isVisited = visitedEdgeIds.includes(e.id);
      const isActive = activeNodeId && (e.source === activeNodeId || e.target === activeNodeId);
      
      baseEdge = {
        ...e,
        animated: !!(isVisited || isActive),
        style: isVisited
          ? { stroke: '#10b981', strokeWidth: 3 }
          : isActive
            ? { stroke: '#f59e0b', strokeWidth: 3 }
            : e.style,
      };
    }

    if (!isHovered && !isSelected) return baseEdge;

    const overrideMarker = (marker: any) => {
      if (!marker) return undefined;
      if (typeof marker === 'string') return marker;
      return { ...marker, color: '#ffffff', width: 14, height: 14 };
    };

    return {
      ...baseEdge,
      style: isSelected ? { stroke: '#ffffff', strokeWidth: 2.5 } : baseEdge.style,
      markerEnd: isSelected ? overrideMarker(baseEdge.markerEnd) : baseEdge.markerEnd,
    };
  }), [edges, hoveredEdgeId, selectedEdgeId, isSimulating, visitedEdgeIds, activeNodeId]);

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
    <Card className="w-full h-full border-0 rounded-none bg-muted/20 flex flex-col overflow-hidden relative">
      
      {/* Top Bar */}
      {!isReadOnly && (
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <JumpToNode nodes={nodes} label="Symbol" />
            {canvasGroups.length > 0 && !isSimulating && (
              <>
                <div className="w-px h-6 bg-border mx-0.5" />
                <Select value={selectedGroup ?? ''} onValueChange={(val) => { setSelectedGroup(val || null); setSelectedNodeId(null); }}>
                  <SelectTrigger className="h-9 min-w-[130px] border-none bg-transparent hover:bg-white/5 px-2 text-xs font-medium cursor-pointer [&>svg]:text-muted-foreground" title="Select a group to move">
                    <Move className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Move Group" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a24] border-white/10 text-white min-w-[150px]">
                    {canvasGroups.map((g) => (
                      <SelectItem key={g} value={g} className="focus:bg-white/10 text-xs">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {!isSimulating && (
              <>
                <div className="w-px h-6 bg-border mx-0.5" />
                <Button onClick={handleAutoLayout} variant="outline" size="sm" className="h-9 px-3 border-white/10 hover:bg-white/5 bg-white/5 text-xs font-semibold cursor-pointer">
                  <LayoutGrid className="w-3.5 h-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Auto Layout</span>
                </Button>
                <div className="w-px h-6 bg-border mx-0.5" />
                <Button onClick={() => setIsAddingNode(true)} size="sm" className="h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Symbol</span>
                </Button>
              </>
            )}
            <div className="w-px h-6 bg-border mx-0.5" />
            <Button 
              onClick={isSimulating ? stopSimulationMode : startSimulationMode} 
              size="sm" 
              variant={isSimulating ? "destructive" : "outline"}
              className={cn("h-9 px-3.5 font-bold cursor-pointer transition-all", isSimulating ? "" : "hover:bg-white/5 border-white/10 text-zinc-300")}
            >
              <Play className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              {isSimulating ? "Exit Sim" : "Simulate Flow"}
            </Button>
            {!isSimulating && (
              <>
                <div className="w-px h-6 bg-border mx-0.5" />
                <Button onClick={handleUndo} disabled={!canUndo} size="sm" variant="ghost" className="h-9 w-9 p-0 cursor-pointer" title="Undo">
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button onClick={handleRedo} disabled={!canRedo} size="sm" variant="ghost" className="h-9 w-9 p-0 cursor-pointer" title="Redo">
                  <Redo2 className="w-4 h-4" />
                </Button>
              </>
            )}
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
          onNodeClick={(e, node) => { if (!isSimulating) setSelectedNodeId(node.id); }}
          onEdgeClick={(e, edge) => { if (!isSimulating) setSelectedEdgeId(edge.id); }}
          onEdgeMouseEnter={(e, edge) => { if (!isSimulating) setHoveredEdgeId(edge.id); }}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setSelectedGroup(null); }}
          fitView
          colorMode="dark"
          onlyRenderVisibleElements={true}
          nodesDraggable={!isReadOnly && !isSimulating}
          nodesConnectable={!isReadOnly && !isSimulating}
          elementsSelectable={!isReadOnly && !isSimulating}
          minZoom={0.1}
          maxZoom={2.5}
          onMove={(e, v) => setViewport(v)}
        >
          <Controls className="bg-background/95 border-border shadow-md" showInteractive={!isReadOnly && !isSimulating} />
          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
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
        {/* Simulation Sandbox Panel overlay */}
        {showSimPanel && (
          <div className="absolute right-4 top-24 bottom-6 w-80 bg-[#0f0f14]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-20 flex flex-col overflow-hidden animate-in slide-in-from-right-3 duration-300 pointer-events-auto">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Simulation Sandbox</span>
              </div>
              <button 
                onClick={stopSimulationMode}
                className="text-zinc-500 hover:text-zinc-300 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {/* Input Variables Section */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Input Variables (JSON)</label>
                <textarea 
                  value={simulationContext}
                  onChange={(e) => setSimulationContext(e.target.value)}
                  disabled={!!activeNodeId}
                  className="w-full h-32 bg-black/50 border border-white/10 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-white/20 resize-none disabled:opacity-60"
                />
              </div>

              {/* Run Controls */}
              <div className="flex gap-2">
                <Button 
                  onClick={handleStepSimulation}
                  className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold shadow-md shadow-emerald-500/10"
                >
                  {!activeNodeId ? "Start Run" : "Step Forward"}
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleResetSimulation}
                  className="h-9 px-3 bg-white/5 border-white/10 text-zinc-300 hover:text-white"
                >
                  Reset
                </Button>
              </div>

              {simError && (
                <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg text-[11px] text-red-400 leading-normal font-medium">
                  {simError}
                </div>
              )}

              {/* Logs Area */}
              <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Execution Logs</label>
                <div className="flex-1 bg-black/40 border border-white/5 rounded-lg p-3 text-[11px] font-mono text-zinc-300 overflow-y-auto space-y-2 h-[220px] custom-scrollbar">
                  {simulationLogs.map((log, idx) => (
                    <div 
                      key={idx} 
                      className={cn(
                        "leading-normal whitespace-pre-wrap break-all",
                        log.startsWith("[START]") && "text-emerald-400 font-bold",
                        log.startsWith("[STEP]") && "text-zinc-200",
                        log.startsWith("[ERROR]") && "text-red-400",
                        log.startsWith("[WARNING]") && "text-amber-400",
                        log.startsWith("[END]") && "text-teal-400 font-bold",
                        log.startsWith("[PAUSE]") && "text-amber-300 font-bold",
                        log.startsWith("[MANUAL]") && "text-indigo-400"
                      )}
                    >
                      {log}
                    </div>
                  ))}

                  {/* Paused Manual Branch selection buttons */}
                  {pausedBranches.length > 0 && (
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <span className="text-[10px] text-zinc-400 block font-sans">Choose branch path to continue:</span>
                      <div className="flex flex-col gap-1.5">
                        {pausedBranches.map(edge => (
                          <button
                            key={edge.id}
                            onClick={() => handleManualBranchSelect(edge)}
                            className="w-full text-left px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 rounded-md text-[10px] font-sans font-bold transition-all"
                          >
                            → {edge.label || 'Unnamed Branch'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
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
          existingNodes={nodes}
          existingEdges={edges}
          onConfirm={handleConfirmAppend}
          onCancel={() => { setPendingPreview(null); pendingContentRef.current = null; }}
          confirmLabel={pendingApplyModeRef.current === 'insert' ? 'Confirm Insert' : pendingApplyModeRef.current === 'replace' ? 'Confirm Replace' : 'Confirm Append'}
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
