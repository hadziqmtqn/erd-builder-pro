import { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Entity } from '../types';

/**
 * Realtime sync — stubbed to no-op.
 * Supabase Broadcast was used for multi-device realtime sync (node movement, etc.).
 * Desktop mode will not have Supabase; web uses auto-save for persistence instead.
 */
export const useRealtimeSync = (
  _activeDiagramId: string | number | null,
  _setNodes: React.Dispatch<React.SetStateAction<Node<Entity>[]>>,
  _setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
) => {
  const broadcastNodeMove = useCallback((_id: string, _x: number, _y: number) => {}, []);
  const broadcastNodeUpdate = useCallback((_id: string, _data: Entity) => {}, []);
  const broadcastEdgesUpdate = useCallback((_edges: Edge[]) => {}, []);

  return { broadcastNodeMove, broadcastNodeUpdate, broadcastEdgesUpdate };
};
