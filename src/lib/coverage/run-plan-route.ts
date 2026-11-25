import type { Feature, FeatureCollection, LineString, Position } from "geojson";

import { TWIN_RULES } from "./twin-rules";

/** Street piece used to assemble a continuous run plan. */
export type PlanSegment = {
  id: number;
  coordinates: Position[];
  lengthMeters: number;
  /** Already run by the athlete (runnable streets) — also true for navigation connectors. */
  covered: boolean;
  /**
   * False for pedestrian connectors (`footway` / `path` / `steps`) that bridge pockets
   * without counting toward city coverage %. Defaults to true when omitted.
   */
  countsForCoverage?: boolean;
  /** OSM street name, spoken in turn instructions. */
  name?: string | null;
};

export type PlanManeuverType = "left" | "right" | "slight-left" | "slight-right" | "u-turn" | "arrive";

/** One spoken instruction, placed on a vertex of the route so path and guidance cannot drift apart. */
export type RunPlanManeuver = {
  type: PlanManeuverType;
  /** Street taken after the maneuver; null when OSM has no name for it. */
  name: string | null;
  /** Index into `RunPlanRoute.coordinates`. */
  index: number;
};

export type PlanLegKind = "conquest" | "bridge" | "connector" | "jump";

export type RunPlanLeg = {
  coordinates: Position[];
  kind: PlanLegKind;
};

export type RunPlanRoute = {
  /** Continuous path the athlete can follow. */
  coordinates: Position[];
  /** Uncovered length along the path — drives the conquest % estimate. */
  uncoveredMeters: number;
  /** Full path length including covered bridges and fill. */
  pathMeters: number;
  start: Position | null;
  /**
   * GPS→network entry only (anchored starts). Mid-route aerial hops stay disabled.
   * Kept for API compatibility with mobile clients that read jump diagnostics.
   */
  jumpCount: number;
  jumpMeters: number;
  /** Styled legs for the map (gold conquest vs gray connectors). */
  legs: RunPlanLeg[];
  /** Every unfinished street reachable from the start is on the route. */
  coversAll: boolean;
  /** Path length at the moment the last unfinished street was added; null when the route stops short. */
  completeAtMeters: number | null;
  /** Turns at real junctions, in route order, ending with the arrival. */
  maneuvers: RunPlanManeuver[];
};

export type RunPlanRouteOptions = {
  /** Target outing length in meters (clamped by the caller). */
  budgetMeters: number;
  /** Snap / junction tolerance when joining segment ends. */
  joinToleranceMeters?: number;
  /** Max length of already-covered bridging between unfinished streets. */
  maxBridgeMeters?: number;
  /**
   * Diversifies the start among central uncovered streets.
   * Same salt → same route; change it on regenerate for a different outing.
   */
  salt?: number;
  /** Anchors the route at this [lng, lat] (the athlete's position) and only grows forward from it. */
  start?: Position;
  /** Keep enough budget to run back, and end where the route starts. */
  loop?: boolean;
  /**
   * Steer a loop outward early and homeward late. Off for the finishing walk: the steer depends on the
   * budget, and the finish estimate must describe the same walk whatever budget is chosen later.
   */
  homewardSteer?: boolean;
};

/**
 * Bridge cap used when a plan must finish the city: wide enough to cross any town. The finish estimate
 * and the finishing plan share it, so a budget at or above the estimate walks the same streets.
 */
export const FINISH_BRIDGE_METERS = 4_500;
/** Longest outing the app offers; a city needing more is not finished in one run. */
export const MAX_FINISH_BUDGET_METERS = 30_000;

/** Endpoint clustering — wide enough to join real OSM junctions without inventing block shortcuts. */
/**
 * Endpoints this close are one junction. Streets are cut where they really meet ({@link cutAtJunctions}), so
 * this only absorbs rounding and the seam between two cities; a wider net merges whole squares into one point.
 */
const DEFAULT_JOIN_TOLERANCE_METERS = 1;
/** Grid used to start in the densest remaining unfinished neighbourhood. */
const DENSITY_CELL_METERS = 280;
/** Longest street walk allowed to reach the first unfinished street from an anchored start. */
const MAX_START_CONNECTOR_METERS = 2_500;
/** Regenerating an anchored plan rotates among this many nearest unfinished streets. */
const ANCHORED_SEED_CHOICES = 4;
/**
 * Max GPS→graph snap when anchoring. Beyond this, the athlete is off-network and the plan
 * refuses the start rather than drawing a long aerial chord to the seed.
 * ~1.5 km covers courtyard drift and standing just across a neighbouring commune border.
 */
export const MAX_ANCHOR_SNAP_METERS = 1_500;

/** Below this, GPS is treated as already on the snap node (no approach jump). */
const ANCHOR_JUMP_MIN_METERS = 5;
/**
 * Longest straight link drawn between the athlete and the street network: the pavement to the nearest
 * junction. Further than that there are blocks in between, and a line through them is not a route.
 */
export const MAX_STRAIGHT_LINK_METERS = 60;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Haversine distance in meters between two [lng, lat] positions. */
export function distanceMeters(from: Position, to: Position): number {
  const [lng1, lat1] = from as [number, number];
  const [lng2, lat2] = to as [number, number];
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

/**
 * Covered-bridge budget: walk already-run streets only to reach the next unfinished pocket.
 * Generous enough to cross a neighbourhood, still bounded so a 5 km outing doesn't detour 3 km.
 */
export function bridgeBudgetMeters(budgetMeters: number, override?: number): number {
  if (override != null) return override;
  // Wider bridges so 8 / 12 km preferences can leave a local pocket via covered streets.
  return Math.min(4_500, Math.max(480, budgetMeters * 0.4));
}

/**
 * Degrees to expand the uncovered-street envelope when fetching the plan graph.
 * Longer outings need a wider street pocket so the walk can keep growing.
 */
export function planPocketExpandDegrees(budgetMeters: number): number {
  const radiusMeters = Math.min(14_000, Math.max(800, budgetMeters * 0.9));
  return radiusMeters / 111_320;
}

function midpoint(coordinates: Position[]): Position {
  return coordinates[Math.floor(coordinates.length / 2)]!;
}

function centroidOf(positions: Position[]): Position {
  const lng = positions.reduce((sum, [x]) => sum + x!, 0) / positions.length;
  const lat = positions.reduce((sum, [, y]) => sum + y!, 0) / positions.length;
  return [lng, lat];
}

function endsOf(segment: PlanSegment): { start: Position; end: Position } {
  return {
    start: segment.coordinates[0]!,
    end: segment.coordinates[segment.coordinates.length - 1]!,
  };
}

function dedupe(path: Position[]): Position[] {
  const coordinates: Position[] = [];
  for (const point of path) {
    const last = coordinates[coordinates.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    coordinates.push(point);
  }
  return coordinates;
}

function isCoverageSegment(segment: PlanSegment): boolean {
  return segment.countsForCoverage !== false;
}

function legKindForEdge(edge: { covered: boolean; countsForCoverage: boolean }): PlanLegKind {
  if (!edge.countsForCoverage) return "connector";
  return edge.covered ? "bridge" : "conquest";
}

type NodeId = number;

type DirectedEdge = {
  /** Place of this edge in {@link StreetGraph.edges}: what a search keeps its books by. */
  index: number;
  segmentId: number;
  from: NodeId;
  to: NodeId;
  lengthMeters: number;
  covered: boolean;
  countsForCoverage: boolean;
  coordinates: Position[];
  name: string | null;
  /** The other carriageways of this street ({@link twinSegments}): running one of them runs this one. */
  twins: readonly Twin[];
};
type Twin = { segmentId: number; lengthMeters: number; unfinished: boolean };

type StreetGraph = {
  nodes: Position[];
  edges: DirectedEdge[];
  outgoing: Map<NodeId, DirectedEdge[]>;
  /** segment id → { startNode, endNode } for the forward coordinate order. */
  segmentNodes: Map<number, { start: NodeId; end: NodeId }>;
};

/**
 * Cluster endpoints within join tolerance into shared nodes, then build a bidirectional graph.
 */
function buildStreetGraph(segments: readonly PlanSegment[], joinToleranceMeters: number): StreetGraph {
  // Never changed once built, and every walk of one request is over the same streets.
  let graphs = streetGraphs.get(segments);
  if (!graphs) streetGraphs.set(segments, (graphs = new Map()));
  let graph = graphs.get(joinToleranceMeters);
  if (!graph) graphs.set(joinToleranceMeters, (graph = joinStreets(segments, joinToleranceMeters)));
  return graph;
}
const streetGraphs = new WeakMap<readonly PlanSegment[], Map<number, StreetGraph>>();

function joinStreets(segments: readonly PlanSegment[], joinToleranceMeters: number): StreetGraph {
  const endpoints: Position[] = [];
  for (const segment of segments) {
    if (segment.coordinates.length < 2) continue;
    endpoints.push(segment.coordinates[0]!, segment.coordinates[segment.coordinates.length - 1]!);
  }

  const parent = endpoints.map((_, index) => index);
  function find(index: number): number {
    let current = index;
    while (parent[current] !== current) current = parent[current]!;
    let walk = index;
    while (parent[walk] !== walk) {
      const next = parent[walk]!;
      parent[walk] = current;
      walk = next;
    }
    return current;
  }
  function union(a: number, b: number) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  const cellDeg = joinToleranceMeters / 111_320;
  const cells = new Map<string, number[]>();
  for (let i = 0; i < endpoints.length; i++) {
    const point = endpoints[i]!;
    const cx = Math.floor(point[0]! / cellDeg);
    const cy = Math.floor(point[1]! / cellDeg);
    const key = `${cx},${cy}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  }
  for (let i = 0; i < endpoints.length; i++) {
    const point = endpoints[i]!;
    const cx = Math.floor(point[0]! / cellDeg);
    const cy = Math.floor(point[1]! / cellDeg);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (j <= i) continue;
          if (distanceMeters(point, endpoints[j]!) <= joinToleranceMeters) union(i, j);
        }
      }
    }
  }

  const rootToNode = new Map<number, NodeId>();
  const nodes: Position[] = [];
  const sums = new Map<number, { lng: number; lat: number; count: number }>();
  for (let i = 0; i < endpoints.length; i++) {
    const root = find(i);
    const point = endpoints[i]!;
    const acc = sums.get(root) ?? { lng: 0, lat: 0, count: 0 };
    acc.lng += point[0]!;
    acc.lat += point[1]!;
    acc.count += 1;
    sums.set(root, acc);
  }
  for (const [root, acc] of sums) {
    rootToNode.set(root, nodes.length);
    nodes.push([acc.lng / acc.count, acc.lat / acc.count]);
  }

  const outgoing = new Map<NodeId, DirectedEdge[]>();
  const segmentNodes = new Map<number, { start: NodeId; end: NodeId }>();
  const edges: DirectedEdge[] = [];
  function addEdge(street: Omit<DirectedEdge, "index">) {
    const edge = { ...street, index: edges.length };
    edges.push(edge);
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  const twins = twinSegments(segments);
  let endpointCursor = 0;
  for (const segment of segments) {
    if (segment.coordinates.length < 2) continue;
    const { covered } = segment;
    const twinsLeft = (twins.get(segment.id) ?? []).map((twin) => ({
      segmentId: twin.id,
      lengthMeters: twin.lengthMeters,
      unfinished: !twin.covered && isCoverageSegment(twin),
    }));
    const start = rootToNode.get(find(endpointCursor++))!;
    const end = rootToNode.get(find(endpointCursor++))!;
    segmentNodes.set(segment.id, { start, end });
    if (start === end) continue;
    const countsForCoverage = isCoverageSegment(segment);
    addEdge({
      segmentId: segment.id,
      from: start,
      to: end,
      lengthMeters: segment.lengthMeters,
      covered,
      countsForCoverage,
      coordinates: segment.coordinates,
      name: segment.name ?? null,
      twins: twinsLeft,
    });
    addEdge({
      segmentId: segment.id,
      from: end,
      to: start,
      lengthMeters: segment.lengthMeters,
      covered,
      countsForCoverage,
      coordinates: [...segment.coordinates].reverse(),
      name: segment.name ?? null,
      twins: twinsLeft,
    });
  }

  return { nodes, edges, outgoing, segmentNodes };
}

/**
 * For each segment, the segments of the same street running alongside it. OSM draws each carriageway of a
 * boulevard as its own line; to a runner they are one street, and running one of them has run it.
 */
function twinSegments(segments: readonly PlanSegment[]): Map<number, PlanSegment[]> {
  const cellDeg = 60 / 111_320;
  const lines = segments
    // Only streets of the city itself: a neighbour's copy of a boundary street credits nothing here.
    .filter((segment) => isCoverageSegment(segment) && segment.name != null && segment.coordinates.length >= 2)
    .map((segment) => {
      const { start, end } = endsOf(segment);
      return {
        segment,
        tips: [start, end].map((tip) => `${tip[0]!.toFixed(6)},${tip[1]!.toFixed(6)}`),
        middle: midpoint([start, end]),
        bearing: bearingDegrees(start, end),
        half: distanceMeters(start, end) / 2,
      };
    });
  const cells = new Map<string, typeof lines>();
  const cellOf = (point: Position) => [Math.floor(point[0]! / cellDeg), Math.floor(point[1]! / cellDeg)] as const;
  for (const line of lines) {
    const key = cellOf(line.middle).join(",");
    cells.set(key, [...(cells.get(key) ?? []), line]);
  }
  const twins = new Map<number, PlanSegment[]>();
  for (const line of lines) {
    const [cx, cy] = cellOf(line.middle);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (other.segment.id === line.segment.id || other.segment.name !== line.segment.name) continue;
          // Carriageways run apart: two pieces meeting end to end are one street going round a bend.
          if (other.tips.some((tip) => line.tips.includes(tip))) continue;
          const angle = Math.abs(((other.bearing - line.bearing + 270) % 180) - 90);
          if (angle > TWIN_RULES.maxAngleDegrees) continue;
          const apart = distanceMeters(line.middle, other.middle);
          const offset = toRadians(bearingDegrees(line.middle, other.middle) - line.bearing);
          if (Math.abs(apart * Math.sin(offset)) > TWIN_RULES.maxApartMeters) continue;
          // Alongside, not ahead: the next piece of the same street is no twin.
          if (Math.abs(apart * Math.cos(offset)) > Math.max(line.half, other.half)) continue;
          twins.set(line.segment.id, [...(twins.get(line.segment.id) ?? []), other.segment]);
        }
      }
    }
  }
  return twins;
}

/**
 * Cuts every street at the points it shares with another one. Imported streets are cut every 50 m, not at
 * crossings: a street met halfway along a piece has no endpoint there, and without this cut no junction.
 * The pieces of a street get ids of their own, past the highest one.
 */
function cutAtJunctions(segments: readonly PlanSegment[]): PlanSegment[] {
  const keyOf = (point: Position) => `${point[0]!.toFixed(6)},${point[1]!.toFixed(6)}`;
  const streetsAt = new Map<string, number>();
  for (const segment of segments) {
    for (const key of new Set(segment.coordinates.map(keyOf))) streetsAt.set(key, (streetsAt.get(key) ?? 0) + 1);
  }
  let nextId = segments.reduce((highest, segment) => Math.max(highest, segment.id), 0) + 1;
  return segments.flatMap((segment) => {
    const cuts = segment.coordinates
      .map((point, index) => ({ index, shared: (streetsAt.get(keyOf(point)) ?? 0) > 1 }))
      .filter(({ index, shared }) => shared && index > 0 && index < segment.coordinates.length - 1)
      .map(({ index }) => index);
    if (cuts.length === 0) return [segment];
    const drawn = (points: Position[]) =>
      points.slice(1).reduce((meters, point, index) => meters + distanceMeters(points[index]!, point), 0);
    const whole = drawn(segment.coordinates) || 1;
    return [0, ...cuts].map((from, piece) => {
      const coordinates = segment.coordinates.slice(from, (cuts[piece] ?? segment.coordinates.length - 1) + 1);
      return {
        ...segment,
        id: nextId++,
        coordinates,
        lengthMeters: (segment.lengthMeters * drawn(coordinates)) / whole,
      };
    });
  });
}

/**
 * The streets as the planner needs them: one of each, twins credited, then cut where they meet.
 * One request asks for the same streets several times over, and a city is thousands of them: prepared once.
 */
const preparedStreets = new WeakMap<readonly PlanSegment[], PlanSegment[]>();
function streetsAsRun(streets: readonly PlanSegment[]): PlanSegment[] {
  let prepared = preparedStreets.get(streets);
  if (!prepared) {
    prepared = cutAtJunctions(withTwinsCredited(withoutCopies(streets)));
    preparedStreets.set(streets, prepared);
  }
  return prepared;
}

/**
 * A street on the boundary is stored once per city, drawn on the same points. Left in, the copy is another
 * street to the search, and turning back onto it is not turning back. The city's own piece is the one kept.
 */
function withoutCopies(segments: readonly PlanSegment[]): PlanSegment[] {
  const drawnOn = (segment: PlanSegment) => {
    const points = segment.coordinates.map((point) => `${point[0]!.toFixed(6)},${point[1]!.toFixed(6)}`);
    return (points[0]! < points[points.length - 1]! ? points : points.reverse()).join(" ");
  };
  const kept = new Map<string, PlanSegment>();
  for (const segment of segments) {
    const key = drawnOn(segment);
    if (!kept.has(key) || (isCoverageSegment(segment) && !isCoverageSegment(kept.get(key)!))) kept.set(key, segment);
  }
  return [...kept.values()];
}

/** The streets as the runner sees them: a carriageway whose twin is run needs no run of its own. */
function withTwinsCredited(segments: readonly PlanSegment[]): PlanSegment[] {
  const twins = twinSegments(segments);
  return segments.map((segment) =>
    !segment.covered && twins.get(segment.id)?.some((twin) => twin.covered) ? { ...segment, covered: true } : segment,
  );
}

function isConquestEdge(edge: DirectedEdge): boolean {
  return !edge.covered && edge.countsForCoverage;
}

/**
 * Shortest path (by meters) from `from` to any unused uncovered edge tip, walking only unused
 * covered edges / connectors — used to bridge between unfinished pockets without breaking continuity.
 */
function findBridgeToUncovered(
  graph: StreetGraph,
  from: NodeId,
  usedSegments: ReadonlySet<number>,
  maxBridgeMeters: number,
): DirectedEdge[] | null {
  // Ranked by `cost`, capped by real `meters`: a street already run this outing costs triple, so the
  // bridge goes around the block when it can and only runs back along a dead end when it must.
  type State = { node: NodeId; path: DirectedEdge[]; meters: number; cost: number };
  const queue: State[] = [{ node: from, path: [], meters: 0, cost: 0 }];
  const best = new Map<NodeId, number>([[from, 0]]);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (current.cost > (best.get(current.node) ?? Infinity)) continue;

    for (const edge of graph.outgoing.get(current.node) ?? []) {
      const nextMeters = current.meters + edge.lengthMeters;
      if (nextMeters > maxBridgeMeters) continue;

      if (isConquestEdge(edge) && !usedSegments.has(edge.segmentId)) {
        return current.path;
      }

      const nextCost = current.cost + edge.lengthMeters * (usedSegments.has(edge.segmentId) ? 3 : 1);
      const known = best.get(edge.to);
      if (known != null && known <= nextCost) continue;
      best.set(edge.to, nextCost);
      queue.push({ node: edge.to, path: [...current.path, edge], meters: nextMeters, cost: nextCost });
    }
  }
  return null;
}

function unusedUncoveredLengthAt(graph: StreetGraph, node: NodeId, usedSegments: ReadonlySet<number>): number {
  let meters = 0;
  const seen = new Set<number>();
  for (const edge of graph.outgoing.get(node) ?? []) {
    if (!isConquestEdge(edge) || usedSegments.has(edge.segmentId) || seen.has(edge.segmentId)) continue;
    seen.add(edge.segmentId);
    meters += edge.lengthMeters;
  }
  return meters;
}

/**
 * Prefer the unfinished street that unlocks the most remaining unexplored length at the far end.
 * `fits` rejects streets the budget cannot afford; `steer` adds a per-edge bonus (loop shaping).
 */
function pickUncoveredEdge(
  edges: DirectedEdge[],
  usedSegments: ReadonlySet<number>,
  graph: StreetGraph,
  fits: (edge: DirectedEdge) => boolean = () => true,
  steer: (edge: DirectedEdge) => number = () => 0,
): DirectedEdge | null {
  let best: DirectedEdge | null = null;
  let bestScore = -Infinity;
  for (const edge of edges) {
    if (usedSegments.has(edge.segmentId) || !isConquestEdge(edge) || !fits(edge)) continue;
    const usedNext = new Set(usedSegments);
    usedNext.add(edge.segmentId);
    const score = edge.lengthMeters + unusedUncoveredLengthAt(graph, edge.to, usedNext) * 0.7 + steer(edge);
    if (score > bestScore) {
      best = edge;
      bestScore = score;
    }
  }
  return best;
}

/** Cheapest walk from `from` to every node (binary heap: a whole city is one pass). */
function walkCosts(
  graph: StreetGraph,
  from: NodeId,
  costOf: (edge: DirectedEdge) => number,
): { cost: Map<NodeId, number>; via: Map<NodeId, DirectedEdge> } {
  const cost = new Map<NodeId, number>([[from, 0]]);
  const via = new Map<NodeId, DirectedEdge>();
  const heap: [number, NodeId][] = [[0, from]];
  while (heap.length > 0) {
    const [current, node] = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let small = i;
        if (left < heap.length && heap[left]![0] < heap[small]![0]) small = left;
        if (right < heap.length && heap[right]![0] < heap[small]![0]) small = right;
        if (small === i) break;
        [heap[i], heap[small]] = [heap[small]!, heap[i]!];
        i = small;
      }
    }
    if (current > (cost.get(node) ?? Infinity)) continue;
    for (const edge of graph.outgoing.get(node) ?? []) {
      const next = current + costOf(edge);
      if (next >= (cost.get(edge.to) ?? Infinity)) continue;
      cost.set(edge.to, next);
      via.set(edge.to, edge);
      heap.push([next, edge.to]);
      for (let i = heap.length - 1; i > 0;) {
        const parent = (i - 1) >> 1;
        if (heap[parent]![0] <= heap[i]![0]) break;
        [heap[i], heap[parent]] = [heap[parent]!, heap[i]!];
        i = parent;
      }
    }
  }
  return { cost, via };
}

/** An out-and-back shorter than this is a normal cul-de-sac visit and stays in the route. */
const MIN_DETOUR_CORRIDOR_METERS = 150;

/**
 * Unfinished streets of detours that are not worth their way back: stretches where the route runs a
 * corridor out, turns around somewhere, and runs the same corridor home, for less than twice the
 * corridor in new street. Long dead ends and pockets behind a single street end up here.
 */
function wastefulDetourSegments(walked: readonly DirectedEdge[]): Set<number> {
  const wasteful = new Set<number>();
  const lastIndex = new Map<number, number>();
  for (let j = 0; j < walked.length; j++) {
    const i = lastIndex.get(walked[j]!.segmentId);
    lastIndex.set(walked[j]!.segmentId, j);
    // Only the first street of a retrace: the next ones belong to the same corridor.
    if (i == null || (j > 0 && i + 1 < j && walked[j - 1]!.segmentId === walked[i + 1]!.segmentId)) continue;
    let reach = 0;
    let corridorMeters = 0;
    while (
      i - reach >= 0 &&
      j + reach < walked.length &&
      walked[i - reach]!.segmentId === walked[j + reach]!.segmentId
    ) {
      corridorMeters += walked[j + reach]!.lengthMeters;
      reach += 1;
    }
    if (corridorMeters < MIN_DETOUR_CORRIDOR_METERS) continue;
    const gained = new Map<number, number>();
    for (const edge of walked.slice(i - reach + 1, j))
      if (isConquestEdge(edge)) gained.set(edge.segmentId, edge.lengthMeters);
    let gainedMeters = 0;
    for (const meters of gained.values()) gainedMeters += meters;
    if (gainedMeters < corridorMeters * 2) for (const segmentId of gained.keys()) wasteful.add(segmentId);
  }
  return wasteful;
}

function bearingDegrees(from: Position, to: Position): number {
  const lat1 = toRadians(from[1]!);
  const lat2 = toRadians(to[1]!);
  const deltaLng = toRadians(to[0]! - from[0]!);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Heading read over this many metres either side of a junction, so a kinked last vertex doesn't fake a turn. */
const TURN_SIGHT_METERS = 15;

/** First vertex at least `TURN_SIGHT_METERS` from `index` walking `step` (-1 back, +1 ahead). */
function sightVertex(coordinates: Position[], index: number, step: 1 | -1): Position {
  let walked = 0;
  let cursor = index;
  while (coordinates[cursor + step] && walked < TURN_SIGHT_METERS) {
    walked += distanceMeters(coordinates[cursor]!, coordinates[cursor + step]!);
    cursor += step;
  }
  return coordinates[cursor]!;
}

/**
 * Turn type from the change of heading at a vertex; null when the runner just keeps going.
 * Exported for the thresholds' tests.
 */
export function turnType(deltaDegrees: number): PlanManeuverType | null {
  const delta = ((((deltaDegrees + 180) % 360) + 360) % 360) - 180;
  const size = Math.abs(delta);
  if (size < 30) return null;
  if (size > 155) return "u-turn";
  const side = delta > 0 ? "right" : "left";
  return size < 55 ? `slight-${side}` : side;
}

function pickFromWindow<T>(ranked: T[], windowSize: number, salt: number): T {
  const window = Math.min(windowSize, ranked.length);
  const index = ((salt % window) + window) % window;
  return ranked[index]!;
}

function densityCellDegrees(): number {
  return DENSITY_CELL_METERS / 111_320;
}

function indexUncoveredDensity(uncovered: readonly PlanSegment[]): Map<string, number> {
  const cellDeg = densityCellDegrees();
  const metersByCell = new Map<string, number>();
  for (const segment of uncovered) {
    const mid = midpoint(segment.coordinates);
    const key = `${Math.floor(mid[0]! / cellDeg)},${Math.floor(mid[1]! / cellDeg)}`;
    metersByCell.set(key, (metersByCell.get(key) ?? 0) + segment.lengthMeters);
  }
  return metersByCell;
}

function neighborhoodUncoveredMeters(point: Position, metersByCell: Map<string, number>): number {
  const cellDeg = densityCellDegrees();
  const cx = Math.floor(point[0]! / cellDeg);
  const cy = Math.floor(point[1]! / cellDeg);
  let meters = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      meters += metersByCell.get(`${cx + dx},${cy + dy}`) ?? 0;
    }
  }
  return meters;
}

/**
 * Map each unfinished segment id → total uncovered metres in its on-network pocket.
 * One flood-fill pass so seed ranking stays cheap on large cities.
 */
function indexUncoveredComponentMeters(graph: StreetGraph, uncovered: readonly PlanSegment[]): Map<number, number> {
  const metersBySegment = new Map<number, number>();
  // Nodes are shared across floods: a node already flooded belongs to a pocket whose segments are
  // all ranked, so re-flooding it (from a segment missing from the graph) only repeated work —
  // on Paris that re-walked the largest pocket ~1,300 times.
  const seenNode = new Set<NodeId>();
  for (const { id: startId } of uncovered) {
    if (metersBySegment.has(startId)) continue;
    const nodes = graph.segmentNodes.get(startId);
    if (!nodes) {
      metersBySegment.set(startId, 0);
      continue;
    }
    const seenSeg = new Set<number>();
    const queue: NodeId[] = [nodes.start, nodes.end].filter((node) => !seenNode.has(node));
    for (const node of queue) seenNode.add(node);
    let meters = 0;
    while (queue.length > 0) {
      const node = queue.pop()!;
      for (const edge of graph.outgoing.get(node) ?? []) {
        if (!isConquestEdge(edge) || seenSeg.has(edge.segmentId)) continue;
        seenSeg.add(edge.segmentId);
        meters += edge.lengthMeters;
        if (!seenNode.has(edge.to)) {
          seenNode.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    for (const segmentId of seenSeg) metersBySegment.set(segmentId, meters);
    if (!seenSeg.has(startId)) metersBySegment.set(startId, 0);
  }
  return metersBySegment;
}

function pickSeed(
  uncovered: PlanSegment[],
  metersByCell: Map<string, number>,
  salt: number,
  graph: StreetGraph,
): PlanSegment {
  const componentMeters = indexUncoveredComponentMeters(graph, uncovered);
  // Rank keys computed once per segment — the comparator used to recompute density per comparison.
  const ranked = uncovered
    .map((segment) => ({
      segment,
      component: componentMeters.get(segment.id) ?? 0,
      density: neighborhoodUncoveredMeters(midpoint(segment.coordinates), metersByCell),
    }))
    .sort((a, b) => {
      // Prefer the largest unfinished pocket so 12 km plans do not start in a 1 km cul-de-sac.
      if (a.component !== b.component) return b.component - a.component;
      if (a.density !== b.density) return b.density - a.density;
      return a.segment.id - b.segment.id;
    })
    .map((entry) => entry.segment);
  return pickFromWindow(ranked, 8, salt);
}

/**
 * Score an unfinished street for an anchored start: enter at the end nearer the athlete,
 * and prefer the piece whose far end unlocks the most remaining uncovered length.
 */
function anchoredSeedScore(segment: PlanSegment, start: Position, graph: StreetGraph): number {
  const ends = endsOf(segment);
  const distStart = distanceMeters(start, ends.start);
  const distEnd = distanceMeters(start, ends.end);
  const nearDist = Math.min(distStart, distEnd);
  const nodes = graph.segmentNodes.get(segment.id);
  if (!nodes) return -nearDist;
  const enterAtStart = distStart <= distEnd;
  const farNode = enterAtStart ? nodes.end : nodes.start;
  const used = new Set<number>([segment.id]);
  return unusedUncoveredLengthAt(graph, farNode, used) * 10 + segment.lengthMeters - nearDist;
}

function pickAnchoredSeed(
  uncovered: PlanSegment[],
  start: Position,
  salt: number,
  graph: StreetGraph,
  snapNode: NodeId,
): PlanSegment | null {
  // One pass from the athlete instead of two searches per street. A walk to either end never needs
  // the street itself: crossing it would reach its other end first.
  const fromAthlete = walkCosts(graph, snapNode, (edge) => edge.lengthMeters).cost;
  const reachable = uncovered.filter((segment) => {
    const nodes = graph.segmentNodes.get(segment.id);
    if (!nodes) return false;
    const nearest = Math.min(fromAthlete.get(nodes.start) ?? Infinity, fromAthlete.get(nodes.end) ?? Infinity);
    return nearest <= MAX_START_CONNECTOR_METERS;
  });
  if (reachable.length === 0) return null;
  const componentMeters = indexUncoveredComponentMeters(graph, reachable);
  const ranked = [...reachable].sort((a, b) => {
    const componentDelta = (componentMeters.get(b.id) ?? 0) - (componentMeters.get(a.id) ?? 0);
    if (componentDelta !== 0) return componentDelta;
    const scoreDelta = anchoredSeedScore(b, start, graph) - anchoredSeedScore(a, start, graph);
    if (scoreDelta !== 0) return scoreDelta;
    return a.id - b.id;
  });
  return pickFromWindow(ranked, ANCHORED_SEED_CHOICES, salt);
}

function nearestNode(
  graph: StreetGraph,
  point: Position,
  maxDistanceMeters = Infinity,
): { node: NodeId; distanceMeters: number } | null {
  let best: NodeId | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const dist = distanceMeters(point, graph.nodes[i]!);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  if (best == null || bestDist > maxDistanceMeters) return null;
  return { node: best, distanceMeters: bestDist };
}

/** Shortest street walk (by meters) between two nodes over unused edges, or null beyond `maxMeters`. */
function shortestPath(
  graph: StreetGraph,
  from: NodeId,
  to: NodeId,
  usedSegments: ReadonlySet<number>,
  maxMeters: number,
): DirectedEdge[] | null {
  if (from === to) return [];
  type State = { node: NodeId; path: DirectedEdge[]; meters: number };
  const queue: State[] = [{ node: from, path: [], meters: 0 }];
  const best = new Map<NodeId, number>([[from, 0]]);

  while (queue.length > 0) {
    queue.sort((a, b) => a.meters - b.meters);
    const current = queue.shift()!;
    if (current.node === to) return current.path;
    if (current.meters > (best.get(current.node) ?? Infinity)) continue;

    for (const edge of graph.outgoing.get(current.node) ?? []) {
      if (usedSegments.has(edge.segmentId)) continue;
      const nextMeters = current.meters + edge.lengthMeters;
      if (nextMeters > maxMeters) continue;
      const known = best.get(edge.to);
      if (known != null && known <= nextMeters) continue;
      best.set(edge.to, nextMeters);
      queue.push({ node: edge.to, path: [...current.path, edge], meters: nextMeters });
    }
  }
  return null;
}

/** Turns at real junctions along `walked`, then the arrival. `keptIndex` maps raw vertices to `coordinates`. */
function maneuversAlong(
  graph: StreetGraph,
  walked: readonly DirectedEdge[],
  coordinates: Position[],
  keptIndex: readonly number[],
): RunPlanManeuver[] {
  const maneuvers: RunPlanManeuver[] = [];
  let rawIndex = (walked[0]?.coordinates.length ?? 1) - 1;
  for (let i = 0; i + 1 < walked.length; i++) {
    const current = walked[i]!;
    const next = walked[i + 1]!;
    const index = keptIndex[rawIndex]!;
    rawIndex += next.coordinates.length - 1;
    const turnsBack = next.segmentId === current.segmentId;
    const branches = new Set((graph.outgoing.get(current.to) ?? []).map((edge) => edge.segmentId)).size;
    // Two streets meeting is a bend, not a choice: nothing to say.
    if (!turnsBack && branches < 3) continue;
    const heading =
      bearingDegrees(coordinates[index]!, sightVertex(coordinates, index, 1)) -
      bearingDegrees(sightVertex(coordinates, index, -1), coordinates[index]!);
    const type = turnsBack ? "u-turn" : turnType(heading);
    if (type) maneuvers.push({ type, name: next.name, index });
  }
  maneuvers.push({ type: "arrive", name: null, index: coordinates.length - 1 });
  return maneuvers;
}

/** Ends a loop on the athlete's exact position instead of the nearest junction; returns the metres added. */
function closeOnAnchor(
  coordinates: Position[],
  legs: RunPlanLeg[],
  maneuvers: RunPlanManeuver[],
  anchor: Position,
): number {
  const networkExit = coordinates[coordinates.length - 1]!;
  const meters = distanceMeters(networkExit, anchor);
  if (meters < ANCHOR_JUMP_MIN_METERS) return 0;
  coordinates.push(anchor);
  legs.push({ coordinates: [networkExit, anchor], kind: "jump" });
  const arrival = maneuvers[maneuvers.length - 1];
  if (arrival?.type === "arrive") arrival.index = coordinates.length - 1;
  return meters;
}

/** Nodes left once dead-end branches are peeled off: every one of them has a way on that is not the way in. */
function throughNodes(graph: StreetGraph): Set<NodeId> {
  const open = new Map<NodeId, Map<number, NodeId>>();
  for (const [node, edges] of graph.outgoing) open.set(node, new Map(edges.map((edge) => [edge.segmentId, edge.to])));
  const leaves = [...open].filter(([, edges]) => edges.size <= 1).map(([node]) => node);
  while (leaves.length > 0) {
    const leaf = leaves.pop()!;
    const edges = open.get(leaf);
    if (!edges) continue;
    open.delete(leaf);
    for (const [segmentId, far] of edges) {
      const farEdges = open.get(far);
      if (!farEdges) continue;
      farEdges.delete(segmentId);
      if (farEdges.size <= 1) leaves.push(far);
    }
  }
  return new Set(open.keys());
}

/**
 * What a loop may spend searching, in streets visited: the one cost that grows with the city and with how
 * scattered its unfinished streets are. Counted rather than timed, so the same request always gets the same
 * route. Once spent, planning keeps the best it has: a few million visits is a second or two of a server.
 */
type Effort = { left: number };
const COLLECTION_EFFORT = 2_500_000;
const ROUND_TRIP_EFFORT = 2_500_000;

/** What a metre costs the loop search: new street is cheap, a street already in this loop nearly forbidden. */
const NEW_STREET_COST = 0.45;
const REPEAT_COST = 12;

/**
 * Cheapest walks from `from`, never turning back on the street it arrives by. The search runs on directed
 * streets rather than junctions, which is what makes a U-turn unrepresentable. `turnAtDeadEnds` lifts the ban
 * where a street simply stops: there is no other way out.
 *
 * A search that answers "again" is kept between questions: asking for another destination carries on where
 * the last one stopped, and answers exactly what a fresh search would. `taken` must not change in between.
 * Null when no walk leads there; undefined when none costs less than `costBelow`, without looking further.
 */
function streetSearch(
  graph: StreetGraph,
  { from, arrivedBy, taken, maxMeters, turnAtDeadEnds = false, effort }: Walking,
  answers: "once" | "again",
): (reached: (edge: DirectedEdge) => boolean, costBelow?: number) => DirectedEdge[] | null | undefined {
  const { edges } = graph;
  // A search asked once is over before the next begins: they all write in the graph's one book.
  const book = answers === "once" ? sharedBook(graph) : newBook(graph);
  const search = (book.search += 1);
  const { cost, meters, via, seenIn } = book;
  // The heap, as two columns: no street visited allocates anything.
  const heapCost: number[] = [];
  const heapEdge: number[] = [];
  const push = (edgeCost: number, edge: number) => {
    let i = heapCost.length;
    heapCost.push(edgeCost);
    heapEdge.push(edge);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapCost[parent]! <= edgeCost) break;
      heapCost[i] = heapCost[parent]!;
      heapEdge[i] = heapEdge[parent]!;
      i = parent;
    }
    heapCost[i] = edgeCost;
    heapEdge[i] = edge;
  };
  const dropTop = () => {
    const lastCost = heapCost.pop()!;
    const lastEdge = heapEdge.pop()!;
    const size = heapCost.length;
    if (size === 0) return;
    heapCost[0] = lastCost;
    heapEdge[0] = lastEdge;
    for (let i = 0; ;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let small = i;
      if (left < size && heapCost[left]! < heapCost[small]!) small = left;
      if (right < size && heapCost[right]! < heapCost[small]!) small = right;
      if (small === i) break;
      const [smallCost, smallEdge] = [heapCost[small]!, heapEdge[small]!];
      heapCost[small] = heapCost[i]!;
      heapEdge[small] = heapEdge[i]!;
      heapCost[i] = smallCost;
      heapEdge[i] = smallEdge;
      i = small;
    }
  };
  const extend = (soFar: number, node: NodeId, by: number) => {
    const ways = graph.outgoing.get(node) ?? [];
    const deadEnd = turnAtDeadEnds && isDeadEnd(graph, node);
    const arrivedOn = (by < 0 ? arrivedBy : edges[by])?.segmentId;
    const metersSoFar = by < 0 ? 0 : meters[by]!;
    for (const edge of ways) {
      if (!deadEnd && edge.segmentId === arrivedOn) continue;
      const walked = metersSoFar + edge.lengthMeters;
      if (walked > maxMeters) continue;
      const weight = taken.has(edge.segmentId) ? REPEAT_COST : isConquestEdge(edge) ? NEW_STREET_COST : 1;
      const next = soFar + edge.lengthMeters * weight;
      const { index } = edge;
      if (seenIn[index] === search && next >= cost[index]!) continue;
      seenIn[index] = search;
      cost[index] = next;
      meters[index] = walked;
      via[index] = by;
      push(next, index);
    }
  };
  const pathTo = (last: number) => {
    const path: DirectedEdge[] = [];
    for (let edge = last; edge >= 0; edge = via[edge]!) path.unshift(edges[edge]!);
    return path;
  };
  /** Streets whose cheapest walk is known, nearest first: the order a fresh search would meet them in. */
  const settled: number[] = [];
  extend(0, from, -1);
  return (reached, costBelow = Infinity) => {
    for (const edge of settled) {
      if (cost[edge]! >= costBelow) return undefined;
      if (reached(edges[edge]!)) return pathTo(edge);
    }
    while (heapCost.length > 0) {
      const edgeCost = heapCost[0]!;
      if (edgeCost >= costBelow) return undefined;
      const edge = heapEdge[0]!;
      dropTop();
      if (effort) effort.left -= 1;
      // Left behind by a cheaper walk to the same street found since.
      if (edgeCost > cost[edge]!) continue;
      settled.push(edge);
      extend(edgeCost, edges[edge]!.to, edge);
      if (reached(edges[edge]!)) return pathTo(edge);
    }
    return null;
  };
}

/** Where a search starts and what it may walk. */
type Walking = {
  from: NodeId;
  arrivedBy: DirectedEdge | null;
  taken: ReadonlySet<number>;
  maxMeters: number;
  turnAtDeadEnds?: boolean;
  effort?: Effort;
};

/** What a search knows of each street, by {@link DirectedEdge.index}; `seenIn` tells whose entry it is. */
type SearchBook = { cost: Float64Array; meters: Float64Array; via: Int32Array; seenIn: Uint32Array; search: number };
const sharedBooks = new WeakMap<StreetGraph, SearchBook>();
function newBook({ edges }: StreetGraph): SearchBook {
  return {
    cost: new Float64Array(edges.length),
    meters: new Float64Array(edges.length),
    via: new Int32Array(edges.length),
    seenIn: new Uint32Array(edges.length),
    search: 0,
  };
}
function sharedBook(graph: StreetGraph): SearchBook {
  let book = sharedBooks.get(graph);
  if (!book) sharedBooks.set(graph, (book = newBook(graph)));
  return book;
}

/** Cheapest walk from `from` to the first street `reached` accepts: one question to a {@link streetSearch}. */
function walkWithoutTurningBack(
  graph: StreetGraph,
  walking: Walking,
  reached: (edge: DirectedEdge) => boolean,
): DirectedEdge[] | null {
  return streetSearch(graph, walking, "once")(reached) ?? null;
}

/**
 * Nearest junction to the athlete that the rest of the city can be reached from. A stray piece of street
 * (a courtyard, a path cut off by the join tolerance) may be nearer, and no loop leaves it.
 */
function nearestConnectedNode(graph: StreetGraph, point: Position): NodeId | undefined {
  const ranked = graph.nodes
    .map((position, node) => ({ node, meters: distanceMeters(point, position) }))
    .filter((entry) => entry.meters <= MAX_ANCHOR_SNAP_METERS)
    .sort((a, b) => a.meters - b.meters);
  const stranded = new Set<NodeId>();
  for (const { node } of ranked) {
    if (stranded.has(node)) continue;
    const reachable = walkCosts(graph, node, (edge) => edge.lengthMeters).cost;
    if (reachable.size * 2 >= graph.nodes.length) return node;
    for (const other of reachable.keys()) stranded.add(other);
  }
  return undefined;
}

/** A junction with one street out: the way in is the only way back. */
function isDeadEnd(graph: StreetGraph, node: NodeId): boolean {
  const ways = graph.outgoing.get(node) ?? [];
  return ways.every((edge) => edge.segmentId === ways[0]!.segmentId);
}

/** Street distance is about this much longer than the straight line between the same points. */
const STREET_DETOUR_FACTOR = 1.35;
/** What one doubling-back costs a loop when candidates are ranked: enough to lose to any clean loop. */
const HAIRPIN_PENALTY_METERS = 600;
/** Going round a roundabout or a block to come back the way you came, within this much: a U-turn too. */
const TURNAROUND_METERS = 250;
/** How close to the junction where the runner came in they must be back for a way round to count. */
const TURNAROUND_GAP_METERS = 15;
/** An unfinished dead end shorter than this is run twice for little: left for the run that finishes the city. */
const SHORT_DEAD_END_METERS = 300;

/** What a drawn loop is worth: new street, minus each street run twice and each time the runner turns back. */
function loopWorth({ newMeters, repeatMeters, hairpins }: WalkedLoop & { hairpins: number }): number {
  return newMeters - 4 * repeatMeters - HAIRPIN_PENALTY_METERS * hairpins;
}

/** Loops kept for "another route": the best ones, each a different shape. */
const ROUND_TRIP_CHOICES = 5;

/** Pockets up to this many streets have every order tried; larger ones cost too many searches. */
const POCKET_LOOKAHEAD_STREETS = 5;

/** Marks a street as run in this loop, with its other carriageways; returns the unfinished metres those add. */
function take(taken: Set<number>, edge: DirectedEdge): number {
  taken.add(edge.segmentId);
  let twinMeters = 0;
  for (const twin of edge.twins) {
    if (twin.unfinished && !taken.has(twin.segmentId)) twinMeters += twin.lengthMeters;
    taken.add(twin.segmentId);
  }
  return twinMeters;
}

type WalkedLoop = { walked: DirectedEdge[]; meters: number; newMeters: number; repeatMeters: number };
type RoundTrip = WalkedLoop & { score: number };

const drawnMetersByEdge = new WeakMap<DirectedEdge, number>();
function drawnMeters(edge: DirectedEdge): number {
  let meters = drawnMetersByEdge.get(edge);
  if (meters == null) {
    meters = 0;
    for (let i = 1; i < edge.coordinates.length; i++)
      meters += distanceMeters(edge.coordinates[i - 1]!, edge.coordinates[i]!);
    drawnMetersByEdge.set(edge, meters);
  }
  return meters;
}

/** A walk as the runner will see it: its length on the drawn line, what is new, what is run twice. */
function measureWalk(walked: DirectedEdge[]): WalkedLoop & { hairpins: number } {
  const seen = new Set<number>();
  // Measured on the line the runner will follow: street lengths miss the gaps where streets are joined.
  let meters = 0;
  let newMeters = 0;
  let repeatMeters = 0;
  let hairpins = 0;
  let tip: Position | undefined;
  let heading: number | undefined;
  const legs: Leg[] = [];
  for (const edge of walked) {
    const points = edge.coordinates;
    if (tip) meters += distanceMeters(tip, points[0]!);
    const startMeters = meters;
    meters += drawnMeters(edge);
    // A waypoint on a small triangle of streets is left by doubling back along its other side:
    // not a U-turn on one street, but it runs like one.
    // Read from where the runner stands, as the maneuvers are: joined streets rarely share an exact vertex.
    if (tip && heading != null && turnType(bearingDegrees(tip, points[1]!) - heading) === "u-turn") hairpins += 1;
    heading = bearingDegrees(points[points.length - 2]!, points[points.length - 1]!);
    tip = points[points.length - 1];
    legs.push({
      from: points[0]!,
      to: tip!,
      headingIn: bearingDegrees(points[0]!, points[1]!),
      headingOut: heading,
      startMeters,
      endMeters: meters,
    });
    if (seen.has(edge.segmentId)) repeatMeters += edge.lengthMeters;
    else if (isConquestEdge(edge)) newMeters += edge.lengthMeters;
    newMeters += take(seen, edge);
  }
  return { walked, meters, newMeters, repeatMeters, hairpins: hairpins + waysRoundAndBack(legs) };
}

/** One street of a walk: where it starts and ends, the heading in and out, and how far into the walk. */
export type Leg = {
  from: Position;
  to: Position;
  headingIn: number;
  headingOut: number;
  startMeters: number;
  endMeters: number;
};

/**
 * Times a walk goes round a roundabout or a small block only to come back out where it went in, heading back
 * the way it came. No single turn is a U-turn, but it runs as one, and the runner sees it as one.
 */
export function waysRoundAndBack(legs: readonly Leg[]): number {
  let count = 0;
  let countedUpTo = -1;
  for (const [index, leg] of legs.entries()) {
    // Back at the junction a street brought them to, leaving it the way they came. At least one street in
    // between: leaving straight back down the same street is a hairpin, counted as such.
    for (let back = index - 2; back > countedUpTo; back--) {
      const arrival = legs[back]!;
      if (leg.startMeters - arrival.endMeters > TURNAROUND_METERS) break;
      if (distanceMeters(arrival.to, leg.from) > TURNAROUND_GAP_METERS) continue;
      if (turnType(leg.headingIn - arrival.headingOut) !== "u-turn") continue;
      count += 1;
      countedUpTo = index;
      break;
    }
  }
  return count;
}

/**
 * Loops drawn before they are filled: for each direction and size, two waypoints are set on a circle around
 * the start and joined start → A → B → start by {@link walkWithoutTurningBack}. Deciding the shape first is
 * what keeps a loop from doubling back; the cost of a metre is what steers it onto unfinished streets.
 */
function roundTrips(graph: StreetGraph, home: NodeId, budgetMeters: number): RoundTrip[] {
  const through = [...throughNodes(graph)];
  const origin = graph.nodes[home]!;
  const metersPerLng = 111_320 * Math.cos(toRadians(origin[1]!));
  const nearestThrough = (point: Position, reach: number): NodeId | null => {
    let best: NodeId | null = null;
    let bestMeters = reach;
    for (const node of through) {
      const meters = distanceMeters(point, graph.nodes[node]!);
      if (meters < bestMeters) {
        best = node;
        bestMeters = meters;
      }
    }
    return best;
  };

  // Every loop leaves home on untaken streets: one search answers the first leg of all of them.
  const effort: Effort = { left: ROUND_TRIP_EFFORT };
  const fromHome = streetSearch(
    graph,
    { from: home, arrivedBy: null, taken: new Set(), maxMeters: budgetMeters, effort },
    "again",
  );
  const drawn = new Set<string>();
  const trips = new Map<string, RoundTrip>();
  // The circles likeliest to give the distance asked are drawn first: they are the ones a search short of
  // effort must not miss.
  for (const scale of [1, 0.9, 1.1, 0.8, 1.2, 0.7, 1.35, 0.6]) {
    for (const spread of [30, 50, 75]) {
      // Triangle start → A → B → start: two sides of `radius` and the chord between the waypoints.
      const straightLine = 2 + 2 * Math.sin(toRadians(spread));
      const radius = (budgetMeters / STREET_DETOUR_FACTOR / straightLine) * scale;
      for (let bearing = 0; bearing < 360 && effort.left > 0; bearing += 30) {
        const waypoint = (offset: number) => {
          const angle = toRadians(bearing + offset);
          const point = [
            origin[0]! + (radius * Math.sin(angle)) / metersPerLng,
            origin[1]! + (radius * Math.cos(angle)) / 111_320,
          ];
          // Past the edge of the city there is no junction near the circle: that direction has no loop.
          return nearestThrough(point, radius * 0.5);
        };
        const first = waypoint(-spread);
        const second = waypoint(spread);
        if (first == null || second == null || first === second || first === home || second === home) continue;
        // Waypoints that snap to the same two junctions as an earlier circle draw the same loop again.
        const waypoints = `${first},${second}`;
        if (drawn.has(waypoints)) continue;
        drawn.add(waypoints);

        const walked: DirectedEdge[] = [];
        const taken = new Set<number>();
        // Only a loop within a tenth of the distance asked is kept: a leg that cannot fit is not searched.
        let roomMeters = budgetMeters * 1.1;
        let complete = true;
        for (const [from, to] of [
          [home, first],
          [first, second],
          [second, home],
        ] as const) {
          const reached = (edge: DirectedEdge) => edge.to === to;
          const arrivedBy = walked[walked.length - 1] ?? null;
          const leg = arrivedBy
            ? walkWithoutTurningBack(
                graph,
                { from, arrivedBy, taken, maxMeters: Math.min(budgetMeters, roomMeters), effort },
                reached,
              )
            : fromHome(reached);
          for (const edge of leg ?? []) {
            walked.push(edge);
            take(taken, edge);
            roomMeters -= drawnMeters(edge);
          }
          if (leg == null || roomMeters < 0) {
            complete = false;
            break;
          }
        }
        if (!complete || walked.length === 0) continue;

        const measured = measureWalk(walked);
        const { meters, newMeters, repeatMeters } = measured;
        // A runner forgives a loop a little short or long far more easily than a street run twice.
        const score = loopWorth(measured) - 1.5 * Math.abs(meters - budgetMeters);
        const shape = walked
          .map((edge) => edge.segmentId)
          .sort((a, b) => a - b)
          .join(",");
        if (score > (trips.get(shape)?.score ?? -Infinity))
          trips.set(shape, { walked, meters, newMeters, repeatMeters, score });
      }
    }
  }
  return [...trips.values()].sort((a, b) => b.score - a.score);
}

/** Unfinished streets that touch each other: one stop of a collection loop. */
type Pocket = { segments: Set<number>; nodes: Set<NodeId>; center: Position; meters: number };

function unfinishedPockets(graph: StreetGraph, reachable: ReadonlyMap<NodeId, number>): Pocket[] {
  const pockets: Pocket[] = [];
  const pocketed = new Set<number>();
  for (const [node, edges] of graph.outgoing) {
    if (!reachable.has(node)) continue;
    for (const first of edges) {
      if (!isConquestEdge(first) || pocketed.has(first.segmentId)) continue;
      const pocket: Pocket = { segments: new Set(), nodes: new Set(), center: [0, 0], meters: 0 };
      const ends: Position[] = [];
      const queue = [first];
      pocketed.add(first.segmentId);
      while (queue.length > 0) {
        const edge = queue.pop()!;
        pocket.segments.add(edge.segmentId);
        pocket.meters += edge.lengthMeters;
        pocket.nodes.add(edge.from).add(edge.to);
        ends.push(graph.nodes[edge.from]!, graph.nodes[edge.to]!);
        for (const node of [edge.from, edge.to]) {
          for (const next of graph.outgoing.get(node) ?? []) {
            if (!isConquestEdge(next) || pocketed.has(next.segmentId)) continue;
            pocketed.add(next.segmentId);
            queue.push(next);
          }
        }
      }
      pocket.center = centroidOf(ends);
      pockets.push(pocket);
    }
  }
  return pockets;
}

/**
 * Visiting order for a closed tour from `home`: nearest neighbour, then 2-opt until no swap shortens it.
 * A 2-opt tour never crosses itself as the crow flies, which is what keeps the streets from crossing.
 */
function tourOrder<T extends { center: Position }>(home: Position, stops: readonly T[]): T[] {
  const left = [...stops];
  const tour: T[] = [];
  let at = home;
  while (left.length > 0) {
    let nearest = 0;
    for (let i = 1; i < left.length; i++)
      if (distanceMeters(at, left[i]!.center) < distanceMeters(at, left[nearest]!.center)) nearest = i;
    tour.push(left.splice(nearest, 1)[0]!);
    at = tour[tour.length - 1]!.center;
  }
  const point = (index: number) => (index < 0 || index >= tour.length ? home : tour[index]!.center);
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        const before = distanceMeters(point(i - 1), point(i)) + distanceMeters(point(j), point(j + 1));
        const after = distanceMeters(point(i - 1), point(j)) + distanceMeters(point(i), point(j + 1));
        if (after + 1e-6 >= before) continue;
        tour.splice(i, j - i + 1, ...tour.slice(i, j + 1).reverse());
        improved = true;
      }
    }
  }
  return tour;
}

/**
 * A loop for a city that is mostly finished: what is left is scraps, and no circle drawn around the start
 * strings them together. The scraps are put in tour order, then joined by {@link walkWithoutTurningBack};
 * the ones that cost the most detour for the least new street are dropped until the loop fits the budget.
 * Null when one unfinished pocket alone outgrows the budget: that city wants a round trip.
 */
function collectionLoop(
  graph: StreetGraph,
  home: NodeId,
  budgetMeters: number,
  reversed: boolean,
  leaveOut: (pocket: Pocket) => boolean = () => false,
): (WalkedLoop & { coversAll: boolean }) | null {
  const reachable = walkCosts(graph, home, (edge) => edge.lengthMeters).cost;
  const origin = graph.nodes[home]!;
  const everyStop = tourOrder(
    origin,
    unfinishedPockets(graph, reachable).filter((pocket) => !leaveOut(pocket)),
  );
  const limitMeters = budgetMeters * 1.1;
  const effort: Effort = { left: COLLECTION_EFFORT };
  const pocketOf = new Map<number, Pocket>();
  for (const pocket of everyStop) for (const id of pocket.segments) pocketOf.set(id, pocket);

  /** `takenIn` counts each pocket's streets already run, so what is left of one is never counted again. */
  type Walk = {
    walked: DirectedEdge[];
    taken: Set<number>;
    takenIn: Map<Pocket, number>;
    cost: number;
    meters: number;
  };
  const copyOf = (walk: Walk): Walk => ({
    ...walk,
    walked: [...walk.walked],
    taken: new Set(walk.taken),
    takenIn: new Map(walk.takenIn),
  });
  const leftOf = (pocket: Pocket, walk: Walk) => pocket.segments.size - (walk.takenIn.get(pocket) ?? 0);
  const step = (walk: Walk, edge: DirectedEdge) => {
    const weight = walk.taken.has(edge.segmentId) ? REPEAT_COST : isConquestEdge(edge) ? NEW_STREET_COST : 1;
    walk.cost += edge.lengthMeters * weight;
    // The length the runner will see, summed as measureWalk does: it is what the budget is held against.
    const tip = walk.walked[walk.walked.length - 1]?.coordinates.at(-1);
    walk.meters += (tip ? distanceMeters(tip, edge.coordinates[0]!) : 0) + drawnMeters(edge);
    walk.walked.push(edge);
    for (const id of [edge.segmentId, ...edge.twins.map((twin) => twin.segmentId)]) {
      if (walk.taken.has(id)) continue;
      walk.taken.add(id);
      const pocket = pocketOf.get(id);
      if (pocket) walk.takenIn.set(pocket, (walk.takenIn.get(pocket) ?? 0) + 1);
    }
  };
  const searchFrom = (walk: Walk, answers: "once" | "again") => {
    const arrivedBy = walk.walked[walk.walked.length - 1] ?? null;
    const from = arrivedBy?.to ?? home;
    const walking = { from, arrivedBy, taken: walk.taken, maxMeters: Infinity, turnAtDeadEnds: true, effort };
    return streetSearch(graph, walking, answers);
  };
  const walkTo = (walk: Walk, reached: (edge: DirectedEdge) => boolean): boolean => {
    const leg = searchFrom(walk, "once")(reached);
    for (const edge of leg ?? []) step(walk, edge);
    return leg != null;
  };
  // Two orders through the same streets cost the same to the last bit or so: a search is only cut short
  // where it is over by more than rounding, so the order kept is the one comparing whole walks keeps.
  const clearlyOver = (cost: number) => cost + 1e-6;
  const leftIn = (pocket: Pocket, walk: Walk) => (edge: DirectedEdge) =>
    pocket.segments.has(edge.segmentId) && !walk.taken.has(edge.segmentId);

  /**
   * Cheapest way through what is left of a pocket, counting the leg that leaves it. The nearest street first
   * can strand the others behind a repeat, so every order and direction is tried; `bound` prunes the rest.
   */
  const throughPocket = (
    walk: Walk,
    pocket: Pocket,
    leave: (walk: Walk) => ((edge: DirectedEdge) => boolean) | null,
    bound: number,
  ): { walk: Walk; cost: number } | null => {
    const left = [...pocket.nodes]
      .flatMap((node) => graph.outgoing.get(node) ?? [])
      .filter((edge) => pocket.segments.has(edge.segmentId) && !walk.taken.has(edge.segmentId));
    if (left.length === 0) {
      // The way out costs at least what the search says: past the bound, it is not worth walking.
      const next = leave(walk);
      const wayOut = next ? searchFrom(walk, "once")(next, clearlyOver(bound - walk.cost)) : null;
      if (wayOut === undefined) return null;
      const onward = copyOf(walk);
      for (const edge of wayOut ?? []) step(onward, edge);
      return onward.cost < bound ? { walk, cost: onward.cost } : null;
    }
    let best: { walk: Walk; cost: number } | null = null;
    let cheapest = bound;
    // Every street tried next is reached from the same place: one search finds them all.
    const search = searchFrom(walk, "again");
    for (const target of left) {
      if (effort.left <= 0) break;
      const leg = search((edge) => edge === target, clearlyOver(cheapest - walk.cost));
      if (!leg) continue;
      const trial = copyOf(walk);
      for (const edge of leg) step(trial, edge);
      if (trial.cost >= cheapest) continue;
      const through = throughPocket(trial, pocket, leave, cheapest);
      if (!through) continue;
      best = through;
      cheapest = through.cost;
    }
    return best;
  };

  /**
   * What the pocket costs taking the nearest street each time. It is one of the orders tried, so the best
   * order costs no more: searching under it from the first try leaves every dearer walk unexplored.
   */
  const nearestFirstCost = (
    walk: Walk,
    pocket: Pocket,
    leave: (walk: Walk) => ((edge: DirectedEdge) => boolean) | null,
  ): number => {
    const greedy = copyOf(walk);
    while (leftOf(pocket, greedy) > 0) if (!walkTo(greedy, leftIn(pocket, greedy))) return Infinity;
    const next = leave(greedy);
    if (next) walkTo(greedy, next);
    return clearlyOver(greedy.cost);
  };

  /** "too-long" as soon as the walk outgrows the budget: the rest of it could only make it longer. */
  type Tour = (WalkedLoop & { taken: Set<number> }) | "too-long" | null;
  const walkTour = (stops: readonly Pocket[]): Tour => {
    let walk: Walk = { walked: [], taken: new Set(), takenIn: new Map(), cost: 0, meters: 0 };
    const order = reversed ? [...stops].reverse() : stops;
    for (const [index, pocket] of order.entries()) {
      const after = order[index + 1];
      // Nowhere to go when the next stop was run in passing: a search cut short must not read as "too far".
      const leave = (from: Walk) => {
        if (!after) return (edge: DirectedEdge) => edge.to === home;
        return leftOf(after, from) > 0 ? leftIn(after, from) : null;
      };
      for (;;) {
        if (walk.meters > limitMeters) return "too-long";
        const left = leftOf(pocket, walk);
        // Nothing left here: searching the whole city for one more street would only say so.
        if (left === 0) break;
        if (left >= 2 && left <= POCKET_LOOKAHEAD_STREETS && effort.left > 0) {
          const through = throughPocket(walk, pocket, leave, nearestFirstCost(walk, pocket, leave));
          // Out of effort before one order was walked to its end: the nearest street first, as larger pockets.
          if (!through && effort.left <= 0) continue;
          walk = through?.walk ?? walk;
          break;
        }
        if (!walkTo(walk, leftIn(pocket, walk))) break;
      }
    }
    if (walk.meters > limitMeters) return "too-long";
    const { walked, taken } = walk;
    if (walked.length === 0) return null;
    if (walked[walked.length - 1]!.to !== home && !walkTo(walk, (edge) => edge.to === home)) return null;
    return { ...measureWalk(walked), taken };
  };
  const fits = (tour: Tour): tour is WalkedLoop & { taken: Set<number> } =>
    tour != null && tour !== "too-long" && tour.meters <= limitMeters;

  // Over budget, stops are dropped least worthy first. That order is known before any walk, and fewer
  // stops make a shorter loop: halving finds the first tour that fits in a dozen walks, not one per stop.
  const dropped = leastWorthFirst(origin, everyStop);
  const stopsAfter = (drops: number) => {
    const gone = new Set(dropped.slice(0, drops));
    return everyStop.filter((stop) => !gone.has(stop));
  };
  const tours = new Map<number, Tour>();
  const tourAfter = (drops: number): Tour => {
    if (!tours.has(drops)) tours.set(drops, walkTour(stopsAfter(drops)));
    return tours.get(drops)!;
  };
  let tooFew = 0;
  let enough = everyStop.length;
  while (tooFew < enough) {
    const drops = (tooFew + enough) >> 1;
    const tour = tourAfter(drops);
    // A tour that cannot be walked at all ends the search as one that fits does.
    if (tour == null || fits(tour)) enough = drops;
    else tooFew = drops + 1;
  }
  let tour = tourAfter(enough);
  if (!fits(tour)) return null;

  // A dropped street the loop runs past looks forgotten: take it back while the loop still fits.
  let stops = new Set(stopsAfter(enough));
  let passed = new Set(tour.walked.map((edge) => edge.to));
  const isPassed = (pocket: Pocket) => {
    const [few, many] = pocket.nodes.size < passed.size ? [pocket.nodes, passed] : [passed, pocket.nodes];
    for (const node of few) if (many.has(node)) return true;
    return false;
  };
  for (const pocket of everyStop) {
    if (effort.left <= 0) break;
    if (stops.has(pocket) || !isPassed(pocket)) continue;
    const withIt = everyStop.filter((stop) => stop === pocket || stops.has(stop));
    const longer = walkTour(withIt);
    if (fits(longer)) {
      stops = new Set(withIt);
      tour = longer;
      passed = new Set(tour.walked.map((edge) => edge.to));
    }
  }
  const { taken, ...loop } = tour;
  return { ...loop, coversAll: unfinishedIn(graph).every((id) => taken.has(id)) };
}

/**
 * The order a tour's stops are given up in when it is over budget: each time, the one that buys the least
 * new street per metre of detour between its neighbours still on the tour.
 */
function leastWorthFirst(home: Position, stops: readonly Pocket[]): Pocket[] {
  const before = stops.map((_, index) => index - 1);
  const after = stops.map((_, index) => index + 1);
  const center = (index: number) => (index < 0 || index >= stops.length ? home : stops[index]!.center);
  const worthOf = (index: number) => {
    const pocket = stops[index]!;
    const detour =
      distanceMeters(center(before[index]!), pocket.center) +
      distanceMeters(pocket.center, center(after[index]!)) -
      distanceMeters(center(before[index]!), center(after[index]!));
    return pocket.meters / (pocket.meters + detour * STREET_DETOUR_FACTOR + 1);
  };
  const worth = stops.map((_, index) => worthOf(index));
  const onTour = stops.map(() => true);
  const order: Pocket[] = [];
  while (order.length < stops.length) {
    let worst = -1;
    let leastWorth = Infinity;
    for (let index = 0; index < stops.length; index++) {
      if (!onTour[index]) continue;
      if (worst < 0) worst = index;
      if (worth[index]! < leastWorth) {
        worst = index;
        leastWorth = worth[index]!;
      }
    }
    order.push(stops[worst]!);
    onTour[worst] = false;
    const [previous, next] = [before[worst]!, after[worst]!];
    if (previous >= 0) {
      after[previous] = next;
      worth[previous] = worthOf(previous);
    }
    if (next < stops.length) {
      before[next] = previous;
      worth[next] = worthOf(next);
    }
  }
  return order;
}

/** Unfinished streets in short dead ends: what a run that does not finish the city leaves out. */
function shortDeadEndStreets(segments: readonly PlanSegment[], options: RunPlanRouteOptions): Set<number> {
  const graph = buildStreetGraph(segments, options.joinToleranceMeters ?? DEFAULT_JOIN_TOLERANCE_METERS);
  const everywhere = new Map(graph.nodes.map((_, node) => [node, 0]));
  const streets = new Set<number>();
  for (const pocket of unfinishedPockets(graph, everywhere))
    if (isShortDeadEnd(graph, pocket)) for (const id of pocket.segments) streets.add(id);
  return streets;
}

/** A short unfinished street the runner can only leave by turning back. */
function isShortDeadEnd(graph: StreetGraph, pocket: Pocket): boolean {
  if (pocket.meters >= SHORT_DEAD_END_METERS) return false;
  for (const node of pocket.nodes) if (isDeadEnd(graph, node)) return true;
  return false;
}

function unfinishedIn(graph: StreetGraph): number[] {
  const ids = new Set<number>();
  for (const edges of graph.outgoing.values())
    for (const edge of edges) if (isConquestEdge(edge)) ids.add(edge.segmentId);
  return [...ids];
}

/**
 * A loop from the athlete's position (or from the densest unfinished pocket) sized to the budget, or null
 * when the streets around offer no loop of that size: a single street, a village of dead ends.
 */
function planLoop(segments: readonly PlanSegment[], options: RunPlanRouteOptions): RunPlanRoute | null {
  const budgetMeters = Math.max(0, options.budgetMeters);
  const unfinished = segments.filter(
    (segment) => !segment.covered && isCoverageSegment(segment) && segment.coordinates.length >= 2,
  );
  if (unfinished.length === 0 || budgetMeters <= 0) return null;
  const graph = buildStreetGraph(segments, options.joinToleranceMeters ?? DEFAULT_JOIN_TOLERANCE_METERS);
  const anchor = options.start;
  let home: NodeId | undefined;
  if (anchor) {
    home = nearestConnectedNode(graph, anchor);
  } else {
    const seed = pickSeed(unfinished, indexUncoveredDensity(unfinished), options.salt ?? 0, graph);
    home = graph.segmentNodes.get(seed.id)?.start;
  }
  if (home == null) return null;

  const salt = options.salt ?? 0;
  const reversed = salt % 2 === 1;
  const collection = collectionLoop(graph, home, budgetMeters, reversed);
  // Finishing the city is the point of the game: a loop that does it is the answer, whatever its length.
  if (collection?.coversAll) return routeFromLoop(graph, collection, anchor, true);
  // Not finishing anyway: the same tour without the short dead ends, each one a turn back for a few metres;
  // they are left for the run that finishes the city.
  const tidy = collection
    ? collectionLoop(graph, home, budgetMeters, reversed, (pocket) => isShortDeadEnd(graph, pocket))
    : null;

  // Half the distance asked, or nothing new on it, is not the run that was asked for: let the street walk try.
  const trips = roundTrips(graph, home, budgetMeters).filter(
    (trip) => trip.newMeters > 0 && trip.meters >= budgetMeters * 0.7 && trip.meters <= budgetMeters * 1.1,
  );
  // The first request gets the best loop; "another route" walks down the list.
  const trip = trips[Math.max(0, salt - 1) % Math.max(1, Math.min(ROUND_TRIP_CHOICES, trips.length))];
  // Not finishing anyway: the tour without its short dead ends, when it has any stop left.
  const collected = tidy ?? collection;
  // New street gained, minus every metre run a second time.
  const worth = (loop: WalkedLoop) => loop.newMeters - loop.repeatMeters;
  const loop = collected && (!trip || worth(collected) > worth(trip)) ? collected : trip;
  return loop ? routeFromLoop(graph, loop, anchor, false) : null;
}

function routeFromLoop(
  graph: StreetGraph,
  { walked, meters, newMeters }: WalkedLoop,
  anchor: Position | undefined,
  coversAll: boolean,
): RunPlanRoute | null {
  const coordinates: Position[] = [];
  const keptIndex: number[] = [];
  const legs: RunPlanLeg[] = [];
  const credited = new Set<number>();
  walked.forEach((edge, index) => {
    const piece = index === 0 ? edge.coordinates : edge.coordinates.slice(1);
    const tip = coordinates[coordinates.length - 1];
    for (const point of piece) {
      const last = coordinates[coordinates.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) coordinates.push(point);
      keptIndex.push(coordinates.length - 1);
    }
    const kind = isConquestEdge(edge) && credited.has(edge.segmentId) ? "bridge" : legKindForEdge(edge);
    credited.add(edge.segmentId);
    const previous = legs[legs.length - 1];
    if (previous?.kind === kind) previous.coordinates.push(...piece);
    else legs.push({ coordinates: tip ? [tip, ...piece] : [...piece], kind });
  });
  if (coordinates.length < 2) return null;

  const maneuvers = maneuversAlong(graph, walked, coordinates, keptIndex);
  let jumpCount = 0;
  let jumpMeters = 0;
  if (anchor) {
    const networkEntry = coordinates[0]!;
    const approachMeters = distanceMeters(anchor, networkEntry);
    if (approachMeters >= ANCHOR_JUMP_MIN_METERS && approachMeters <= MAX_STRAIGHT_LINK_METERS) {
      coordinates.unshift(anchor);
      for (const maneuver of maneuvers) maneuver.index += 1;
      legs.unshift({ coordinates: [anchor, networkEntry], kind: "jump" });
      jumpCount = 1;
      jumpMeters = approachMeters + closeOnAnchor(coordinates, legs, maneuvers, anchor);
    }
  }
  const pathMeters = meters + jumpMeters;
  return {
    coordinates,
    uncoveredMeters: newMeters,
    pathMeters,
    start: coordinates[0]!,
    jumpCount,
    jumpMeters,
    legs,
    coversAll,
    completeAtMeters: coversAll ? pathMeters : null,
    maneuvers,
  };
}

function emptyRoute(): RunPlanRoute {
  return {
    coordinates: [],
    uncoveredMeters: 0,
    pathMeters: 0,
    start: null,
    jumpCount: 0,
    jumpMeters: 0,
    legs: [],
    coversAll: false,
    completeAtMeters: null,
    maneuvers: [],
  };
}

/**
 * Walk the street graph into one continuous outing sized to `budgetMeters`.
 * Prefers unfinished streets in dense remaining pockets; bridges through covered streets
 * only to reach more unexplored length; fills with already-run streets last so distance still matches.
 * Stays strictly on OSM / connector edges — never invents aerial shortcuts through blocks.
 * Long continuous OSM LineStrings are walked in full (any length is fine when on-network).
 */
export function buildRunPlanRoute(streets: readonly PlanSegment[], options: RunPlanRouteOptions): RunPlanRoute {
  const segments = streetsAsRun(streets);
  // The finishing walk has to take every street, dead ends included.
  if (options.homewardSteer === false) return walkPlan(segments, options, new Set()).route;
  if (!options.loop) {
    // A one-way run that does not finish the city leaves short dead ends to the one that does, as loops do.
    const tidy = walkPlan(segments, options, shortDeadEndStreets(segments, options)).route;
    return tidy.uncoveredMeters > 0 ? tidy : walkPlan(segments, options, new Set()).route;
  }
  const roundTrip = planLoop(segments, options);
  if (roundTrip) return roundTrip;
  // No loop of that size around here: walk the streets out and back.
  const first = walkPlan(segments, options, new Set());
  // Re-plan without the detours that cost more than they conquer; the freed budget goes to other streets.
  // A re-plan is kept only when it is worth more: where everything left is a dead end, the first walk wins.
  const skipped = new Set<number>();
  let best = first;
  let candidate = first;
  for (let round = 0; round < 4; round++) {
    const wasteful = wastefulDetourSegments(candidate.walked);
    if (wasteful.size === 0) break;
    for (const segmentId of wasteful) skipped.add(segmentId);
    candidate = walkPlan(segments, options, skipped);
    // On a tie the cleaner loop wins, unless it conquers nothing or runs well past the distance asked
    // (the walk to a far first street is not budgeted).
    const acceptable = candidate.route.uncoveredMeters > 0 && candidate.route.pathMeters <= options.budgetMeters * 1.1;
    if (acceptable && planWorth(candidate) >= planWorth(best)) best = candidate;
  }
  return best.route;
}

/** New street gained, minus every metre run a second time. */
function planWorth(plan: { route: RunPlanRoute; walked: DirectedEdge[] }): number {
  const seen = new Set<number>();
  let repeatedMeters = 0;
  for (const edge of plan.walked) {
    if (seen.has(edge.segmentId)) repeatedMeters += edge.lengthMeters;
    seen.add(edge.segmentId);
  }
  return plan.route.uncoveredMeters - repeatedMeters;
}

function walkPlan(
  segments: readonly PlanSegment[],
  options: RunPlanRouteOptions,
  skipped: ReadonlySet<number>,
): { route: RunPlanRoute; walked: DirectedEdge[] } {
  const budgetMeters = Math.max(0, options.budgetMeters);
  const joinToleranceMeters = options.joinToleranceMeters ?? DEFAULT_JOIN_TOLERANCE_METERS;
  const maxBridgeMeters = bridgeBudgetMeters(budgetMeters, options.maxBridgeMeters);
  const salt = options.salt ?? 0;

  const unfinished = segments.filter(
    (segment) => !segment.covered && isCoverageSegment(segment) && segment.coordinates.length >= 2,
  );
  if (unfinished.length === 0 || budgetMeters <= 0) {
    return { route: emptyRoute(), walked: [] };
  }

  const graph = buildStreetGraph(segments, joinToleranceMeters);
  const uncovered = unfinished.filter((segment) => !skipped.has(segment.id));
  if (uncovered.length === 0) return { route: emptyRoute(), walked: [] };
  const focus = centroidOf(uncovered.map((segment) => midpoint(segment.coordinates)));
  const metersByCell = indexUncoveredDensity(uncovered);
  const anchor = options.start;
  /** Unfinished streets that exist as graph edges: the ones a route can actually walk. */
  const walkableUnfinished = new Set<number>();
  for (const edges of graph.outgoing.values()) {
    for (const edge of edges) if (isConquestEdge(edge)) walkableUnfinished.add(edge.segmentId);
  }

  let seed: PlanSegment;
  let snapNode: NodeId | null = null;
  if (anchor) {
    const snap = nearestNode(graph, anchor, MAX_ANCHOR_SNAP_METERS);
    if (snap == null) return { route: emptyRoute(), walked: [] };
    snapNode = snap.node;
    const anchored = pickAnchoredSeed(uncovered, anchor, salt, graph, snap.node);
    if (anchored == null) return { route: emptyRoute(), walked: [] };
    seed = anchored;
  } else {
    seed = pickSeed(uncovered, metersByCell, salt, graph);
  }

  // Prefer the exit that unlocks more unfinished street (avoids walking into a cul-de-sac).
  // Anchored starts instead enter at the end nearer the athlete so the approach stays on-network.
  const seedNodes = graph.segmentNodes.get(seed.id);
  const seedUsed = new Set<number>([seed.id]);
  const forwardUnlock = seedNodes == null ? 0 : unusedUncoveredLengthAt(graph, seedNodes.end, seedUsed);
  const reverseUnlock = seedNodes == null ? 0 : unusedUncoveredLengthAt(graph, seedNodes.start, seedUsed);
  let startAtFirst = forwardUnlock >= reverseUnlock;
  if (anchor) {
    const seedEnds = endsOf(seed);
    startAtFirst = distanceMeters(seedEnds.start, anchor) <= distanceMeters(seedEnds.end, anchor);
  } else if (forwardUnlock === reverseUnlock) {
    const seedEnds = endsOf(seed);
    startAtFirst = distanceMeters(seedEnds.start, focus) >= distanceMeters(seedEnds.end, focus);
  }

  // Skipped detours count as taken: never picked, and a bridge treats them like any street already run.
  const used = new Set<number>(skipped);
  /** Uncovered meters credited once — fill may rewalk streets without inflating conquest %. */
  const creditedUncovered = new Set<number>();
  const coords: Position[] = [];
  /** Edges in route order: `coords` is the first one's vertices, then each next one's minus its first. */
  const walked: DirectedEdge[] = [];
  const legs: RunPlanLeg[] = [];
  let uncoveredMeters = 0;
  let pathMeters = 0;
  let head = 0;
  let tail = 0;

  function pushLeg(coordinates: Position[], kind: PlanLegKind) {
    const clean = dedupe(coordinates);
    if (clean.length < 2) return;
    const last = legs[legs.length - 1];
    if (last && last.kind === kind) {
      last.coordinates = dedupe([...last.coordinates, ...clean]);
      return;
    }
    legs.push({ coordinates: clean, kind });
  }

  let creditedWalkable = 0;
  let completeAtMeters: number | null = null;

  function creditUncovered(segmentId: number, lengthMeters: number) {
    if (creditedUncovered.has(segmentId)) return;
    creditedUncovered.add(segmentId);
    uncoveredMeters += lengthMeters;
    if (walkableUnfinished.has(segmentId)) creditedWalkable += 1;
  }

  /** Metres back to the start from `node`; 0 when the route may end anywhere. */
  let homeMeters: Map<NodeId, number> | null = null;
  const reserve = (node: NodeId) => (homeMeters == null ? 0 : (homeMeters.get(node) ?? Infinity));
  /** Largest budget any step needed so far (walked + way home): a loop is affordable only above it. */
  let peakNeedMeters = 0;

  /** Called after each growth step, once its length is counted. */
  function noteCompletion() {
    peakNeedMeters = Math.max(peakNeedMeters, pathMeters + reserve(head));
    if (completeAtMeters == null && creditedWalkable >= walkableUnfinished.size) completeAtMeters = peakNeedMeters;
  }

  function appendConnectorEdges(connector: DirectedEdge[]) {
    for (let index = 0; index < connector.length; index++) {
      const edge = connector[index]!;
      used.add(edge.segmentId);
      walked.push(edge);
      pathMeters += edge.lengthMeters;
      if (isConquestEdge(edge)) creditUncovered(edge.segmentId, edge.lengthMeters);
      if (index === 0 && coords.length === 0) {
        coords.push(...edge.coordinates);
        pushLeg(edge.coordinates, legKindForEdge(edge));
      } else {
        const pieceStart = coords[coords.length - 1]!;
        coords.push(...edge.coordinates.slice(1));
        pushLeg([pieceStart, ...edge.coordinates.slice(1)], legKindForEdge(edge));
      }
    }
  }

  function applySeed(startAtFirstOrientation: boolean) {
    const seedCoords = startAtFirstOrientation ? seed.coordinates : [...seed.coordinates].reverse();
    const entryNode = seedNodes == null ? 0 : startAtFirstOrientation ? seedNodes.start : seedNodes.end;
    const exitNode = seedNodes == null ? 0 : startAtFirstOrientation ? seedNodes.end : seedNodes.start;
    used.add(seed.id);
    creditUncovered(seed.id, seed.lengthMeters);
    pathMeters += seed.lengthMeters;
    head = exitNode;
    tail = entryNode;
    walked.push(
      (graph.outgoing.get(entryNode) ?? []).find((edge) => edge.segmentId === seed.id && edge.to === exitNode) ?? {
        // A seed the graph could not join: drawn, never searched.
        index: -1,
        segmentId: seed.id,
        from: entryNode,
        to: exitNode,
        lengthMeters: seed.lengthMeters,
        covered: false,
        countsForCoverage: true,
        coordinates: seedCoords,
        name: seed.name ?? null,
        twins: [],
      },
    );

    const seedLegStart = coords[coords.length - 1];
    if (seedLegStart) {
      // Connector already ends at the seed entry — continue along seed geometry without a chord.
      if (distanceMeters(seedLegStart, seedCoords[0]!) > joinToleranceMeters) {
        return false;
      }
      coords.push(...seedCoords.slice(1));
      pushLeg([seedLegStart, ...seedCoords.slice(1)], "conquest");
    } else {
      coords.push(...seedCoords);
      pushLeg(seedCoords, "conquest");
    }
    return true;
  }

  if (anchor) {
    // Snap + on-network walk to a reachable seed — never GPS→seed aerial chords.
    if (snapNode == null || seedNodes == null) return { route: emptyRoute(), walked: [] };

    // Prefer unlock orientation when reachable; otherwise flip so the entry faces the athlete.
    // Seed is blocked during the approach so the connector cannot "walk the seed" then add it again.
    const approachBlocked = new Set<number>([seed.id]);
    const orientations = startAtFirst ? [true, false] : [false, true];
    let connected = false;
    for (const orientation of orientations) {
      const entryNode = orientation ? seedNodes.start : seedNodes.end;
      const connector = shortestPath(graph, snapNode, entryNode, approachBlocked, MAX_START_CONNECTOR_METERS);
      if (connector == null) continue;
      appendConnectorEdges(connector);
      if (!applySeed(orientation)) {
        return { route: emptyRoute(), walked: [] };
      }
      connected = true;
      break;
    }
    if (!connected) return { route: emptyRoute(), walked: [] };
  } else {
    if (!applySeed(startAtFirst)) return { route: emptyRoute(), walked: [] };
  }

  function appendEdge(edge: DirectedEdge, end: "head" | "tail") {
    // Running back along a street already taken this outing conquers nothing new.
    const kind = isConquestEdge(edge) && creditedUncovered.has(edge.segmentId) ? "bridge" : legKindForEdge(edge);
    used.add(edge.segmentId);
    pathMeters += edge.lengthMeters;
    if (isConquestEdge(edge)) creditUncovered(edge.segmentId, edge.lengthMeters);
    if (end === "head") {
      const tip = coords[coords.length - 1]!;
      coords.push(...edge.coordinates.slice(1));
      pushLeg([tip, ...edge.coordinates.slice(1)], kind);
      head = edge.to;
      walked.push(edge);
    } else {
      const tip = coords[0]!;
      coords.unshift(...edge.coordinates.slice(1).reverse());
      pushLeg([...edge.coordinates.slice(1).reverse(), tip], kind);
      // Prepended legs stay readable if we keep them in path order at the front.
      const prepended = legs.pop()!;
      legs.unshift(prepended);
      tail = edge.to;
      // The route runs this street the other way round.
      walked.unshift({ ...edge, from: edge.to, to: edge.from, coordinates: [...edge.coordinates].reverse() });
    }
  }

  function extendConquest(end: "head" | "tail"): boolean {
    const remaining = budgetMeters - pathMeters;
    if (remaining <= 0) return false;
    const node = end === "head" ? head : tail;
    const edges = graph.outgoing.get(node) ?? [];
    // A street is affordable when it and the way home from its far end still fit the budget.
    const fits = (from: number) => (edge: DirectedEdge) =>
      from + edge.lengthMeters + reserve(edge.to) <= remaining + 80;
    // Loop shaping: leave the start during the first third, drift back to it after half the budget.
    const phase = pathMeters / budgetMeters;
    const pull = !steerHome ? 0 : phase < 0.33 ? -0.6 : phase > 0.5 ? 1.2 : 0;
    const steer = (edge: DirectedEdge) => pull * (reserve(edge.from) - reserve(edge.to));

    const uncoveredEdge = pickUncoveredEdge(edges, used, graph, fits(0), steer);
    if (uncoveredEdge) {
      appendEdge(uncoveredEdge, end);
      return true;
    }

    const bridge = findBridgeToUncovered(graph, node, used, Math.min(maxBridgeMeters, remaining));
    if (bridge != null && bridge.length > 0) {
      const bridgeMeters = bridge.reduce((sum, edge) => sum + edge.lengthMeters, 0);
      const landing = bridge[bridge.length - 1]!.to;
      // Only cross when an unfinished street at the far side is still affordable: a bridge to nowhere is pure repeat.
      const nextUncovered = pickUncoveredEdge(
        graph.outgoing.get(landing) ?? [],
        used,
        graph,
        fits(bridgeMeters),
        steer,
      );
      if (nextUncovered) {
        for (const hop of bridge) appendEdge(hop, end);
        appendEdge(nextUncovered, end);
        return true;
      }
    }

    return false;
  }

  // An anchored route keeps its tail at the athlete, and a loop its tail at the start: only the head grows.
  const loop = options.loop === true && seedNodes != null;
  const growTail = !anchor && !loop;
  const home = snapNode ?? tail;
  if (loop) homeMeters = walkCosts(graph, home, (edge) => edge.lengthMeters).cost;
  const steerHome = loop && options.homewardSteer !== false;

  // Conquest: unfinished streets and covered / connector bridges only (no aerial hops).
  // No filler afterwards: once nothing new is affordable the outing ends, shorter than asked if need be.
  noteCompletion();
  let grew = true;
  let guard = 0;
  while (grew && completeAtMeters == null && pathMeters < budgetMeters && guard < 30_000) {
    guard += 1;
    const grewHead = extendConquest("head");
    noteCompletion();
    const grewTail = growTail && completeAtMeters == null && pathMeters < budgetMeters ? extendConquest("tail") : false;
    noteCompletion();
    grew = grewHead || grewTail;
  }

  if (loop && head !== home) {
    // Way home: unfinished streets are cheap, streets already run this outing are dear, so the return
    // draws the other side of the loop instead of the same line backwards.
    const walkedSegments = new Set(walked.map((edge) => edge.segmentId));
    const wayHome = (costOf: (edge: DirectedEdge) => number) => {
      const back = walkCosts(graph, head, costOf).via;
      const hops: DirectedEdge[] = [];
      for (let node = home; node !== head;) {
        const edge = back.get(node);
        if (!edge) break;
        hops.unshift(edge);
        node = edge.from;
      }
      return hops;
    };
    let hops = wayHome((edge) => {
      if (walkedSegments.has(edge.segmentId)) return edge.lengthMeters * 3;
      return isConquestEdge(edge) ? edge.lengthMeters * 0.6 : edge.lengthMeters;
    });
    // The scenic way home may not blow the distance asked for: fall back to the direct one.
    const homeLength = hops.reduce((sum, edge) => sum + edge.lengthMeters, 0);
    if (pathMeters + homeLength > budgetMeters * 1.08) hops = wayHome((edge) => edge.lengthMeters);
    for (const hop of hops) appendEdge(hop, "head");
  }

  // Same de-duplication as `dedupe`, keeping where each junction vertex ends up.
  const coordinates: Position[] = [];
  const keptIndex: number[] = [];
  for (const point of coords) {
    const last = coordinates[coordinates.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) coordinates.push(point);
    keptIndex.push(coordinates.length - 1);
  }
  if (coordinates.length < 2) {
    return { route: emptyRoute(), walked: [] };
  }

  const maneuvers = maneuversAlong(graph, walked, coordinates, keptIndex);

  // Anchored plans keep the athlete's GPS as the true start. Network walking still begins at
  // the nearest street node; the GPS→snap segment is a single approach jump (not mid-route hops).
  let jumpCount = 0;
  let jumpMeters = 0;
  let start = coordinates[0]!;
  if (anchor) {
    const networkEntry = coordinates[0]!;
    const approachMeters = distanceMeters(anchor, networkEntry);
    if (approachMeters >= ANCHOR_JUMP_MIN_METERS && approachMeters <= MAX_STRAIGHT_LINK_METERS) {
      coordinates.unshift(anchor);
      for (const maneuver of maneuvers) maneuver.index += 1;
      legs.unshift({ coordinates: [anchor, networkEntry], kind: "jump" });
      jumpCount = 1;
      jumpMeters = approachMeters;
      start = anchor;
      if (loop) jumpMeters += closeOnAnchor(coordinates, legs, maneuvers, anchor);
    }
  }

  const route: RunPlanRoute = {
    coordinates,
    uncoveredMeters,
    pathMeters: pathMeters + jumpMeters,
    start,
    jumpCount,
    jumpMeters,
    legs,
    coversAll: completeAtMeters != null,
    completeAtMeters: completeAtMeters == null ? null : completeAtMeters + jumpMeters,
    maneuvers,
  };
  return { route, walked };
}

type OutingOptions = {
  budgetMeters: number;
  salt?: number;
  start?: Position;
  maxBridgeMeters?: number;
  loop?: boolean;
  homewardSteer?: boolean;
};
type Outing = { route: RunPlanRoute; startsFromPosition: boolean };

/** Anchored at the athlete when the start snaps onto the network, city-centred otherwise. */
function planFromStartOrCity(segments: readonly PlanSegment[], options: OutingOptions): Outing {
  const route = buildRunPlanRoute(segments, options);
  if (options.start == null) return { route, startsFromPosition: false };
  if (route.coordinates.length >= 2) {
    // No streets known between the athlete and the city: the route starts at the city's edge, not at them.
    const reached = distanceMeters(route.coordinates[0]!, options.start) <= MAX_STRAIGHT_LINK_METERS;
    return { route, startsFromPosition: reached };
  }
  return { route: buildRunPlanRoute(segments, { ...options, start: undefined }), startsFromPosition: false };
}

const finishingOptions = { salt: 0, maxBridgeMeters: FINISH_BRIDGE_METERS, homewardSteer: false };

/**
 * The outing for this budget. When it stops short of the city's last streets but the budget is enough
 * to finish them ({@link estimateFinishMeters}), the finishing walk is returned instead: a length shown
 * as "finishes the city" must actually finish it.
 */
/** Unfinished street within reach, in outings: with this much to run nearby, the rest of the city is not looked at. */
const PLENTY_NEARBY_OUTINGS = 3;

/**
 * The streets an outing from `start` can use. A loop never goes further than half its length from where it
 * starts, a one-way run than its whole length: planning a 10 km run through Paris does not need Paris.
 * The whole city when no start is given, or when there is too little left nearby to be sure of filling the run.
 */
function streetsInReach(streets: readonly PlanSegment[], options: OutingOptions): readonly PlanSegment[] {
  const { start, budgetMeters } = options;
  if (!start) return streets;
  const longest = budgetMeters * 1.1;
  const reach =
    (options.loop ? longest / 2 : longest + bridgeBudgetMeters(budgetMeters, options.maxBridgeMeters)) +
    MAX_ANCHOR_SNAP_METERS;
  // Flat-earth metres: exact enough at the scale of a run, and this looks at every point of the city.
  const metersPerLng = 111_320 * Math.cos(toRadians(start[1]!));
  const isNear = (point: Position) =>
    Math.hypot((point[0]! - start[0]!) * metersPerLng, (point[1]! - start[1]!) * 111_320) <= reach;
  const near = streets.filter((street) => street.coordinates.some(isNear));
  if (near.length === streets.length) return streets;
  return unfinishedMeters(near) >= PLENTY_NEARBY_OUTINGS * budgetMeters ? near : streets;
}

/** Every unfinished metre has to be run at least once: no outing shorter than this can finish the city. */
function unfinishedMeters(segments: readonly PlanSegment[]): number {
  return segments.reduce(
    (sum, segment) => (!segment.covered && isCoverageSegment(segment) ? sum + segment.lengthMeters : sum),
    0,
  );
}

export function planOuting(streets: readonly PlanSegment[], options: OutingOptions): Outing {
  const near = streetsInReach(streets, options);
  let segments = streetsAsRun(near);
  let outing = planFromStartOrCity(segments, options);
  if (near !== streets && !outing.startsFromPosition) {
    // Nothing to run from where the athlete stands: the whole city is needed to choose where to start.
    segments = streetsAsRun(streets);
    outing = planFromStartOrCity(segments, options);
  }
  // Skip the second walk when this budget cannot finish anyway (the usual case on a big city).
  if (outing.route.coversAll || options.budgetMeters < unfinishedMeters(segments)) return outing;
  const finishing = planFromStartOrCity(segments, { ...options, ...finishingOptions });
  return finishing.route.coversAll ? finishing : outing;
}

/**
 * Outing length that runs every unfinished street of the city from this start; 0 when nothing is left,
 * null when it takes more than {@link MAX_FINISH_BUDGET_METERS} or some streets are unreachable on foot.
 * Uses the same walk as {@link planOuting}'s finishing fallback, so any budget at or above it finishes.
 */
export function estimateFinishMeters(streets: readonly PlanSegment[], start?: Position, loop = false): number | null {
  const segments = streetsAsRun(streets);
  const unfinished = unfinishedMeters(segments);
  if (unfinished === 0) return 0;
  if (unfinished > MAX_FINISH_BUDGET_METERS) return null;
  if (loop) {
    // The loop planner's own finishing loop, when it has one: the same loop any budget above it gets.
    const { route } = planFromStartOrCity(segments, { budgetMeters: MAX_FINISH_BUDGET_METERS, start, loop });
    if (route.coversAll) return route.completeAtMeters;
  }
  const { route } = planFromStartOrCity(segments, {
    budgetMeters: MAX_FINISH_BUDGET_METERS,
    start,
    loop,
    ...finishingOptions,
  });
  return route.completeAtMeters;
}

export function runPlanRouteToGeoJson(
  route: RunPlanRoute,
  areaId: number,
): FeatureCollection<LineString, { areaId: number; kind: PlanLegKind | "route" }> {
  // Prefer one continuous LineString — fragmented legs made the map look broken.
  if (route.coordinates.length >= 2) {
    const feature: Feature<LineString, { areaId: number; kind: "route" }> = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: route.coordinates },
      properties: { areaId, kind: "route" },
    };
    return { type: "FeatureCollection", features: [feature] };
  }
  return { type: "FeatureCollection", features: [] };
}
