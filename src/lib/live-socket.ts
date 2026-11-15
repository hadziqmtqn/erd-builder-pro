import { getApiBaseUrl } from "./api";

export type LiveEvent = Record<string, unknown>;

/**
 * A send-then-close live channel (CLD-006 Team sync, NOT-001.5 notifications): the server sends one metadata event and
 * closes, and this reconnects with backoff while the tab is visible and online. `onReconnect` runs when a socket opens
 * after a drop, so the caller can refetch what it missed in between. Returns the cleanup.
 */
export function openLiveSocket(
  path: string,
  params: Record<string, string>,
  handlers: { onEvent: (event: LiveEvent) => void; onReconnect: () => void },
): () => void {
  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let retries = 0;
  let refreshOnReconnect = false;
  const connect = () => {
    if (disposed || document.hidden || !navigator.onLine) return;
    const apiUrl = new URL(getApiBaseUrl() || window.location.origin, window.location.origin);
    apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    apiUrl.pathname = path;
    apiUrl.search = new URLSearchParams(params).toString();
    const current = new WebSocket(apiUrl.toString());
    socket = current;
    current.onopen = () => {
      if (refreshOnReconnect) {
        refreshOnReconnect = false;
        handlers.onReconnect();
      }
      retries = 0;
    };
    current.onmessage = (message) => {
      let event: unknown;
      try { event = JSON.parse(message.data); }
      catch { return; }
      if (event && typeof event === "object") handlers.onEvent(event as LiveEvent);
    };
    current.onclose = () => {
      if (socket === current) socket = null;
      if (!disposed) {
        refreshOnReconnect = true;
      }
      if (!disposed && !document.hidden && navigator.onLine) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = 0;
          connect();
        }, Math.min(30_000, 1_000 * 2 ** Math.min(retries++, 5)));
      }
    };
    current.onerror = () => current.close();
  };
  const reconnectWhenVisible = () => {
    if (!document.hidden && navigator.onLine && !socket && !reconnectTimer) connect();
  };
  const handleOffline = () => {
    refreshOnReconnect = true;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    socket?.close(1000, "Network offline");
  };
  const handleOnline = () => {
    refreshOnReconnect = true;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    if (socket) {
      socket.close(1000, "Network restored");
      return;
    }
    reconnectWhenVisible();
  };
  document.addEventListener("visibilitychange", reconnectWhenVisible);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("online", handleOnline);
  connect();
  return () => {
    disposed = true;
    window.clearTimeout(reconnectTimer);
    document.removeEventListener("visibilitychange", reconnectWhenVisible);
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("online", handleOnline);
    socket?.close();
  };
}
