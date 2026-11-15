import { describe, expect, it } from "vitest";

import {
  bridgeBudgetMeters,
  buildRunPlanRoute,
  distanceMeters,
  estimateFinishMeters,
  MAX_ANCHOR_SNAP_METERS,
  planOuting,
  planPocketExpandDegrees,
  runPlanRouteToGeoJson,
  turnType,
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
    // ~80 m north of the chain — still within MAX_ANCHOR_SNAP_METERS, not on a node.
    const athlete: [number, number] = [2.0, 48.0 + 0.00072];
    expect(distanceMeters(athlete, [2.0, 48.0])).toBeGreaterThan(50);
    expect(distanceMeters(athlete, [2.0, 48.0])).toBeLessThan(MAX_ANCHOR_SNAP_METERS);

    const route = buildRunPlanRoute(pieces, { budgetMeters: 1_000, start: athlete });

    expect(route.start).toEqual(athlete);
    expect(route.coordinates[0]).toEqual(athlete);
    expect(route.jumpCount).toBe(1);
    expect(route.jumpMeters).toBeGreaterThan(50);
    expect(route.legs[0]?.kind).toBe("jump");
    // On-network walk starts after the GPS approach jump.
    expect(pathFollowsSegments(route.coordinates.slice(1) as [number, number][], pieces)).toBe(true);
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

  it("stays fast when many sub-tolerance stubs touch one large unfinished pocket", () => {
    // Paris shape: stubs shorter than the join tolerance collapse to a single node, so they have no
    // graph edge. Each one used to re-flood the whole pocket, blowing seed ranking up quadratically.
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
    // ~30 ms now; the quadratic version took ~1.2 s on this fixture.
    expect(elapsedMs).toBeLessThan(400);
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
    const route = buildRunPlanRoute([...block(), ...deadEnd], { budgetMeters: 1_500, start: A, loop: true });
    expect(route.uncoveredMeters).toBe(400);
    expect(route.coordinates.every(([lng]) => lng! <= C[0] + 1e-9)).toBe(true);
    expect(route.coordinates.at(-1)).toEqual(A);
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
