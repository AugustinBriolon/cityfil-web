import { NextResponse } from "next/server";
import { z } from "zod";

import { isNextResponse, requireMobileUser } from "@/server/mobile/request-auth";
import { getServices } from "@/server/services";

type RouteContext = { params: Promise<{ areaId: string }> };

const startSchema = z
  .object({
    startLat: z.coerce.number().min(-90).max(90).optional(),
    startLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((query) => (query.startLat == null) === (query.startLng == null), {
    message: "startLat and startLng go together",
  });

/**
 * Outing length that runs every unfinished street of the city in one go, from the athlete's position
 * when given. `finishMeters` is null when no single run (≤ 30 km) can finish it.
 */
export async function GET(request: Request, context: RouteContext) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;

  const areaId = Number((await context.params).areaId);
  const url = new URL(request.url);
  const parsed = startSchema.safeParse({
    startLat: url.searchParams.get("startLat") ?? undefined,
    startLng: url.searchParams.get("startLng") ?? undefined,
  });
  if (!Number.isInteger(areaId) || areaId <= 0 || !parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const services = getServices();
  const city = (await services.coverage.listCityCoverage(userOrError.id)).find((entry) => entry.areaId === areaId);
  if (!city) return NextResponse.json({ error: "city_not_found" }, { status: 404 });
  if (city.status !== "ready") return NextResponse.json({ error: "city_pending" }, { status: 409 });

  const { startLat, startLng } = parsed.data;
  const start = startLat != null && startLng != null ? { lat: startLat, lng: startLng } : undefined;
  const finishMeters = await services.coverage.getFinishMeters(userOrError.id, areaId, start);
  return NextResponse.json(
    { areaId, finishMeters: finishMeters == null ? null : Math.ceil(finishMeters) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
