import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { sceneCoordsToViewportCoords } from '@excalidraw/excalidraw';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { FileCommentMarker, useFileCommentMarkers } from './FileCommentMarkers';

type MarkerPosition = { id: string; left: number; top: number };

export default function DrawingCommentMarkers({
  api,
  containerRef,
}: {
  api: ExcalidrawImperativeAPI;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const comments = useFileCommentMarkers();
  const [positions, setPositions] = useState<MarkerPosition[]>([]);
  const markers = useMemo(
    () => [...(comments?.markers.values() ?? [])].filter((marker) => marker.anchorType === 'point'),
    [comments?.markers],
  );

  const refresh = useCallback((elements?: readonly any[], appState?: any) => {
    const container = containerRef.current;
    if (!api || !comments || !container) {
      setPositions([]);
      return;
    }

    const sceneElements = elements ?? api.getSceneElements();
    const state = appState ?? api.getAppState();
    const elementById = new Map<string, OrderedExcalidrawElement>(
      sceneElements
        .filter((element) => element.isDeleted !== true)
        .map((element) => [String(element.id), element] as const),
    );
    const bounds = container.getBoundingClientRect();
    const next: MarkerPosition[] = [];
    for (const marker of markers) {
      const element = elementById.get(marker.anchorId);
      if (!element) continue;
      const point = sceneCoordsToViewportCoords({
        sceneX: element.x + (element.width ?? 0),
        sceneY: element.y,
      }, state);
      const left = point.x - bounds.left - 22;
      const top = point.y - bounds.top - 22;
      if (left < -22 || top < -22 || left > bounds.width || top > bounds.height) continue;
      next.push({ id: marker.anchorId, left, top });
    }
    setPositions(next);
  }, [api, comments, containerRef, markers]);

  useEffect(() => {
    if (!api || !comments) return;
    refresh();
    const unsubscribeChange = api.onChange((elements: readonly any[], appState: any) => refresh(elements, appState));
    const unsubscribeScroll = api.onScrollChange(() => refresh());
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => refresh());
    if (containerRef.current) observer?.observe(containerRef.current);
    return () => {
      unsubscribeChange();
      unsubscribeScroll();
      observer?.disconnect();
    };
  }, [api, comments, containerRef, refresh]);

  if (!comments || positions.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {positions.map((position) => (
        <div
          key={position.id}
          className="pointer-events-auto absolute"
          style={{ left: position.left, top: position.top }}
        >
          <FileCommentMarker anchor={{ type: 'point', id: position.id }} />
        </div>
      ))}
    </div>
  );
}
