import { useCallback, useRef, useState } from 'react';
import { Node, Edge } from '@xyflow/react';

export type HistoryState = {
  nodes: Node<any>[];
  edges: Edge[];
};

export function useUndoRedo() {
  const pastRef = useRef<HistoryState[]>([]);
  const futureRef = useRef<HistoryState[]>([]);
  const [, forceUpdate] = useState(0);

  const takeSnapshot = useCallback((nodes: Node<any>[], edges: Edge[]) => {
    const snapshot: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    pastRef.current = [...pastRef.current, snapshot];
    if (pastRef.current.length > 50) {
      pastRef.current = pastRef.current.slice(1);
    }
    futureRef.current = [];
    forceUpdate((n) => n + 1);
  }, []);

  const undo = useCallback((currentNodes: Node<any>[], currentEdges: Edge[]) => {
    if (pastRef.current.length === 0) return null;

    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, pastRef.current.length - 1);
    futureRef.current = [
      {
        nodes: JSON.parse(JSON.stringify(currentNodes)),
        edges: JSON.parse(JSON.stringify(currentEdges)),
      },
      ...futureRef.current,
    ];
    forceUpdate((n) => n + 1);
    return previous;
  }, []);

  const redo = useCallback((currentNodes: Node<any>[], currentEdges: Edge[]) => {
    if (futureRef.current.length === 0) return null;

    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [
      ...pastRef.current,
      {
        nodes: JSON.parse(JSON.stringify(currentNodes)),
        edges: JSON.parse(JSON.stringify(currentEdges)),
      },
    ];
    forceUpdate((n) => n + 1);
    return next;
  }, []);

  const clearHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    forceUpdate((n) => n + 1);
  }, []);

  return {
    undo,
    redo,
    takeSnapshot,
    clearHistory,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
