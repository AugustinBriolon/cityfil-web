import { NextResponse } from "next/server";

import { isNextResponse, requireMobileUser } from "@/server/mobile/request-auth";
import { getServices } from "@/server/services";

type RouteContext = { params: Promise<{ areaId: string }> };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Everyone ranked on one city by share covered; only public profiles and your rivals carry a name. */
export async function GET(request: Request, context: RouteContext) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;

  const areaId = Number((await context.params).areaId);
  if (!Number.isInteger(areaId) || areaId <= 0) {
    return NextResponse.json({ error: "invalid_area" }, { status: 400 });
  }
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested) ? Math.min(MAX_LIMIT, Math.max(1, requested)) : DEFAULT_LIMIT;

  const ranking = await getServices().conquest.getCityRanking(userOrError.id, areaId, limit);
  if (!ranking) return NextResponse.json({ error: "city_not_on_profile" }, { status: 404 });
  return NextResponse.json(ranking);
}
