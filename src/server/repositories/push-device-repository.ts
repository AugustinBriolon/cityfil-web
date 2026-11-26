import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

export type PushEnvironment = "sandbox" | "production";
export type PushDevice = { token: string; topic: string; environment: PushEnvironment; locale: string };

export type PushDeviceRepository = {
  /** Binds the token to this runner: a device passed to another account stops notifying the first one. */
  register: (userId: string, device: PushDevice) => Promise<void>;
  unregister: (userId: string, token: string) => Promise<void>;
  listForUser: (userId: string) => Promise<PushDevice[]>;
  /** APNs said the token is gone (app deleted, notifications turned off for good). */
  forget: (token: string) => Promise<void>;
};

export function createPushDeviceRepository(database: Database): PushDeviceRepository {
  return {
    async register(userId, { token, topic, environment, locale }) {
      await database.execute(sql`
        INSERT INTO push_devices (token, user_id, topic, environment, locale)
        VALUES (${token}, ${userId}, ${topic}, ${environment}, ${locale})
        ON CONFLICT (token) DO UPDATE
        SET user_id = EXCLUDED.user_id, topic = EXCLUDED.topic, environment = EXCLUDED.environment,
            locale = EXCLUDED.locale, updated_at = now()
      `);
    },
    async unregister(userId, token) {
      await database.execute(sql`DELETE FROM push_devices WHERE token = ${token} AND user_id = ${userId}`);
    },
    async listForUser(userId) {
      return database.execute<PushDevice>(sql`
        SELECT token, topic, environment, locale FROM push_devices WHERE user_id = ${userId}
      `);
    },
    async forget(token) {
      await database.execute(sql`DELETE FROM push_devices WHERE token = ${token}`);
    },
  };
}
