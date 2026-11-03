export type RoutePoint = { x: number; y: number };
export type RouteObstacle = RoutePoint & { id?: string; width: number; height: number };

export function edgeRoutingObstacles(tables: RouteObstacle[], endpoints: RouteObstacle[]): RouteObstacle[] {
  const live = new Map(endpoints.filter(table => table.id !== undefined).map(table => [table.id, table]));
  return tables.map(table => live.get(table.id) ?? table);
}

export function segmentBlocked(a: RoutePoint, b: RoutePoint, obstacles: RouteObstacle[]) {
  return obstacles.some(r => a.x === b.x
    ? a.x > r.x && a.x < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height
    : a.y > r.y && a.y < r.y + r.height && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width);
}

/** SVG path through route points with each bend rounded by up to `radius`, never more than half of either neighbouring segment. */
export function roundedRoutePath(points: RoutePoint[], radius = 8) {
  const toward = (from: RoutePoint, to: RoutePoint, distance: number) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return length ? { x: from.x + (to.x - from.x) * distance / length, y: from.y + (to.y - from.y) * distance / length } : from;
  };
  return points.map((p, i) => {
    const prev = points[i - 1], next = points[i + 1];
    if (!prev || !next) return `${prev ? 'L' : 'M'}${p.x},${p.y}`;
    const r = Math.min(radius, Math.hypot(p.x - prev.x, p.y - prev.y) / 2, Math.hypot(next.x - p.x, next.y - p.y) / 2);
    const a = toward(p, prev, r), b = toward(p, next, r);
    return `L${a.x},${a.y} Q${p.x},${p.y} ${b.x},${b.y}`;
  }).join(' ');
}

type RoutePorts = { start: RoutePoint; end: RoutePoint; obstacles: RouteObstacle[] };

function routePorts(source: RoutePoint, target: RoutePoint, sourceRight: boolean, targetRight: boolean, tables: RouteObstacle[]): RoutePorts {
  return {
    start: { x: source.x + (sourceRight ? 16 : -16), y: source.y },
    end: { x: target.x + (targetRight ? 16 : -16), y: target.y },
    obstacles: tables.map(r => ({ x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 })),
  };
}

const routeIsClear = (points: RoutePoint[], obstacles: RouteObstacle[]) => points.slice(1).every((p, i) => !segmentBlocked(points[i], p, obstacles));

function selfReferenceRoute(source: RoutePoint, target: RoutePoint, sourceRight: boolean, start: RoutePoint): RoutePoint[] {
  const outside = start.x + (sourceRight ? 16 : -16);
  return [source, start, { x: start.x, y: start.y - 24 }, { x: outside, y: start.y - 24 }, { x: outside, y: target.y }, target];
}

/** The two single-turn routes, or null when both cross a table. */
function directRoute(source: RoutePoint, target: RoutePoint, { start, end, obstacles }: RoutePorts): RoutePoint[] | null {
  const simple = [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
  ].find(points => routeIsClear(points, obstacles));
  return simple ? [source, ...simple, target] : null;
}

// An enclosed port has no valid first/last segment; do not exhaust the entire visibility grid.
const portEnclosed = ({ start, end, obstacles }: RoutePorts) =>
  [start, end].some(p => obstacles.some(r => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height));

/** Shortest clear two-turn route along a table boundary, or null. */
function boundaryLaneRoute(source: RoutePoint, target: RoutePoint, { start, end, obstacles }: RoutePorts): RoutePoint[] | null {
  const lanes = [
    ...new Set(obstacles.flatMap(r => [r.y, r.y + r.height])),
  ].map(y => [start, { x: start.x, y }, { x: end.x, y }, end]).concat(
    [...new Set(obstacles.flatMap(r => [r.x, r.x + r.width]))]
      .map(x => [start, { x, y: start.y }, { x, y: end.y }, end]),
  );
  const length = (points: RoutePoint[]) => points.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y), 0);
  lanes.sort((a, b) => length(a) - length(b));
  const lane = lanes.find(points => routeIsClear(points, obstacles));
  return lane ? [source, ...lane, target] : null;
}

/**
 * Route for an edge whose table is being dragged: the grid search is skipped to keep each frame cheap.
 * When no direct or boundary-lane route is clear, the plain route may cross a table until the drop,
 * where `routeErdEdge` routes it fully; it never jumps to a far outside lane mid-drag (SH-004).
 */
export function routeErdEdgeWhileDragging(source: RoutePoint, target: RoutePoint, sourceRight: boolean, targetRight: boolean, tables: RouteObstacle[]): RoutePoint[] {
  const ports = routePorts(source, target, sourceRight, targetRight, tables);
  if (source.x === target.x && source.y === target.y) return selfReferenceRoute(source, target, sourceRight, ports.start);
  return directRoute(source, target, ports)
    ?? (portEnclosed(ports) ? null : boundaryLaneRoute(source, target, ports))
    ?? [source, ports.start, { x: ports.end.x, y: ports.start.y }, ports.end, target];
}

/** Orthogonal visibility grid around table boundaries, searched by Manhattan distance. */
export function routeErdEdge(source: RoutePoint, target: RoutePoint, sourceRight: boolean, targetRight: boolean, tables: RouteObstacle[]): RoutePoint[] {
  const ports = routePorts(source, target, sourceRight, targetRight, tables);
  const { start, end, obstacles } = ports;
  if (source.x === target.x && source.y === target.y) return selfReferenceRoute(source, target, sourceRight, start);
  const simple = directRoute(source, target, ports);
  if (simple) return simple;
  const outsideLane = () => {
    const y = Math.min(source.y, target.y, ...obstacles.map(r => r.y)) - 24;
    return [source, start, { x: start.x, y }, { x: end.x, y }, end, target];
  };
  if (portEnclosed(ports)) return outsideLane();
  // Try nearby table-boundary lanes before building a quadratic visibility grid for every FK.
  const lane = boundaryLaneRoute(source, target, ports);
  if (lane) return lane;
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(r => [r.x, r.x + r.width])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(r => [r.y, r.y + r.height])])].sort((a, b) => a - b);
  const key = (x: number, y: number) => y * xs.length + x;
  const point = (id: number) => ({ x: xs[id % xs.length], y: ys[Math.floor(id / xs.length)] });
  const first = key(xs.indexOf(start.x), ys.indexOf(start.y)), last = key(xs.indexOf(end.x), ys.indexOf(end.y));
  const distance = (p: RoutePoint) => Math.abs(p.x - end.x) + Math.abs(p.y - end.y);
  const costs = new Map([[first, 0]]), previous = new Map<number, number>();
  const open = [{ id: first, cost: distance(start) }];
  const before = (a: typeof open[number], b: typeof open[number]) => a.cost < b.cost || (a.cost === b.cost && a.id < b.id);
  const push = (entry: typeof open[number]) => {
    let i = open.length;
    open.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(entry, open[parent])) break;
      open[i] = open[parent]; i = parent;
    }
    open[i] = entry;
  };
  const pop = () => {
    const entry = open[0], tail = open.pop()!;
    if (open.length) {
      let i = 0;
      while (i * 2 + 1 < open.length) {
        let child = i * 2 + 1;
        if (child + 1 < open.length && before(open[child + 1], open[child])) child++;
        if (!before(open[child], tail)) break;
        open[i] = open[child]; i = child;
      }
      open[i] = tail;
    }
    return entry;
  };
  const visited = new Set<number>();
  while (open.length) {
    const id = pop().id;
    if (visited.has(id)) continue;
    if (id === last) {
      const route = [end];
      let cursor = id;
      while (previous.has(cursor)) { cursor = previous.get(cursor)!; route.push(point(cursor)); }
      const points = [source, ...route.reverse(), target];
      return points.filter((p, i) => !i || i === points.length - 1
        || !((points[i - 1].x === p.x && p.x === points[i + 1].x) || (points[i - 1].y === p.y && p.y === points[i + 1].y)));
    }
    visited.add(id);
    const x = id % xs.length, y = Math.floor(id / xs.length), a = point(id);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || nx >= xs.length || ny < 0 || ny >= ys.length) continue;
      const next = key(nx, ny), b = point(next);
      if (visited.has(next) || segmentBlocked(a, b, obstacles)) continue;
      const cost = costs.get(id)! + Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, cost); previous.set(next, id);
      push({ id: next, cost: cost + distance(b) });
    }
  }
  // Overlapping legacy tables can enclose a port; retain a readable outside lane until moved apart.
  return outsideLane();
}
