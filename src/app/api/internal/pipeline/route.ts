import { after } from "next/server";

import { getServerEnv } from "@/server/env";
import { pipelineHopSchema, verifyPipelineHop } from "@/server/pipeline/pipeline-hop";
import { runPipelineHop } from "@/server/services/city-pipeline";

/** One hop is one invocation: the whole budget goes to a single step (a big city's street import). */
export const maxDuration = 300;

/** Background hop sent by this app to itself (see `pipeline-hop.ts`). Signed with AUTH_SECRET. */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-cityfil-hop-signature");
  if (!verifyPipelineHop(getServerEnv().AUTH_SECRET, body, signature, Date.now())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {}
  const parsed = pipelineHopSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_hop" }, { status: 400 });

  after(() => runPipelineHop(parsed.data));
  return new Response(null, { status: 202 });
}
