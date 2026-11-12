# 16. Admin console with a separate password identity

Date: 2026-11-12

## Status

Accepted. Amends [ADR 0003](0003-sign-in-with-strava-only-and-encrypt-provider-tokens.md): runners still sign in
with Strava only; one operator identity now signs in with a password.

## Context

Operating the tester cohort needs a view over every account (runs, cities, sync health) and a few corrective
actions: force a Strava sync, change a profile's visibility, delete an account. The admin is the most powerful
identity in the system, so how it authenticates matters more than how its pages look.

Options considered:

1. **Admin flag on a Strava user.** No new credential, but anyone who takes over that Strava account becomes
   admin, and Strava downtime locks the operator out.
2. **Separate Auth.js Credentials identity (chosen).** Independent of Strava, reuses the existing JWT session.
3. **External SSO / IP allowlist.** Stronger, but a new dependency for a single operator.

## Decision

- Auth.js gets a second provider, `admin` (Credentials), beside Strava. Username is fixed (`admin`).
- Only an scrypt hash is stored, in `ADMIN_PASSWORD_HASH` (`scrypt:<salt>:<key>`, base64url — `:` because Next.js
  expands `$` in `.env` files). It is generated with `pnpm admin:hash-password` (password on stdin). Without the
  variable the console is disabled. Comparison is constant-time.
- Login is throttled to 10 attempts per 15 minutes per instance, globally (not per IP).
- The admin JWT carries `role: "admin"` and `adminIssuedAt`; the role is dropped after 8 hours.
- `requireAdmin()` runs in the page **and** in every Server Action; inputs are zod-validated; every action writes a
  JSON audit line (`audit: "admin"`, action, user id) to the platform logs.
- Admin deletion reuses `AccountDeletionService` (revoke Strava, then cascade) — never a raw `DELETE`.
- Account aggregates come from one query (`AccountSummaryRepository`) shared with the runner's own `/account` panel.

## Consequences

- One shared password: rotate it by regenerating the hash and updating the env on Vercel.
- The throttle is per serverless instance and in memory; a distributed attacker gets more guesses. Upgrade to a
  shared store (or SSO) if the console ever has more than one operator or the app goes public.
- Audit lines live only as long as the log retention. Move them to a table if actions need to be reviewable later.
- No MFA. Acceptable for a tester cohort; revisit with option 3 before general availability.
