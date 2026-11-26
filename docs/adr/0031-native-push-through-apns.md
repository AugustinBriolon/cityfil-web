# 31. Native push through APNs

Date: 2026-11-26

## Status

Accepted.

## Context

The only push Cityfil sends, "your streets are ready", goes to an Expo push token: the native SwiftUI app has
none, so it receives nothing. The roadmap's next notifications (a run synced in the background, a rival passing
you) need a way to reach the native app first. Expo's service could relay to APNs, but only for Expo apps.

## Decision

- **APNs directly**, with a token-based key: `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_PRIVATE_KEY` (the `.p8`
  file's text). All three or none; without them native push is off and nothing else changes.
- **HTTP/2 from Node** (`node:http2`, since `fetch` cannot), signed with an ES256 JWT built by `jose`, renewed
  every 50 minutes. One short-lived HTTP/2 session per notification: volumes are a few per runner per day.
- **One row per device** in `push_devices` (token, runner, bundle id, APNs environment), registered by
  `POST /api/mobile/push-devices` and removed by `DELETE` on sign-out. The bundle id travels with the token
  because Debug (`run.cityfil.app.dev`, sandbox) and App Store builds are two apps to APNs; only Cityfil's two
  bundle ids are accepted. A token APNs reports as gone is deleted.
- **Words on the device**: payloads carry `title-loc-key` / `loc-key`, resolved against the app's own strings,
  so a notification reads in the runner's language without the server knowing it.

## Consequences

- The Expo token keeps working for the older app; the two run side by side until it is retired.
- A device signed in to another account moves to it: one device, one runner.
- New notification kinds only add a call to the sender and two strings in the app.
- The migration `0012_push_devices` must reach production before the app registers devices.

## References

- `src/server/push/apns.ts`, `src/server/repositories/push-device-repository.ts`,
  `src/app/api/mobile/push-devices/route.ts`, `src/server/services/analysis-notify-service.ts`
