import { z } from "zod";

/**
 * Strava athlete and activity ids, as decimal strings. Strava moves them to 64-bit values in June 2027,
 * beyond what a JavaScript number holds exactly, so they never go through `number`.
 */
export type StravaId = string;

/**
 * Accepts an id as a decimal string (`id_str`, or an integer kept as text by {@link parseStravaJson})
 * or as a JSON number that is still exact.
 */
export const stravaIdSchema = z.union([
  z.string().regex(/^[1-9]\d*$/),
  z
    .number()
    .int()
    .positive()
    .refine(Number.isSafeInteger, "Strava id lost precision; read the raw JSON with parseStravaJson")
    .transform(String),
]);

/**
 * `JSON.parse` that keeps integers too large for a JavaScript number as their exact decimal text,
 * so 64-bit Strava ids survive (`webhook object_id`, `upload activity_id` have no `_str` twin).
 */
export function parseStravaJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) =>
    typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value) && context?.source
      ? context.source
      : value,
  );
}

/** Subset of Strava's SummaryActivity used by Cityfil. */
export const stravaActivitySchema = z.object({
  id: stravaIdSchema,
  athlete: z.object({ id: stravaIdSchema }),
  name: z.string(),
  sport_type: z.string(),
  start_date: z.string(),
  distance: z.number(),
  moving_time: z.number(),
  total_elevation_gain: z.number(),
  map: z.object({
    summary_polyline: z.string().nullish(),
  }),
});

export type StravaActivity = z.infer<typeof stravaActivitySchema>;

export const stravaTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
});

export type StravaTokenResponse = z.infer<typeof stravaTokenResponseSchema>;

/** Authorization-code exchange includes the athlete profile Strava embeds in the token response. */
export const stravaAuthorizationTokenResponseSchema = stravaTokenResponseSchema.extend({
  athlete: z.unknown(),
});

export type StravaAuthorizationTokenResponse = z.infer<typeof stravaAuthorizationTokenResponseSchema>;

/** Strava processes uploads asynchronously: `activity_id` appears once the file became an activity. */
export const stravaUploadSchema = z.object({
  id: z.number(),
  error: z.string().nullish(),
  status: z.string(),
  activity_id: stravaIdSchema.nullish(),
});

export type StravaUpload = z.infer<typeof stravaUploadSchema>;

export const stravaWebhookEventSchema = z.object({
  object_type: z.enum(["activity", "athlete"]),
  object_id: stravaIdSchema,
  aspect_type: z.enum(["create", "update", "delete"]),
  owner_id: stravaIdSchema,
  subscription_id: z.number(),
  event_time: z.number(),
  updates: z.record(z.string(), z.string()).optional(),
});

export type StravaWebhookEvent = z.infer<typeof stravaWebhookEventSchema>;
