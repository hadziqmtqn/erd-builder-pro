import { useCallback, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Entity } from '@/types';

export interface UseWorkspaceCallbacksParams {
  isPublicView: boolean;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setIsTablePropertiesOpen: (open: boolean) => void;
  setIsImportModalOpen: (open: boolean) => void;
  viewportRef: React.MutableRefObject<any>;
  publicData: any;
  diagrams: any[];
  activeDiagramId: any;
  handleExportSQL: (dialect: 'postgresql' | 'mysql', target: any, nodes: Node<Entity>[], edges: Edge[]) => void;
  handleExportPDF: (name: string) => void;
  handleExportImage: (name: string) => void;
  nodes: Node<Entity>[];
  edges: Edge[];
  view: string;
  isDiagramsLoading: boolean;
  isERDItemLoading: boolean;
  isNotesLoading: boolean;
  isNoteItemLoading: boolean;
  isDrawingsLoading: boolean;
  isDrawingItemLoading: boolean;
  isFlowchartsLoading: boolean;
  isFlowchartItemLoading: boolean;
}

export function useWorkspaceCallbacks(params: UseWorkspaceCallbacksParams) {
  const {
    isPublicView, setSelectedNodeId, setSelectedEdgeId,
    setIsTablePropertiesOpen, setIsImportModalOpen,
    viewportRef,
    publicData, diagrams, activeDiagramId,
    handleExportSQL, handleExportPDF, handleExportImage,
    nodes, edges,
    view,
    isDiagramsLoading, isERDItemLoading,
    isNotesLoading, isNoteItemLoading,
    isDrawingsLoading, isDrawingItemLoading,
    isFlowchartsLoading, isFlowchartItemLoading,
  } = params;

  const handleNodeClick = useCallback((e: React.MouseEvent, n: Node) => {
    if (!isPublicView && !(e.target as HTMLElement).closest('.nodrag')) setSelectedNodeId(n.id);
  }, [isPublicView, setSelectedNodeId]);

  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, n: Node) => {
    if (!isPublicView && !(e.target as HTMLElement).closest('.nodrag')) {
      setSelectedNodeId(n.id);
      setIsTablePropertiesOpen(true);
    }
  }, [isPublicView, setSelectedNodeId, setIsTablePropertiesOpen]);

  const handleEdgeClick = useCallback((_: any, e: Edge) => {
    if (!isPublicView) setSelectedEdgeId(e.id);
  }, [isPublicView, setSelectedEdgeId]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setSelectedNodeId, setSelectedEdgeId]);

  const handleMove = useCallback((_: any, v: any) => {
    viewportRef.current = v;
  }, [viewportRef]);

  const handleOpenImportModal = useCallback(() => {
    setIsImportModalOpen(true);
  }, [setIsImportModalOpen]);

  const handleWorkspaceExportSQL = useCallback((dialect: 'postgresql' | 'mysql') => {
    const target = isPublicView ? publicData : diagrams.find(f => f.id === activeDiagramId);
    if (target) handleExportSQL(dialect, target, nodes, edges);
  }, [isPublicView, publicData, diagrams, activeDiagramId, handleExportSQL, nodes, edges]);

  const handleWorkspaceExportPDF = useCallback(() => {
    const targetName = isPublicView
      ? (publicData?.name || 'Shared')
      : (diagrams.find(f => f.id === activeDiagramId)?.name || 'Diagram');
    handleExportPDF(targetName);
  }, [isPublicView, publicData, diagrams, activeDiagramId, handleExportPDF]);

  const handleWorkspaceExportImage = useCallback(() => {
    const targetName = isPublicView
      ? (publicData?.name || 'Shared')
      : (diagrams.find(f => f.id === activeDiagramId)?.name || 'Diagram');
    handleExportImage(targetName);
  }, [isPublicView, publicData, diagrams, activeDiagramId, handleExportImage]);

  const workspaceIsLoading = useMemo(() => {
    if (view === 'erd') return isERDItemLoading;
    if (view === 'notes') return isNoteItemLoading;
    if (view === 'drawings') return isDrawingItemLoading;
    if (view === 'flowchart') return isFlowchartItemLoading;
    return false;
  }, [view, isERDItemLoading, isNoteItemLoading, isDrawingItemLoading, isFlowchartItemLoading]);

  return {
    handleNodeClick,
    handleNodeDoubleClick,
    handleEdgeClick,
    handlePaneClick,
    handleMove,
    handleOpenImportModal,
    handleWorkspaceExportSQL,
    handleWorkspaceExportPDF,
    handleWorkspaceExportImage,
    workspaceIsLoading,
  };
}
