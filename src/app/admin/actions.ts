"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { signOut } from "@/auth";
import { parseProfileVisibility } from "@/lib/conquest/visibility";
import type { RunSyncActionResult } from "@/lib/runs/run-sync-result";
import { syncRunsNow } from "@/server/runs/sync-runs-now";
import { getServices } from "@/server/services";
import { requireAdmin } from "@/server/session";

export type AdminActionResult = { status: "success"; message: string } | { status: "error"; message: string };

const userIdSchema = z.uuid();

// Server Actions are public endpoints: every one re-checks the admin role and validates its input.
async function authorize(action: string, userId: unknown): Promise<string | null> {
  await requireAdmin();
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return null;
  // Audit trail in the platform logs; no runner data beyond the internal id.
  console.info(JSON.stringify({ audit: "admin", action, userId: parsed.data, at: new Date().toISOString() }));
  return parsed.data;
}

const INVALID_ACCOUNT: AdminActionResult = { status: "error", message: "Unknown account." };

export async function adminSetVisibility(userId: string, visibility: string): Promise<AdminActionResult> {
  const id = await authorize("set-visibility", userId);
  const parsed = parseProfileVisibility(visibility);
  if (!id || !parsed) return INVALID_ACCOUNT;
  await getServices().users.updateVisibility(id, parsed);
  refresh();
  return { status: "success", message: parsed === "public" ? "Profile is now public" : "Profile is now private" };
}

export async function adminSyncRuns(userId: string): Promise<RunSyncActionResult> {
  const id = await authorize("sync-runs", userId);
  if (!id) return { status: "error", reason: "unknown", message: INVALID_ACCOUNT.message };
  const result = await syncRunsNow(id);
  refresh();
  return result;
}

export async function adminDeleteAccount(userId: string): Promise<AdminActionResult> {
  const id = await authorize("delete-account", userId);
  if (!id) return INVALID_ACCOUNT;
  // Same path as self-deletion: revoke Strava access first, then cascade every row.
  await getServices().accountDeletion.deleteAccount(id);
  refresh();
  return { status: "success", message: "Account deleted" };
}

export async function adminSignOut() {
  await signOut({ redirectTo: "/admin/login" });
}
