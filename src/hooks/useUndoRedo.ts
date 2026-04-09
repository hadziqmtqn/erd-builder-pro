import { useCallback, useState } from 'react';
import { Node, Edge } from '@xyflow/react';

export type HistoryState = {
  nodes: Node<any>[];
  edges: Edge[];
};

export function useUndoRedo() {
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const takeSnapshot = useCallback((nodes: Node<any>[], edges: Edge[]) => {
    setPast((prev) => {
      // Limit history to 50 steps to keep it light
      const newPast = [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }];
      if (newPast.length > 50) return newPast.slice(1);
      return newPast;
    });
    setFuture([]);
  }, []);

  const undo = useCallback((currentNodes: Node<any>[], currentEdges: Edge[]) => {
    if (past.length === 0) return null;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setPast(newPast);
    setFuture((prev) => [{ nodes: JSON.parse(JSON.stringify(currentNodes)), edges: JSON.parse(JSON.stringify(currentEdges)) }, ...prev]);
    
    return previous;
  }, [past]);

  const redo = useCallback((currentNodes: Node<any>[], currentEdges: Edge[]) => {
    if (future.length === 0) return null;

    const next = future[0];
    const newFuture = future.slice(1);

    setPast((prev) => [...prev, { nodes: JSON.parse(JSON.stringify(currentNodes)), edges: JSON.parse(JSON.stringify(currentEdges)) }]);
    setFuture(newFuture);

    return next;
  }, [future]);

  const clearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    undo,
    redo,
    takeSnapshot,
    clearHistory,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
