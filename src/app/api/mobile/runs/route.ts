import { NextResponse } from "next/server";

import { getTracesBounds, toRunStartPoints, toRunTraces } from "@/lib/runs/run-geojson";
import { isNextResponse, requireMobileUser } from "@/server/mobile/request-auth";
import { toRunSummary } from "@/server/runs/to-run-summary";
import { getServices } from "@/server/services";

/**
 * The athlete's run traces as GeoJSON for the mobile globe.
 * With `areaId`, only the stretches run inside that city are returned, cut at its boundary.
 */
export async function GET(request: Request) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;

  const services = getServices();
  const areaParam = new URL(request.url).searchParams.get("areaId");
  const areaId = areaParam ? Number(areaParam) : null;

  const activities = await services.activities.listByUser(userOrError.id);
  let runs = activities.map(toRunSummary);
  let runCount = runs.length;
  if (areaId != null && Number.isInteger(areaId) && areaId > 0) {
    const partsInArea = await services.coverage.listRunPartsInArea(userOrError.id, areaId);
    runCount = partsInArea.size;
    runs = runs.flatMap((run) => (partsInArea.get(run.id) ?? []).map((polyline) => ({ ...run, polyline })));
  }

  const traces = toRunTraces(runs);
  const startPoints = toRunStartPoints(traces);

  return NextResponse.json({
    runCount,
    traces,
    startPoints,
    bounds: getTracesBounds(traces),
  });
}
