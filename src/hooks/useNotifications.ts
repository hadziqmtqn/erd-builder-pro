import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { openLiveSocket } from "@/lib/live-socket";
import { normalizeNotification, type NotificationItem } from "@/lib/notifications";

type State = { items: NotificationItem[]; unreadCount: number; status: "loading" | "ready" | "error" };

/**
 * NOT-001.2 notification list for the bell. It refetches on focus, when the tab becomes visible, on the user's live
 * channel (NOT-001.5) and after local changes; there is no global polling interval (plan).
 */
export function useNotifications(enabled: boolean) {
  const [state, setState] = useState<State>({ items: [], unreadCount: 0, status: "loading" });
  const [live, setLive] = useState(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    try {
      const response = await apiFetch("/api/notifications?limit=30");
      if (!response.ok) throw new Error(`Notifications request failed (${response.status})`);
      const body = await response.json();
      if (id !== request.current) return;
      setLive(body.live === true);
      setState({
        items: Array.isArray(body.notifications) ? body.notifications.map(normalizeNotification) : [],
        unreadCount: Number(body.unread_count ?? body.unreadCount) || 0,
        status: "ready",
      });
    } catch {
      // A failed refresh keeps the last list; only a first load shows the error state.
      if (id === request.current) setState((current) => (current.status === "ready" ? current : { ...current, status: "error" }));
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onChange = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  // NOT-001.5: Cloud and Self-host wake the bell through the user's own channel; the list says whether this server has it.
  useEffect(() => {
    if (!enabled || !live) return;
    return openLiveSocket("/api/notifications/live", {}, {
      onReconnect: () => { void refresh(); },
      onEvent: (event) => {
        if (event.eventType === "notification.created" && typeof event.revision === "string" && event.revision) void refresh();
      },
    });
  }, [enabled, live, refresh]);

  const markRead = useCallback(async (id: string) => {
    setState((current) => {
      const target = current.items.find((item) => item.id === id);
      if (!target) return current;
      // The server reads the item's whole group, and the badge counts groups, so it drops by one (BUG-081).
      const unread = (item: NotificationItem) => !item.readAt && (item.id === id || (target.groupKey !== null && item.groupKey === target.groupKey));
      if (!current.items.some(unread)) return current;
      const readAt = new Date().toISOString();
      return { ...current, unreadCount: Math.max(0, current.unreadCount - 1), items: current.items.map((item) => (unread(item) ? { ...item, readAt } : item)) };
    });
    await apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }).catch(() => undefined);
    void refresh();
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    setState((current) => ({ ...current, unreadCount: 0, items: current.items.map((item) => (item.readAt ? item : { ...item, readAt })) }));
    await apiFetch("/api/notifications/read-all", { method: "POST" }).catch(() => undefined);
    void refresh();
  }, [refresh]);

  return { ...state, refresh, markRead, markAllRead };
}
