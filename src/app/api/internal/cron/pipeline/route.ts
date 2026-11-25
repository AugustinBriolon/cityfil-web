import { timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { getServerEnv } from "@/server/env";
import { getServices } from "@/server/services";
import { DRAIN_BUDGET_MS, runPipelineHop } from "@/server/services/city-pipeline";
import { runPipelineWatchdog } from "@/server/services/pipeline-watchdog";

export const maxDuration = 300;

function isCronCall(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Every minute (see `vercel.json`): restarts background work nobody is driving any more. */
export async function GET(request: Request) {
  if (!isCronCall(request)) return Response.json({ error: "forbidden" }, { status: 403 });

  const deadline = Date.now() + DRAIN_BUDGET_MS;
  after(async () => {
    const { users, accounts, cityImportQueue } = getServices();
    await runPipelineWatchdog(
      { users, accounts, cityImportQueue, runHop: runPipelineHop },
      () => Date.now() >= deadline,
    ).catch((error: unknown) => console.error("Pipeline watchdog failed", error));
  });
  return new Response(null, { status: 202 });
}
