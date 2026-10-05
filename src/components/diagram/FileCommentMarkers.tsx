import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, MessageSquare } from "lucide-react";
import { apiFetch } from "@/lib/api";

export type FileCommentFeature = "drawing" | "flowchart";
export type FileCommentAnchor = { type: "point" | "shape"; id: string };
export type FileCommentMarkerConfig = {
  projectId: string;
  teamId: string;
  fileId: string;
  featureType: FileCommentFeature;
};
export type FileCommentMarkerData = {
  anchorType: FileCommentAnchor["type"];
  anchorId: string;
  status: "open" | "resolved";
  unreadCount: number;
};

type FileCommentsContext = {
  config: FileCommentMarkerConfig;
  markers: Map<string, FileCommentMarkerData>;
};

const Context = createContext<FileCommentsContext | null>(null);
const anchorKey = (anchor: FileCommentAnchor) => `${anchor.type}:${anchor.id}`;

export function FileCommentMarkersProvider({ config, children }: {
  config: FileCommentMarkerConfig;
  children: ReactNode;
}) {
  const [markers, setMarkers] = useState(new Map<string, FileCommentMarkerData>());
  const requestId = useRef(0);
  const base = `/api/projects/` + encodeURIComponent(config.projectId) + `/comments`;
  const query = `feature_type=` + config.featureType + `&file_id=` + encodeURIComponent(config.fileId);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    try {
      const response = await apiFetch(base + `/markers?` + query);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load comment markers.");
      const next = new Map<string, FileCommentMarkerData>();
      for (const item of body.markers || []) {
        const marker: FileCommentMarkerData = {
          anchorType: item.anchorType ?? item.anchor_type,
          anchorId: String(item.anchorId ?? item.anchor_id),
          status: item.status === "resolved" ? "resolved" : "open",
          unreadCount: Number(item.unreadCount ?? item.unread_count ?? 0),
        };
        next.set(anchorKey({ type: marker.anchorType, id: marker.anchorId }), marker);
      }
      if (current === requestId.current) setMarkers(next);
    } catch {
      // Markers are a convenience; a request failure must not block editing.
    }
  }, [base, query]);

  useEffect(() => {
    setMarkers(new Map());
    void refresh();
    const refreshIfCurrent = (detail: { teamId?: string; projectId?: string }) => {
      if (detail.teamId && detail.teamId !== config.teamId) return;
      if (detail.projectId && String(detail.projectId) !== config.projectId) return;
      void refresh();
    };
    const onUpdate = (event: Event) => refreshIfCurrent((event as CustomEvent<typeof config>).detail || {});
    const onWorkspaceSync = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string; eventType?: string }>).detail;
      if (detail?.eventType === "cloud.workspace.sync") refreshIfCurrent(detail);
    };
    const onReconnect = (event: Event) => refreshIfCurrent((event as CustomEvent<{ teamId?: string }>).detail || {});
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    window.addEventListener("collaboration-updated", onUpdate);
    window.addEventListener("cloud-workspace-sync", onWorkspaceSync);
    window.addEventListener("cloud-live-sync-reconnected", onReconnect);
    return () => {
      requestId.current++;
      window.clearInterval(interval);
      window.removeEventListener("collaboration-updated", onUpdate);
      window.removeEventListener("cloud-workspace-sync", onWorkspaceSync);
      window.removeEventListener("cloud-live-sync-reconnected", onReconnect);
    };
  }, [config, refresh]);

  const value = useMemo(() => ({ config, markers }), [config, markers]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFileCommentMarkers(): FileCommentsContext | null {
  return useContext(Context);
}

export function FileCommentMarker({ anchor }: { anchor: FileCommentAnchor }) {
  const comments = useFileCommentMarkers();
  const marker = comments?.markers.get(anchorKey(anchor));
  if (!comments || !marker) return null;

  const label = anchor.type === "shape" ? "Flowchart shape" : "Drawing element";
  const stateLabel = marker.status === "resolved" ? ", resolved" : marker.unreadCount ? ", " + marker.unreadCount + " unread" : "";
  const statusClass = marker.status === "resolved"
    ? "bg-foreground text-background"
    : "bg-sky-500 text-white dark:bg-sky-400 dark:text-slate-950";

  return (
    <button
      type="button"
      className="flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500"
      aria-label={label + " comments" + stateLabel}
      title={label + " comments" + stateLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("project-comment-open-request", {
          detail: {
            featureType: comments.config.featureType,
            fileId: comments.config.fileId,
            type: anchor.type,
            id: anchor.id,
          },
        }));
      }}
    >
      <span className={"flex size-5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none shadow-sm " + statusClass}>
        {marker.status === "resolved"
          ? <Check aria-hidden="true" className="size-2.5 stroke-[3]" />
          : marker.unreadCount > 0
            ? marker.unreadCount > 3 ? "3+" : marker.unreadCount
            : <MessageSquare aria-hidden="true" className="size-3" />}
      </span>
    </button>
  );
}
