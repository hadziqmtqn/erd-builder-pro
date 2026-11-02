import { useEffect, useRef, type RefObject } from 'react';
import { getViewportForBounds, useReactFlow, useStoreApi, type Node } from '@xyflow/react';
import { useEditorActive } from '@/contexts/FileSessionContext';
import {
  ERD_CANVAS_FOCUS_EVENT,
  ERD_FOCUS_MAX_ZOOM,
  ERD_FOCUS_MIN_ZOOM,
  getERDTableNeighbourIds,
  type ERDCanvasFocusRequest,
} from '@/lib/erd-canvas-focus';

const FLASH_CLASS = 'erd-node-flash';
const FLASH_MS = 1500;
const PADDING = 0.2;
const MOVE_MS = 400;

// Glide to the target, or jump straight there when the viewer asked for reduced motion.
const moveDuration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : MOVE_MS;

const centerOf = (node: Node) => ({
  x: node.position.x + (node.measured?.width ?? node.width ?? 180) / 2,
  y: node.position.y + (node.measured?.height ?? node.height ?? 120) / 2,
});

/** Handles Properties panel requests to show a table or relationship on this pane's canvas. */
export function useERDCanvasFocus(canvasRef: RefObject<HTMLDivElement | null>, isActive: boolean) {
  const editorActive = useEditorActive();
  const { fitView, getNodes, getEdges, getNodesBounds, setCenter } = useReactFlow();
  const store = useStoreApi();
  const flashTimer = useRef<number | undefined>(undefined);
  // Refs keep the listener attached while tables are dragged; ERDView re-renders on every frame then.
  const activeRef = useRef(() => isActive && editorActive());
  activeRef.current = () => isActive && editorActive();

  useEffect(() => {
    // A class on the DOM node instead of node data: no re-render of every table and nothing to save.
    const flash = (nodeId: string) => {
      const element = canvasRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
      if (!element) return;
      canvasRef.current?.querySelectorAll(`.${FLASH_CLASS}`).forEach(item => item.classList.remove(FLASH_CLASS));
      void element.offsetWidth; // restart the animation when the same table is chosen again
      element.classList.add(FLASH_CLASS);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => element.classList.remove(FLASH_CLASS), FLASH_MS);
    };

    const onFocus = async (event: Event) => {
      if (!activeRef.current()) return;
      const request = (event as CustomEvent<ERDCanvasFocusRequest>).detail;
      if (!request?.id) return;

      if (request.type === 'table') {
        const node = getNodes().find(item => item.id === request.id);
        if (!node) return;
        // Take the zoom that fits the table and its neighbours, but centre on the table, in one movement.
        const { width, height } = store.getState();
        const bounds = getNodesBounds([node.id, ...getERDTableNeighbourIds(node.id, getEdges())]);
        const { zoom } = getViewportForBounds(bounds, width, height, ERD_FOCUS_MIN_ZOOM, ERD_FOCUS_MAX_ZOOM, PADDING);
        const center = centerOf(node);
        await setCenter(center.x, center.y, { zoom, duration: moveDuration() });
        flash(node.id);
        return;
      }

      const edge = getEdges().find(item => item.id === request.id);
      if (!edge) return;
      // Same selection a click on the line makes, without onEdgeClick, so the relationship modal stays closed.
      store.getState().addSelectedEdges([edge.id]);
      await fitView({
        nodes: [{ id: edge.source }, { id: edge.target }],
        padding: PADDING, minZoom: ERD_FOCUS_MIN_ZOOM, maxZoom: ERD_FOCUS_MAX_ZOOM, duration: moveDuration(),
      });
    };

    window.addEventListener(ERD_CANVAS_FOCUS_EVENT, onFocus);
    return () => {
      window.removeEventListener(ERD_CANVAS_FOCUS_EVENT, onFocus);
      window.clearTimeout(flashTimer.current);
    };
  }, [canvasRef, fitView, getNodes, getEdges, getNodesBounds, setCenter, store]);
}
