import { NextResponse } from "next/server";

import { isNextResponse, requireMobileUser } from "@/server/mobile/request-auth";
import { getServices } from "@/server/services";

/**
 * Covered and/or uncovered street geometries for the mobile conquest map.
 * `kind=covered|uncovered|both` (default both when areaId set; covered-only when global).
 */
export async function GET(request: Request) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;

  const url = new URL(request.url);
  const areaParam = url.searchParams.get("areaId");
  const areaId = areaParam ? Number(areaParam) : null;
  const kind = url.searchParams.get("kind") ?? (areaId != null ? "both" : "covered");

  const area = areaId != null && Number.isFinite(areaId) ? areaId : undefined;
  if (kind !== "covered" && area == null) {
    return NextResponse.json({ error: "areaId_required_for_uncovered" }, { status: 400 });
  }

  // Only the layers asked for, filtered in SQL, side by side.
  const coverage = getServices().coverage;
  const none = { type: "FeatureCollection" as const, features: [] };
  const [covered, uncovered] = await Promise.all([
    kind === "uncovered" ? none : coverage.getCoveredStreets(userOrError.id, area),
    kind === "covered" || area == null ? none : coverage.getUncoveredStreets(userOrError.id, area),
  ]);
  return NextResponse.json({ covered, uncovered });
}
