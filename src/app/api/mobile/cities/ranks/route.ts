import { NextResponse } from "next/server";

import { isNextResponse, requireMobileUser } from "@/server/mobile/request-auth";
import { getServices } from "@/server/services";

/** The viewer's rank in every city on their profile, out of how many runners, in one request. */
export async function GET(request: Request) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;
  return NextResponse.json(await getServices().conquest.getCityRanks(userOrError.id), {
    headers: { "Cache-Control": "no-store" },
  });
}
