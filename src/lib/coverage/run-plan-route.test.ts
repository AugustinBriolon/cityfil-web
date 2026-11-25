import { describe, expect, it } from "vitest";

import {
  bridgeBudgetMeters,
  buildRunPlanRoute,
  distanceMeters,
  estimateFinishMeters,
  MAX_ANCHOR_SNAP_METERS,
  MAX_STRAIGHT_LINK_METERS,
  planOuting,
  planPocketExpandDegrees,
  runPlanRouteToGeoJson,
  turnType,
  waysRoundAndBack,
  type Leg,
  type PlanSegment,
} from "./run-plan-route";

function seg(
  id: number,
  coordinates: [number, number][],
  covered: boolean,
  lengthMeters?: number,
  countsForCoverage = true,
): PlanSegment {
  let length = lengthMeters;
  if (length == null) {
    length = 0;
    for (let index = 1; index < coordinates.length; index++) {
      length += distanceMeters(coordinates[index - 1]!, coordinates[index]!);
    }
  }
  return { id, coordinates, lengthMeters: length, covered, countsForCoverage };
}

/** Horizontal chain of equal pieces along lat 48. */
function chain(startId: number, count: number, covered: boolean, startLng = 2, pieceMeters = 100): PlanSegment[] {
  const step = 0.00135;
  return Array.from({ length: count }, (_, index) => {
    const from = startLng + index * step;
    return seg(
      startId + index,
      [
        [from, 48.0],
        [from + step, 48.0],
      ],
      covered,
      pieceMeters,
    );
  });
}

/**
 * True when every consecutive path step stays on OSM/connector geometry.
 * Exact edge matches, join-tolerance junction glue, and float-drift at shared
 * endpoints (path tip near edge start, tip→edgeEnd ≈ edge) are allowed.
 * Longer off-edge chords fail — those would be aerial shortcuts.
 */
function pathFollowsSegments(path: [number, number][], segments: PlanSegment[], joinToleranceMeters = 22): boolean {
  const edges: { from: [number, number]; to: [number, number] }[] = [];
  for (const segment of segments) {
    for (let i = 1; i < segment.coordinates.length; i++) {
      const a = segment.coordinates[i - 1] as [number, number];
      const b = segment.coordinates[i] as [number, number];
      edges.push({ from: a, to: b }, { from: b, to: a });
    }
  }
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as [number, number];
    const b = path[i] as [number, number];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    if (distanceMeters(a, b) <= joinToleranceMeters) continue;
    const onEdge = edges.some(
      (edge) =>
        (a[0] === edge.from[0] && a[1] === edge.from[1] && b[0] === edge.to[0] && b[1] === edge.to[1]) ||
        (distanceMeters(a, edge.from) <= joinToleranceMeters &&
          distanceMeters(b, edge.to) <= joinToleranceMeters &&
          Math.abs(distanceMeters(a, b) - distanceMeters(edge.from, edge.to)) <= joinToleranceMeters),
    );
    if (!onEdge) return false;
  }
  return true;
}

describe("bridgeBudgetMeters", () => {
  it("scales with the outing and stays within bounds", () => {
    expect(bridgeBudgetMeters(5_000)).toBe(2_000);
    expect(bridgeBudgetMeters(12_000)).toBe(4_500);
    expect(bridgeBudgetMeters(500)).toBe(480);
    expect(bridgeBudgetMeters(5_000, 90)).toBe(90);
  });
});

describe("planPocketExpandDegrees", () => {
  it("widens the fetch envelope for longer outings", () => {
    expect(planPocketExpandDegrees(5_000)).toBeGreaterThan(planPocketExpandDegrees(800));
    expect(planPocketExpandDegrees(12_000)).toBeGreaterThan(planPocketExpandDegrees(5_000));
    expect(planPocketExpandDegrees(40_000)).toBeCloseTo(14_000 / 111_320, 6);
  });
});

describe("buildRunPlanRoute", () => {
  it("returns an empty route when nothing is uncovered", () => {
    const route = buildRunPlanRoute(
      [
        seg(
          1,
          [
            [2.0, 48.0],
            [2.001, 48.0],
          ],
          true,
        ),
      ],
      { budgetMeters: 1_000 },
    );
    expect(route.coordinates).toEqual([]);
    expect(route.pathMeters).toBe(0);
  });

  it("concatenates connected uncovered segments into one continuous path", () => {
    const pieces = chain(1, 4, false);
    const route = buildRunPlanRoute(pieces, { budgetMeters: 350, salt: 0 });
    expect(route.pathMeters).toBeGreaterThanOrEqual(300);
    expect(route.pathMeters).toBeLessThanOrEqual(420);
    expect(route.uncoveredMeters).toBe(route.pathMeters);
    expect(route.coordinates.length).toBeGreaterThan(2);
    expect(pathFollowsSegments(route.coordinates as [number, number][], pieces)).toBe(true);
  });

  it("uses a short covered bridge to keep the path continuous", () => {
    const left = seg(
      1,
      [
        [2.0, 48.0],
        [2.001, 48.0],
      ],
      false,
      80,
    );
    const bridge = seg(
      2,
      [
        [2.001, 48.0],
        [2.0015, 48.0],
      ],
      true,
      40,
    );
    const right = seg(
      3,
      [
        [2.0015, 48.0],
        [2.0025, 48.0],
      ],
      false,
      80,
    );

    const route = buildRunPlanRoute([left, bridge, right], { budgetMeters: 250 });

    expect(route.uncoveredMeters).toBeGreaterThanOrEqual(150);
    expect(route.pathMeters).toBeGreaterThan(route.uncoveredMeters);
    expect(route.coordinates.length).toBeGreaterThanOrEqual(4);
    expect(route.jumpCount).toBe(0);
  });

  it("walks a pedestrian connector instead of jumping across a block", () => {
    const left = seg(
      1,
      [
        [2.0, 48.0],
        [2.001, 48.0],
      ],
      false,
      80,
    );
    const connector = seg(
      2,
      [
        [2.001, 48.0],
        [2.0015, 48.0],
      ],
      true,
      40,
      false,
    );
    const right = seg(
      3,
      [
        [2.0015, 48.0],
        [2.0025, 48.0],
      ],
      false,
      80,
    );

    const route = buildRunPlanRoute([left, connector, right], { budgetMeters: 250 });

    expect(route.uncoveredMeters).toBeGreaterThanOrEqual(150);
    expect(route.legs.some((leg) => leg.kind === "connector")).toBe(true);
    expect(route.legs.some((leg) => leg.kind === "jump")).toBe(false);
  });

  it("ends the outing rather than padding it once no new street is in reach", () => {
    const left = seg(
      1,
      [
        [2.0, 48.0],
        [2.001, 48.0],
      ],
      false,
      80,
    );
    const longBridge = seg(
      2,
      [
        [2.001, 48.0],
        [2.004, 48.0],
      ],
      true,
      250,
    );
    const right = seg(
      3,
      [
        [2.004, 48.0],
        [2.005, 48.0],
      ],
      false,
      80,
    );

    const route = buildRunPlanRoute([left, longBridge, right], {
      budgetMeters: 500,
      maxBridgeMeters: 120,
    });

    // The next unfinished street sits beyond the 120 m bridge cap: no filler laps to reach the budget.
    expect(route.pathMeters).toBe(80);
  });

  it("grows the path when the selected distance increases on uncovered-only network", () => {
    const pieces = chain(1, 40, false);
    const fiveKm = buildRunPlanRoute(pieces, { budgetMeters: 800, salt: 0 });
    const twelveKm = buildRunPlanRoute(pieces, { budgetMeters: 2_500, salt: 0 });

    expect(fiveKm.pathMeters).toBeGreaterThanOrEqual(700);
    expect(fiveKm.pathMeters).toBeLessThanOrEqual(950);
    expect(twelveKm.pathMeters).toBeGreaterThanOrEqual(2_300);
    expect(twelveKm.pathMeters).toBeGreaterThan(fiveKm.pathMeters + 1_200);
  });

  it("changes the start when salt changes", () => {
    const pieces = chain(1, 20, false);
    const a = buildRunPlanRoute(pieces, { budgetMeters: 600, salt: 0 });
    const b = buildRunPlanRoute(pieces, { budgetMeters: 600, salt: 7 });
    expect(a.start).not.toEqual(b.start);
  });

  it("starts an anchored route on the network and walks streets to the nearest unfinished one", () => {
    const approach = chain(100, 3, true, 2.0, 100);
    const unfinished = chain(1, 10, false, 2.0 + 3 * 0.00135, 100);
    const segments = [...approach, ...unfinished];
    const athlete: [number, number] = [2.0, 48.0];

    const route = buildRunPlanRoute(segments, {
      budgetMeters: 1_000,
      start: athlete,
    });

    expect(route.coordinates.length).toBeGreaterThan(2);
    expect(route.start).toEqual(athlete);
    expect(route.coordinates[0]).toEqual(route.start);
    expect(route.uncoveredMeters).toBeGreaterThanOrEqual(600);
    expect(route.pathMeters).toBeGreaterThan(route.uncoveredMeters);
    expect(route.jumpCount).toBe(0);
    expect(pathFollowsSegments(route.coordinates as [number, number][], segments)).toBe(true);
  });

  it("keeps the athlete GPS as start when standing off the network inside snap range", () => {
    const pieces = chain(1, 20, false);
    // ~45 m north of the chain: a pavement's distance from the junction, not on a node.
    const athlete: [number, number] = [2.0, 48.0 + 0.0004];
    expect(distanceMeters(athlete, [2.0, 48.0])).toBeGreaterThan(40);
    expect(distanceMeters(athlete, [2.0, 48.0])).toBeLessThan(MAX_STRAIGHT_LINK_METERS);

    const route = buildRunPlanRoute(pieces, { budgetMeters: 1_000, start: athlete });

    expect(route.start).toEqual(athlete);
    expect(route.coordinates[0]).toEqual(athlete);
    expect(route.jumpCount).toBe(1);
    expect(route.jumpMeters).toBeGreaterThan(40);
    expect(route.legs[0]?.kind).toBe("jump");
    // On-network walk starts after the GPS approach jump.
    expect(pathFollowsSegments(route.coordinates.slice(1) as [number, number][], pieces)).toBe(true);
  });

  it("draws no straight line to an athlete with no known street to the network", () => {
    const pieces = chain(1, 20, false);
    // ~200 m north of the chain: blocks away, and no street of theirs is known.
    const athlete: [number, number] = [2.0, 48.0 + 0.0018];
    expect(distanceMeters(athlete, [2.0, 48.0])).toBeGreaterThan(MAX_STRAIGHT_LINK_METERS);
    expect(distanceMeters(athlete, [2.0, 48.0])).toBeLessThan(MAX_ANCHOR_SNAP_METERS);

    for (const loop of [false, true]) {
      const { route, startsFromPosition } = planOuting(pieces, { budgetMeters: 1_000, start: athlete, loop });
      expect(startsFromPosition).toBe(false);
      expect(route.jumpCount).toBe(0);
      expect(route.legs.some((leg) => leg.kind === "jump")).toBe(false);
      expect(pathFollowsSegments(route.coordinates as [number, number][], pieces)).toBe(true);
    }
  });

  it("reaches the network along a neighbouring city's streets when they are known", () => {
    const pieces = chain(1, 20, false);
    const athlete: [number, number] = [2.0, 48.0 + 0.0018];
    // The neighbour's street from the athlete down to the chain: counts for nothing, but is a street.
    const approach = [0, 1].map((index) =>
      seg(
        100 + index,
        [
          [2.0, 48.0 + 0.0018 - index * 0.0009],
          [2.0, 48.0 + 0.0018 - (index + 1) * 0.0009],
        ],
        true,
        100,
        false,
      ),
    );
    const streets = [...pieces, ...approach];
    const { route, startsFromPosition } = planOuting(streets, { budgetMeters: 1_500, start: athlete, loop: true });
    expect(startsFromPosition).toBe(true);
    expect(route.coordinates[0]).toEqual(athlete);
    expect(route.coordinates.at(-1)).toEqual(athlete);
    expect(route.jumpCount).toBe(0);
    expect(route.uncoveredMeters).toBeGreaterThan(0);
    expect(pathFollowsSegments(route.coordinates as [number, number][], streets)).toBe(true);
  });

  it("orients an anchored seed toward unfinished continuation, not the cul-de-sac", () => {
    const stub = seg(
      1,
      [
        [2.0, 48.0],
        [2.001, 48.0],
      ],
      false,
      80,
    );
    const east = chain(2, 12, false, 2.001, 100);
    const route = buildRunPlanRoute([stub, ...east], {
      budgetMeters: 1_000,
      start: [2.0009, 48.0],
    });
    expect(route.pathMeters).toBeGreaterThanOrEqual(700);
    expect(route.uncoveredMeters).toBeGreaterThan(700);
  });

  it("keeps the athlete GPS as the start when growing toward the budget", () => {
    const pieces = chain(1, 20, false);
    const athlete: [number, number] = [2.0, 48.0];
    const route = buildRunPlanRoute(pieces, { budgetMeters: 1_500, start: athlete });

    expect(route.start).toEqual(athlete);
    expect(route.coordinates[0]).toEqual(route.start);
    expect(route.pathMeters).toBeGreaterThanOrEqual(1_300);
    expect(pathFollowsSegments(route.coordinates as [number, number][], pieces)).toBe(true);
  });

  it("refuses aerial hops across a short off-network gap (~80 m)", () => {
    const west = chain(1, 3, false, 2.0, 100);
    // ~80 m gap — previously within the aerial hop cap; must stay disconnected.
    const east = chain(100, 3, false, 2.0 + 3 * 0.00135 + 0.001, 100);
    const route = buildRunPlanRoute([...west, ...east], { budgetMeters: 800, salt: 0 });

    expect(route.jumpCount).toBe(0);
    expect(route.jumpMeters).toBe(0);
    expect(route.legs.some((leg) => leg.kind === "jump")).toBe(false);
    // Only one pocket is reachable on the graph — uncovered stays within that pocket.
    expect(route.uncoveredMeters).toBeLessThanOrEqual(320);
    expect(pathFollowsSegments(route.coordinates as [number, number][], [...west, ...east])).toBe(true);
  });

  it("does not aerial-hop across a multi-block gap", () => {
    const west = chain(1, 3, false, 2.0, 100);
    // ~400 m gap.
    const east = chain(100, 3, false, 2.0 + 3 * 0.00135 + 0.005, 100);
    const route = buildRunPlanRoute([...west, ...east], { budgetMeters: 2_000, salt: 0 });

    expect(route.jumpCount).toBe(0);
    expect(route.legs.some((leg) => leg.kind === "jump")).toBe(false);
    expect(pathFollowsSegments(route.coordinates as [number, number][], [...west, ...east])).toBe(true);
  });

  it("walks a long continuous OSM segment beyond 120 m when it is on-network", () => {
    const longStreet = seg(
      1,
      [
        [2.0, 48.0],
        [2.004, 48.0],
      ],
      false,
      300,
    );
    const continuation = seg(
      2,
      [
        [2.004, 48.0],
        [2.005, 48.0],
      ],
      false,
      80,
    );
    const route = buildRunPlanRoute([longStreet, continuation], { budgetMeters: 500, salt: 0 });

    expect(route.pathMeters).toBeGreaterThanOrEqual(300);
    expect(route.jumpCount).toBe(0);
    // Consecutive vertices on the long LineString are ~300 m apart — that is road geometry, not a hop.
    expect(distanceMeters(route.coordinates[0]!, route.coordinates[1]!)).toBeGreaterThan(120);
    expect(pathFollowsSegments(route.coordinates as [number, number][], [longStreet, continuation])).toBe(true);
  });

  it("refuses an anchored start when the athlete is far beyond snap range", () => {
    const pieces = chain(1, 10, false, 2.0, 100);
    // ~2.2 km north of the chain — beyond MAX_ANCHOR_SNAP_METERS.
    const athlete: [number, number] = [2.0, 48.0 + 0.02];
    expect(distanceMeters(athlete, [2.0, 48.0])).toBeGreaterThan(MAX_ANCHOR_SNAP_METERS);

    const route = buildRunPlanRoute(pieces, { budgetMeters: 1_000, start: athlete });
    expect(route.coordinates).toEqual([]);
    expect(route.pathMeters).toBe(0);
  });

  it("refuses anchored start when seed pocket is graph-disconnected from the snap node", () => {
    const approach = chain(1, 2, true, 2.0, 100);
    const unfinishedFar = chain(100, 3, false, 2.05, 100);
    const athlete: [number, number] = [2.0, 48.0];

    const route = buildRunPlanRoute([...approach, ...unfinishedFar], {
      budgetMeters: 1_000,
      start: athlete,
      salt: 0,
    });

    // Athlete snaps onto the covered approach; seed is the only unfinished pocket, disconnected.
    expect(route.coordinates).toEqual([]);
    expect(route.pathMeters).toBe(0);
  });

  it("starts in the denser unfinished neighbourhood", () => {
    const sparse = chain(1, 2, false, 2.0, 100);
    const dense = chain(100, 12, false, 2.1, 100);
    const route = buildRunPlanRoute([...sparse, ...dense], { budgetMeters: 500, salt: 0 });
    expect(route.start?.[0]).toBeGreaterThan(2.05);
  });

  it("stops around the budget instead of packing every uncovered street", () => {
    const pieces = chain(1, 40, false);
    const route = buildRunPlanRoute(pieces, { budgetMeters: 350, salt: 0 });
    expect(route.pathMeters).toBeGreaterThanOrEqual(300);
    expect(route.pathMeters).toBeLessThanOrEqual(420);
  });

  it("stays fast when many short stubs touch one large unfinished pocket", () => {
    // Paris shape: a 3 m stub at every junction. Each one used to re-flood the whole pocket, blowing seed
    // ranking up quadratically. They are real dead ends now (ADR 0021), so the walk has twice the streets.
    const pocket = chain(1, 3_000, false);
    const stubs = pocket.map((piece, index) => {
      const [lng, lat] = piece.coordinates[0]!;
      return seg(
        100_000 + index,
        [
          [lng, lat],
          [lng, lat + 0.00003],
        ],
        false,
      );
    });

    const startedAt = performance.now();
    const route = buildRunPlanRoute([...pocket, ...stubs], { budgetMeters: 18_000, salt: 0 });
    const elapsedMs = performance.now() - startedAt;

    expect(route.pathMeters).toBeGreaterThan(15_000);
    // ~0.5 s on 6,000 streets; a quadratic walk takes several seconds.
    expect(elapsedMs).toBeLessThan(1_500);
  });
});

/** A street with a dead-end side street at each junction: finishing means running back out of every one. */
function comb(covered = false): PlanSegment[] {
  const spine = chain(1, 5, covered);
  const teeth = spine.map((piece, index) => {
    const [lng] = piece.coordinates[1]!;
    return seg(
      100 + index,
      [
        [lng!, 48.0],
        [lng!, 48.0009],
      ],
      covered,
      100,
    );
  });
  return [...spine, ...teeth];
}

describe("finishing a city", () => {
  it("runs back out of dead ends to reach every unfinished street", () => {
    const streets = comb();
    const route = buildRunPlanRoute(streets, { budgetMeters: 3_000, salt: 0, maxBridgeMeters: 4_500 });
    expect(route.coversAll).toBe(true);
    expect(route.uncoveredMeters).toBe(1_000);
    expect(route.completeAtMeters).toBeGreaterThanOrEqual(1_000);
    expect(pathFollowsSegments(route.coordinates as [number, number][], streets)).toBe(true);
  });

  it("estimates a length that, when chosen, finishes the city whatever the salt", () => {
    const streets = comb();
    const finish = estimateFinishMeters(streets)!;
    expect(finish).toBeGreaterThanOrEqual(1_000);
    for (const salt of [0, 1, 2, 7]) {
      const { route } = planOuting(streets, { budgetMeters: Math.ceil(finish), salt });
      expect(route.coversAll).toBe(true);
    }
  });

  it("finishes in a one-way run no longer than the loop that comes back", () => {
    // The app asks for one or the other depending on "Loop / One way": they must not be swapped.
    const streets = comb();
    const start: [number, number] = [2, 48];
    const oneWay = estimateFinishMeters(streets, start, false)!;
    const loop = estimateFinishMeters(streets, start, true)!;
    expect(oneWay).toBeGreaterThanOrEqual(1_000);
    expect(oneWay).toBeLessThan(loop);
    const { route } = planOuting(streets, { budgetMeters: Math.ceil(oneWay), start, loop: false, salt: 0 });
    expect(route.coversAll).toBe(true);
  });

  it("does not claim to finish with a budget below the estimate", () => {
    const streets = comb();
    const finish = estimateFinishMeters(streets)!;
    const { route } = planOuting(streets, { budgetMeters: finish * 0.6, salt: 0 });
    expect(route.coversAll).toBe(false);
  });

  it("returns 0 for a finished city and null when a pocket cannot be reached on foot", () => {
    expect(estimateFinishMeters(comb(true))).toBe(0);
    const island = chain(500, 2, false, 2.5);
    expect(estimateFinishMeters([...comb(), ...island])).toBeNull();
  });
});

/** A 100 m city block, corner A at [2, 48], run counter-clockwise A → B → C → D. */
const A: [number, number] = [2, 48];
const B: [number, number] = [2.00135, 48];
const C: [number, number] = [2.00135, 48.0009];
const D: [number, number] = [2, 48.0009];
function block(): PlanSegment[] {
  return [
    seg(1, [A, B], false, 100),
    seg(2, [B, C], false, 100),
    seg(3, [C, D], false, 100),
    seg(4, [D, A], false, 100),
  ];
}

describe("loops", () => {
  it("ends where it starts", () => {
    const route = buildRunPlanRoute(block(), { budgetMeters: 1_000, start: A, loop: true });
    expect(route.uncoveredMeters).toBe(400);
    expect(route.coordinates[0]).toEqual(A);
    expect(route.coordinates.at(-1)).toEqual(A);
  });

  it("keeps enough budget to run home", () => {
    // 20 blocks east then nothing: without the reserve the route would spend all 1 km going away.
    const street = chain(1, 20, false);
    const route = buildRunPlanRoute(street, { budgetMeters: 1_000, start: [2, 48], loop: true });
    expect(route.coordinates.at(-1)).toEqual([2, 48]);
    expect(route.pathMeters).toBeLessThanOrEqual(1_100);
    expect(route.uncoveredMeters).toBeGreaterThanOrEqual(400);
  });

  it("leaves out a long dead end that would be run out and back", () => {
    const deadEnd = [0, 1, 2, 3].map((index) =>
      seg(
        10 + index,
        [
          [C[0] + index * 0.00135, C[1]],
          [C[0] + (index + 1) * 0.00135, C[1]],
        ],
        false,
        100,
      ),
    );
    const route = buildRunPlanRoute([...block(), ...deadEnd], { budgetMeters: 500, start: A, loop: true });
    expect(route.uncoveredMeters).toBe(400);
    expect(route.coordinates.every(([lng]) => lng! <= C[0] + 1e-9)).toBe(true);
    expect(route.coordinates.at(-1)).toEqual(A);
    // With the distance to finish the city, the dead end is the price of finishing it.
    const finishing = buildRunPlanRoute([...block(), ...deadEnd], { budgetMeters: 1_500, start: A, loop: true });
    expect(finishing.coversAll).toBe(true);
    expect(finishing.maneuvers.filter((maneuver) => maneuver.type === "u-turn")).toHaveLength(1);
  });

  it("still runs the dead end when it is all that is left", () => {
    const route = buildRunPlanRoute(chain(1, 4, false), { budgetMeters: 1_000, start: [2, 48], loop: true });
    expect(route.uncoveredMeters).toBe(400);
  });

  it("estimates a finishing length that includes the way home", () => {
    const streets = comb();
    const finish = estimateFinishMeters(streets, undefined, true)!;
    expect(finish).toBeGreaterThan(estimateFinishMeters(streets)!);
    const { route } = planOuting(streets, { budgetMeters: Math.ceil(finish), salt: 0, loop: true });
    expect(route.coversAll).toBe(true);
    expect(route.coordinates.at(-1)).toEqual(route.coordinates[0]);
  });
});

/** A 7 x 7 junction grid of 100 m blocks, nothing run yet. */
function grid(): PlanSegment[] {
  const at = (column: number, row: number): [number, number] => [2 + column * 0.00135, 48 + row * 0.0009];
  const streets: PlanSegment[] = [];
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 7; column++) {
      if (column < 6) streets.push(seg(streets.length + 1, [at(column, row), at(column + 1, row)], false, 100));
      if (row < 6) streets.push(seg(streets.length + 1, [at(column, row), at(column, row + 1)], false, 100));
    }
  }
  return streets;
}

describe("round trips", () => {
  // 20 m off the central junction, as a GPS fix on a pavement would be.
  const athlete: [number, number] = [2 + 3 * 0.00135 + 0.0002, 48 + 3 * 0.0009 + 0.0001];
  const plan = (salt = 0) => buildRunPlanRoute(grid(), { budgetMeters: 1_600, start: athlete, loop: true, salt });

  it("starts and ends on the athlete's exact position", () => {
    const route = plan();
    expect(route.coordinates[0]).toEqual(athlete);
    expect(route.coordinates.at(-1)).toEqual(athlete);
    expect(route.maneuvers.at(-1)).toEqual({ type: "arrive", name: null, index: route.coordinates.length - 1 });
  });

  it("never runs a street twice nor turns back", () => {
    const route = plan();
    const streets = route.coordinates.slice(1, -1);
    const run = new Set<string>();
    for (let i = 1; i < streets.length; i++) {
      const street = [streets[i - 1]!.join(","), streets[i]!.join(",")].sort().join("|");
      expect(run.has(street)).toBe(false);
      run.add(street);
    }
    expect(route.maneuvers.some((maneuver) => maneuver.type === "u-turn")).toBe(false);
  });

  it("stays close to the distance asked", () => {
    const route = plan();
    expect(route.pathMeters).toBeGreaterThanOrEqual(1_600 * 0.85);
    expect(route.pathMeters).toBeLessThanOrEqual(1_600 * 1.15);
    expect(route.uncoveredMeters).toBeGreaterThanOrEqual(1_200);
  });

  it("offers a different loop when asked for another route", () => {
    expect(plan(2).coordinates).not.toEqual(plan(1).coordinates);
    expect(plan(1).coordinates).toEqual(plan(0).coordinates);
  });
});

describe("collection loops", () => {
  // A city nearly finished: three scraps left, far apart, none of them a dead end.
  const scraps = new Set([3, 40, 77]);
  const streets = grid().map((street) => ({ ...street, covered: !scraps.has(street.id) }));
  const athlete: [number, number] = [2 + 3 * 0.00135, 48 + 3 * 0.0009];
  const streetsRun = (coordinates: number[][]) =>
    coordinates.slice(1).map((point, index) => [coordinates[index]!.join(","), point.join(",")].sort().join("|"));

  it("strings the scraps into one loop that finishes the city without running a street twice", () => {
    const route = buildRunPlanRoute(streets, { budgetMeters: 5_000, start: athlete, loop: true });
    expect(route.coversAll).toBe(true);
    expect(route.uncoveredMeters).toBe(300);
    expect(route.coordinates.at(-1)).toEqual(route.coordinates[0]);
    expect(route.maneuvers.some((maneuver) => maneuver.type === "u-turn")).toBe(false);
    const run = streetsRun(route.coordinates);
    expect(new Set(run).size).toBe(run.length);
    expect(pathFollowsSegments(route.coordinates as [number, number][], streets)).toBe(true);
  });

  it("is the loop behind the finishing length, so that length finishes", () => {
    const finish = estimateFinishMeters(streets, athlete, true)!;
    const { route } = planOuting(streets, { budgetMeters: Math.ceil(finish), start: athlete, loop: true });
    expect(route.coversAll).toBe(true);
    expect(route.pathMeters).toBeCloseTo(finish, 0);
  });

  it("drops the scraps that cost the most detour when the distance asked is short", () => {
    const route = buildRunPlanRoute(streets, { budgetMeters: 900, start: athlete, loop: true });
    expect(route.coversAll).toBe(false);
    expect(route.uncoveredMeters).toBeGreaterThanOrEqual(100);
    expect(route.pathMeters).toBeLessThanOrEqual(900 * 1.1);
    expect(route.coordinates.at(-1)).toEqual(route.coordinates[0]);
  });

  it("runs a dead-end spur when it passes it instead of coming back for it", () => {
    // What is left at a roundabout: two pieces of the ring, and between them a spur that a side street
    // joins halfway before it stops. Nearest street first runs both ring pieces, then detours back for the spur.
    const at = (column: number, row: number): [number, number] => [2 + column * 0.00135, 48 + row * 0.0009];
    const is = (street: PlanSegment, from: [number, number], to: [number, number]) =>
      street.coordinates[0]!.join() === from.join() && street.coordinates[1]!.join() === to.join();
    const roundabout = [
      ...grid()
        .filter((street) => !is(street, at(3, 5), at(3, 6)))
        .map((street) => ({
          ...street,
          covered: !is(street, at(2, 6), at(3, 6)) && !is(street, at(3, 6), at(4, 6)),
        })),
      seg(901, [at(3, 6), at(3, 7.2)], false, 120),
      seg(902, [at(3, 7.2), at(3, 8)], false, 80),
      seg(903, [at(3, 7.2), at(2, 7.2)], true, 100),
      seg(904, [at(2, 7.2), at(2, 6)], true, 120),
    ];
    const route = buildRunPlanRoute(roundabout, { budgetMeters: 5_000, start: athlete, loop: true });
    // 1.6 km with the spur taken in passing; 2.6 km when the loop leaves the roundabout and comes back for it.
    expect(route.pathMeters).toBeLessThan(2_000);
    expect(route.coversAll).toBe(true);
  });

  it("does not turn back mid-street onto the neighbouring city's copy of a boundary street", () => {
    // Every street is also loaded as the neighbour's copy: the same points, another id, nothing to gain.
    const copies = streets.map((street) => ({
      ...street,
      id: street.id + 1_000,
      covered: true,
      countsForCoverage: false,
    }));
    const route = buildRunPlanRoute([...streets, ...copies], { budgetMeters: 5_000, start: athlete, loop: true });
    expect(route.coversAll).toBe(true);
    const run = streetsRun(route.coordinates);
    expect(new Set(run).size).toBe(run.length);
  });

  /** A square city of 100 m blocks; `isCovered` says which streets are already run. */
  function blocks(size: number, isCovered: (id: number, column: number, row: number) => boolean) {
    const at = (column: number, row: number): [number, number] => [2 + column * 0.00135, 48 + row * 0.0009];
    const city: PlanSegment[] = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const covered = () => isCovered(city.length + 1, column, row);
        if (column < size - 1) city.push(seg(city.length + 1, [at(column, row), at(column + 1, row)], covered(), 100));
        if (row < size - 1) city.push(seg(city.length + 1, [at(column, row), at(column, row + 1)], covered(), 100));
      }
    }
    return { city, at };
  }
  /** Colombes shape: a city barely started, its unfinished streets in hundreds of pockets. */
  const scattered = () => blocks(40, (id) => id % 7 !== 0);

  it("stays fast when hundreds of scraps are scattered over a large city", () => {
    // Walking the whole tour and dropping one stop per walk took two minutes, past the app's timeout.
    const { city, at } = scattered();

    const startedAt = performance.now();
    const route = buildRunPlanRoute(city, { budgetMeters: 10_000, start: at(20, 20), loop: true, salt: 1 });
    const elapsedMs = performance.now() - startedAt;

    expect(route.coordinates.at(-1)).toEqual(route.coordinates[0]);
    expect(route.pathMeters).toBeLessThanOrEqual(10_000 * 1.1);
    expect(route.uncoveredMeters).toBeGreaterThan(0);
    // ~0.5 s; three minutes before.
    expect(elapsedMs).toBeLessThan(3_000);
  });

  it("gives the same loop for the same request, however much searching it took", () => {
    // The search stops on effort spent, not on the clock: a slow server must not draw another route.
    const plan = () => {
      const { city, at } = scattered();
      return buildRunPlanRoute(city, { budgetMeters: 10_000, start: at(20, 20), loop: true, salt: 1 });
    };
    expect(plan().coordinates).toEqual(plan().coordinates);
  });

  it("plans a short loop in a city far larger than the run without walking the whole city", () => {
    // Paris shape: 16,000 streets, none run. A 3 km loop cannot leave the few blocks around its start.
    const { city, at } = blocks(90, () => false);
    const start = at(45, 45);

    const startedAt = performance.now();
    const { route, startsFromPosition } = planOuting(city, { budgetMeters: 3_000, start, loop: true });
    const elapsedMs = performance.now() - startedAt;

    expect(startsFromPosition).toBe(true);
    expect(route.coordinates.at(-1)).toEqual(route.coordinates[0]);
    expect(route.pathMeters).toBeGreaterThanOrEqual(3_000 * 0.7);
    expect(route.pathMeters).toBeLessThanOrEqual(3_000 * 1.1);
    expect(pathFollowsSegments(route.coordinates as [number, number][], city)).toBe(true);
    expect(elapsedMs).toBeLessThan(1_500);
  });

  it("still looks at the whole city when little is left to run near the athlete", () => {
    // Two streets left: one beside the athlete, one 3.5 km east, out of a 1 km run's reach. Seen alone, the
    // near one would pass for the whole city, and running it for finishing the city.
    const lastTwo = new Set(["1,0", "35,0"]);
    const { city, at } = blocks(40, (id, column, row) => id % 2 === 0 || !lastTwo.has(`${column},${row}`));
    const { route } = planOuting(city, { budgetMeters: 1_000, start: at(0, 0) });
    expect(route.uncoveredMeters).toBe(100);
    expect(route.coversAll).toBe(false);
  });

  it("takes back a dropped scrap the loop runs past, when it still fits", () => {
    // Two scraps on one street, 100 m apart: whatever the tour order makes of them, a loop that touches
    // the second one and has the distance for it does not leave it beside the line.
    const pair = new Set([3, 7]);
    const twoScraps = grid().map((street) => ({ ...street, covered: !pair.has(street.id) }));
    for (const budgetMeters of [700, 900, 1_200]) {
      const route = buildRunPlanRoute(twoScraps, { budgetMeters, start: athlete, loop: true });
      const run = new Set(streetsRun(route.coordinates));
      const onRoute = new Set(route.coordinates.map((point) => point.join(",")));
      for (const scrap of twoScraps.filter((street) => !street.covered)) {
        const [from, to] = scrap.coordinates.map((point) => point.join(","));
        const wasRun = run.has([from, to].sort().join("|"));
        const beside = onRoute.has(from!) || onRoute.has(to!);
        if (beside && !wasRun) expect(route.pathMeters + 2 * scrap.lengthMeters).toBeGreaterThan(budgetMeters * 1.1);
      }
    }
  });
});

describe("ways round and back", () => {
  /** Legs through these points, in order: each leg's heading is from its start to its end. */
  function legs(points: [number, number][]): Leg[] {
    let meters = 0;
    return points.slice(1).map((to, index) => {
      const from = points[index]!;
      const length = distanceMeters(from, to);
      const heading = (Math.atan2((to[0] - from[0]) * Math.cos((48 * Math.PI) / 180), to[1] - from[1]) * 180) / Math.PI;
      const leg = {
        from,
        to,
        headingIn: heading,
        headingOut: heading,
        startMeters: meters,
        endMeters: meters + length,
      };
      meters += length;
      return leg;
    });
  }
  // 30 m blocks: a roundabout-sized loop.
  const dLat = 30 / 111_320;
  const dLng = 30 / (111_320 * Math.cos((48 * Math.PI) / 180));
  const p = (x: number, y: number): [number, number] => [2 + x * dLng, 48 + y * dLat];

  it("counts going round a small block to come back out the way you came", () => {
    // In from the south, round the block, back out south: no single U-turn, but it runs as one.
    expect(waysRoundAndBack(legs([p(0, -1), p(0, 0), p(0, 1), p(1, 1), p(1, 0), p(0, 0), p(0, -1)]))).toBe(1);
  });

  it("does not count a street run straight on", () => {
    expect(waysRoundAndBack(legs([p(0, 0), p(0, 1), p(0, 2), p(0, 3), p(0, 4)]))).toBe(0);
  });

  it("does not count going round the block to carry on the other way", () => {
    // In from the south, round the block, out to the east: a turn, not a way back.
    expect(waysRoundAndBack(legs([p(0, -1), p(0, 0), p(0, 1), p(1, 1), p(1, 0), p(2, 0)]))).toBe(0);
  });

  it("does not count a loop round a block too large to be a turnaround", () => {
    const big = (x: number, y: number) => p(x * 4, y * 4);
    expect(
      waysRoundAndBack(legs([big(0, -1), big(0, 0), big(0, 1), big(1, 1), big(1, 0), big(0, 0), big(0, -1)])),
    ).toBe(0);
  });
});

describe("short dead ends", () => {
  // A row left to run, a short dead end off it, and one far piece that keeps a 2 km loop from finishing the city.
  const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
  const at = (column: number, row: number): [number, number] => [2 + column * 0.00135, 48 + row * 0.0009];
  const row = at(0, 1)[1];
  const streets = [
    ...grid().map((street) => ({
      ...street,
      covered: !(
        (street.coordinates[0]![1] === row && street.coordinates[1]![1] === row) ||
        (same(street.coordinates[0]!, at(6, 5)) && same(street.coordinates[1]!, at(6, 6)))
      ),
    })),
    seg(900, [at(3, 1), at(3, 0.2)], false, 80),
  ];
  const home = at(3, 3);
  const runsDeadEnd = (coordinates: number[][]) => coordinates.some((point) => same(point, at(3, 0.2)));

  it("leaves a short dead end out of a loop that does not finish the city", () => {
    const route = buildRunPlanRoute(streets, { budgetMeters: 2_000, start: home, loop: true });
    expect(route.coversAll).toBe(false);
    expect(route.uncoveredMeters).toBeGreaterThanOrEqual(600);
    expect(runsDeadEnd(route.coordinates)).toBe(false);
  });

  it("runs it in the loop that finishes the city", () => {
    const finish = estimateFinishMeters(streets, home, true)!;
    const { route } = planOuting(streets, { budgetMeters: Math.ceil(finish), start: home, loop: true });
    expect(route.coversAll).toBe(true);
    expect(runsDeadEnd(route.coordinates)).toBe(true);
  });
});

describe("junctions", () => {
  const step = 0.00135;

  it("turns into a street met halfway along a piece", () => {
    // Imported streets are cut every 50 m, not at crossings: the avenue is one piece, the side street ends on its middle.
    const avenue = seg(
      1,
      [
        [2, 48],
        [2 + step, 48],
        [2 + 2 * step, 48],
      ],
      true,
      200,
    );
    const sideStreet = seg(
      2,
      [
        [2 + step, 48],
        [2 + step, 48.0009],
      ],
      false,
      100,
    );
    const streets = [avenue, sideStreet];
    const route = buildRunPlanRoute(streets, { budgetMeters: 1_000, start: [2, 48], loop: true });
    expect(route.uncoveredMeters).toBe(100);
    expect(route.coordinates).toContainEqual([2 + step, 48.0009]);
    expect(pathFollowsSegments(route.coordinates as [number, number][], streets, 1)).toBe(true);
    expect(route.maneuvers.map((maneuver) => maneuver.type)).toEqual(["left", "u-turn", "right", "arrive"]);
  });

  it("does not jump between streets that only come close", () => {
    // 15 m apart and never touching: a railway between them, say. No junction, so no way across.
    const near = chain(1, 3, true);
    const far = chain(11, 3, false).map((piece) => ({
      ...piece,
      coordinates: piece.coordinates.map(([lng, lat]) => [lng!, lat! + 0.000135]),
    }));
    const { route } = planOuting([...near, ...far], { budgetMeters: 1_000, start: [2, 48], loop: true });
    expect(pathFollowsSegments(route.coordinates as [number, number][], [...near, ...far], 1)).toBe(true);
  });
});

describe("twin carriageways", () => {
  const named = (street: PlanSegment, name: string): PlanSegment => ({ ...street, name });
  // A boulevard drawn as two lines 13 m apart, three 100 m pieces each, closed into a ring by two short links.
  const boulevard = (southCovered: boolean): PlanSegment[] => [
    ...chain(1, 3, false).map((piece) => named(piece, "Boulevard A")),
    ...chain(11, 3, southCovered).map((piece) =>
      named({ ...piece, coordinates: piece.coordinates.map(([lng, lat]) => [lng!, lat! - 0.00012]) }, "Boulevard A"),
    ),
    seg(
      21,
      [
        [2, 48],
        [2, 48 - 0.00012],
      ],
      true,
      13,
    ),
    seg(
      22,
      [
        [2 + 3 * 0.00135, 48],
        [2 + 3 * 0.00135, 48 - 0.00012],
      ],
      true,
      13,
    ),
  ];

  it("runs one carriageway and counts both as conquered", () => {
    const route = buildRunPlanRoute(boulevard(false), { budgetMeters: 2_000, start: [2, 48], loop: true });
    expect(route.coversAll).toBe(true);
    expect(route.uncoveredMeters).toBe(600);
    // Out along one carriageway, back along the other: nothing left to fetch on a second pass.
    expect(route.pathMeters).toBeLessThan(700);
  });

  it("takes no credit from a neighbouring city's copy of the street", () => {
    const neighbour = chain(11, 3, true).map((piece) =>
      named(
        {
          ...piece,
          coordinates: piece.coordinates.map(([lng, lat]) => [lng!, lat! - 0.00012]),
          countsForCoverage: false,
        },
        "Boulevard A",
      ),
    );
    const streets = [...chain(1, 3, false).map((piece) => named(piece, "Boulevard A")), ...neighbour];
    const route = buildRunPlanRoute(streets, { budgetMeters: 2_000, start: [2, 48], loop: true });
    expect(route.uncoveredMeters).toBe(300);
  });

  it("does not take the far side of a hairpin for a second carriageway", () => {
    // One street doubling back on itself: parallel, 3 m apart, same name, and one line all the same.
    const up = named(
      seg(
        1,
        [
          [2, 48],
          [2, 48.00036],
        ],
        true,
        40,
      ),
      "Rue K",
    );
    const back = named(
      seg(
        2,
        [
          [2, 48.00036],
          [2.00008, 48.0002],
        ],
        false,
        20,
      ),
      "Rue K",
    );
    const route = buildRunPlanRoute([up, back], { budgetMeters: 1_000, start: [2, 48], loop: true });
    expect(route.uncoveredMeters).toBe(20);
    expect(route.coordinates).toContainEqual([2.00008, 48.0002]);
  });

  it("asks for nothing on a carriageway whose twin is already run", () => {
    const route = buildRunPlanRoute(boulevard(true), { budgetMeters: 2_000, start: [2, 48], loop: true });
    expect(route.coordinates).toHaveLength(0);
  });
});

describe("maneuvers", () => {
  it("classifies the change of heading", () => {
    expect(turnType(10)).toBeNull();
    expect(turnType(40)).toBe("slight-right");
    expect(turnType(90)).toBe("right");
    expect(turnType(-90)).toBe("left");
    expect(turnType(270)).toBe("left");
    expect(turnType(175)).toBe("u-turn");
  });

  it("announces a turn at a junction, named after the street taken, and the arrival", () => {
    const west: [number, number] = [2, 48];
    const junction: [number, number] = [2.00135, 48];
    const streets: PlanSegment[] = [
      seg(1, [west, junction], false, 100),
      { ...seg(2, [junction, [2.00135, 48.0009]], false, 100), name: "Rue du Nord" },
      seg(3, [junction, [2.0027, 48]], true, 100),
    ];
    const route = buildRunPlanRoute(streets, { budgetMeters: 200, start: west });
    expect(route.maneuvers).toEqual([
      { type: "left", name: "Rue du Nord", index: 1 },
      { type: "arrive", name: null, index: 2 },
    ]);
  });

  it("says nothing where two streets simply meet at a corner", () => {
    const route = buildRunPlanRoute(block(), { budgetMeters: 1_000, start: A, loop: true });
    expect(route.maneuvers.map((maneuver) => maneuver.type)).toEqual(["arrive"]);
  });
});

describe("runPlanRouteToGeoJson", () => {
  it("emits a single LineString feature for a non-empty route", () => {
    const geojson = runPlanRouteToGeoJson(
      {
        coordinates: [
          [2, 48],
          [2.01, 48],
        ],
        uncoveredMeters: 100,
        pathMeters: 100,
        start: [2, 48],
        jumpCount: 0,
        jumpMeters: 0,
        legs: [],
        coversAll: false,
        completeAtMeters: null,
        maneuvers: [],
      },
      42,
    );
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0]?.geometry.type).toBe("LineString");
    expect(geojson.features[0]?.properties).toEqual({ areaId: 42, kind: "route" });
  });
});
