import { useEffect, useCallback, useRef } from 'react';

export enum BroadcastMessageType {
  DRAFT_UPDATED = 'DRAFT_UPDATED',
  SYNC_COMPLETED = 'SYNC_COMPLETED',
  VIEW_REFRESH_REQUESTED = 'VIEW_REFRESH_REQUESTED'
}

interface BroadcastMessage {
  type: BroadcastMessageType;
  payload: {
    type: string;
    id: string | number;
    timestamp: number;
    senderId: string;
  };
}

// Unique ID for this tab instance to avoid reacting to our own messages
const TAB_ID = Math.random().toString(36).substring(2, 11);
const CHANNEL_NAME = 'erd_builder_sync_channel';

export const useBroadcastChannel = (onMessageReceived?: (message: BroadcastMessage) => void) => {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Initialize channel
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
      // Ignore messages from this same tab
      if (event.data.payload.senderId === TAB_ID) return;
      
      if (onMessageReceived) {
        onMessageReceived(event.data);
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [onMessageReceived]);

  const broadcastMessage = useCallback((type: BroadcastMessageType, entityType: string, id: string | number) => {
    if (channelRef.current) {
      const message: BroadcastMessage = {
        type,
        payload: {
          type: entityType,
          id,
          timestamp: Date.now(),
          senderId: TAB_ID
        }
      };
      channelRef.current.postMessage(message);
    }
  }, []);

  return { broadcastMessage, tabId: TAB_ID };
};
