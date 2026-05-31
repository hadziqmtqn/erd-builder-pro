import { useEffect, useRef, useCallback } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { Node, Edge } from '@xyflow/react';
import { Entity } from '../types';

/**
 * Realtime sync hook using Supabase Broadcast for instant multi-device updates.
 * This handles ephemeral changes like node movement without bloating the database.
 */
export const useRealtimeSync = (
  activeDiagramId: string | number | null,
  setNodes: React.Dispatch<React.SetStateAction<Node<Entity>[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
) => {
  const channelRef = useRef<any>(null);
  const subscribedIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!activeDiagramId) return;
    if (!supabase) return;

    // 🛡️ Skip re-subscribe if already subscribed to this diagram.
    // Prevents unnecessary canvas re-initialization when AppContent
    // re-renders but the diagram ID hasn't actually changed.
    if (subscribedIdRef.current === activeDiagramId) return;
    subscribedIdRef.current = activeDiagramId;

    console.log(`[Realtime] Connecting to diagram:${activeDiagramId}`);

    // Connect to a specific channel for this diagram
    const channel = supabase.channel(`diagram:${activeDiagramId}`, {
      config: {
        broadcast: { self: false }, // Don't receive our own messages
      },
    });

    channel
      .on('broadcast', { event: 'node_moved' }, ({ payload }) => {
        const { id, x, y } = payload;
        setNodes((nds) =>
          nds.map((n) => (n.id === id ? { ...n, position: { x, y } } : n))
        );
      })
      .on('broadcast', { event: 'node_updated' }, ({ payload }) => {
        const { id, data } = payload;
        setNodes((nds) =>
          nds.map((n) => (n.id === id ? { ...n, data } : n))
        );
      })
      .on('broadcast', { event: 'edges_updated' }, ({ payload }) => {
        const { edges } = payload;
        setEdges(edges);
      })
      .subscribe((status) => {
        console.log(`[Realtime] Status for diagram:${activeDiagramId}:`, status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log(`[Realtime] Unsubscribing from diagram:${activeDiagramId}`);
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [activeDiagramId, setNodes, setEdges]);

  // Function to broadcast node movement (high frequency)
  const broadcastNodeMove = useCallback((id: string, x: number, y: number) => {
    if (channelRef.current && activeDiagramId) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'node_moved',
        payload: { id, x, y },
      });
    }
  }, [activeDiagramId]);

  // Function to broadcast node data updates (e.g., column changes)
  const broadcastNodeUpdate = useCallback((id: string, data: Entity) => {
    if (channelRef.current && activeDiagramId) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'node_updated',
        payload: { id, data },
      });
    }
  }, [activeDiagramId]);
  
  // Function to broadcast edge changes
  const broadcastEdgesUpdate = useCallback((edges: Edge[]) => {
    if (channelRef.current && activeDiagramId) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'edges_updated',
        payload: { edges },
      });
    }
  }, [activeDiagramId]);

  return { 
    broadcastNodeMove, 
    broadcastNodeUpdate, 
    broadcastEdgesUpdate 
  };
};
