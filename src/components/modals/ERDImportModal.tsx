import React, { useRef } from 'react';
import { ImportSQLModal } from './ImportSQLModal';
import { DraftType } from '../../types';
import { BroadcastMessageType } from '../../hooks/useBroadcastChannel';

interface ERDImportModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: any[];
  edges: any[];
  setNodes: (nodes: any[]) => void;
  setEdges: (edges: any[]) => void;
  activeDiagramId: number | string | null;
  takeSnapshot: (nodes: any[], edges: any[]) => void;
  saveDiagram: (nodes: any[], edges: any[], viewport: any) => Promise<void>;
  triggerDebouncedSync: () => void;
  broadcastMessage: (type: BroadcastMessageType, draftType: DraftType, id: number | string) => void;
  setIsLocalSaving: (loading: boolean) => void;
  viewportRef: { current: any };
  lastLoadedDiagramIdRef: { current: number | string | null };
}

export const ERDImportModal: React.FC<ERDImportModalProps> = ({
  isOpen,
  onOpenChange,
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
}) => {
  const handleImport = (newNodes: any[], newEdges: any[]) => {
    takeSnapshot(nodes, edges);
    
    // Handle duplicate names during import
    const processedNodes = [...newNodes];
    const existingNames = nodes.map(n => n.data.name.toLowerCase());
    
    processedNodes.forEach(newNode => {
      let originalName = newNode.data.name;
      let name = originalName;
      let counter = 1;
      
      while (
        existingNames.includes(name.toLowerCase()) || 
        processedNodes.some(pn => pn !== newNode && pn.data.name.toLowerCase() === name.toLowerCase())
      ) {
        name = `${originalName}_imported_${counter}`;
        counter++;
      }
      
      if (name !== originalName) {
        newNode.data.name = name;
      }
    });

    const updatedNodes = [...nodes, ...processedNodes];
    const updatedEdges = [...edges, ...newEdges];
    
    setNodes(updatedNodes);
    setEdges(updatedEdges);

    if (activeDiagramId) {
      lastLoadedDiagramIdRef.current = activeDiagramId;
      setIsLocalSaving(true);
      
      saveDiagram(updatedNodes, updatedEdges, viewportRef.current).then(() => {
        setIsLocalSaving(false);
        triggerDebouncedSync();
        broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.ERD, activeDiagramId);
      });
    }
  };

  return (
    <ImportSQLModal 
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onImport={handleImport}
    />
  );
};
