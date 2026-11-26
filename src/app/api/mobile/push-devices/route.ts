import { NextResponse } from "next/server";
import { z } from "zod";

import { isNextResponse, requireMobileUser } from "@/server/mobile/request-auth";
import { getServices } from "@/server/services";

/** Only Cityfil's own app: a token is useless to APNs under any other topic, and must not reach other apps. */
export const PUSH_TOPICS = ["run.cityfil.app"] as const;

const tokenSchema = z.string().regex(/^[0-9a-f]{64,200}$/i);

const registerSchema = z.object({
  token: tokenSchema,
  topic: z.enum(PUSH_TOPICS),
  environment: z.enum(["sandbox", "production"]),
});

/** The native app's APNs token, sent after the runner allows notifications and on every launch. */
export async function POST(request: Request) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  await getServices().pushDevices.register(userOrError.id, parsed.data);
  return new Response(null, { status: 204 });
}

/** Sign-out: this device stops receiving the runner's notifications. */
export async function DELETE(request: Request) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;

  const parsed = z.object({ token: tokenSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  await getServices().pushDevices.unregister(userOrError.id, parsed.data.token);
  return new Response(null, { status: 204 });
}
