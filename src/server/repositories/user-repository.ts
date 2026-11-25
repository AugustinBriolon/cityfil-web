import { eq, inArray } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { users, type User } from "@/server/db/schema";

export type UserRepository = {
  findById: (userId: string) => Promise<User | undefined>;
  findByIds: (userIds: readonly string[]) => Promise<User[]>;
  updateProfile: (userId: string, profile: Pick<User, "displayName" | "avatarUrl">) => Promise<void>;
  updateVisibility: (userId: string, profileVisibility: User["profileVisibility"]) => Promise<void>;
  updatePushToken: (userId: string, expoPushToken: string | null) => Promise<void>;
  setAnalysisNotifyPending: (userId: string, pending: boolean) => Promise<void>;
  /** Runners whose first analysis has not been announced yet. */
  listAnalysisPendingIds: (limit: number) => Promise<string[]>;
  delete: (userId: string) => Promise<void>;
};

export function createUserRepository(database: Database): UserRepository {
  return {
    async findById(userId) {
      return database.query.users.findFirst({ where: eq(users.id, userId) });
    },
    async findByIds(userIds) {
      if (userIds.length === 0) return [];
      const unique = [...new Set(userIds)];
      return database.query.users.findMany({ where: inArray(users.id, unique) });
    },
    async updateProfile(userId, profile) {
      await database.update(users).set(profile).where(eq(users.id, userId));
    },
    async updateVisibility(userId, profileVisibility) {
      await database.update(users).set({ profileVisibility }).where(eq(users.id, userId));
    },
    async updatePushToken(userId, expoPushToken) {
      await database.update(users).set({ expoPushToken }).where(eq(users.id, userId));
    },
    async setAnalysisNotifyPending(userId, pending) {
      await database.update(users).set({ analysisNotifyPending: pending }).where(eq(users.id, userId));
    },
    async listAnalysisPendingIds(limit) {
      const rows = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.analysisNotifyPending, true))
        .limit(limit);
      return rows.map((row) => row.id);
    },
    async delete(userId) {
      await database.delete(users).where(eq(users.id, userId));
    },
  };
}
