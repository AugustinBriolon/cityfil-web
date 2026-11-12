import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_MAX_AGE_MS,
  ADMIN_USERNAME,
  authenticateAdmin,
  isAdminSessionFresh,
  resetAdminLoginAttemptsForTests,
} from "./admin-auth";
import { hashAdminPassword, isAdminPasswordHash, verifyAdminPassword } from "./admin-password";

describe("admin password hashing", () => {
  it("verifies the original password and rejects others", async () => {
    const password = `hash-fixture-${randomUUID()}`;
    const hash = await hashAdminPassword(password);

    expect(isAdminPasswordHash(hash)).toBe(true);
    expect(hash).not.toContain(password);
    expect(hash).not.toContain("$");
    await expect(verifyAdminPassword(password, hash)).resolves.toBe(true);
    await expect(verifyAdminPassword(`${password}-nope`, hash)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    const password = `salt-fixture-${randomUUID()}`;
    expect(await hashAdminPassword(password)).not.toBe(await hashAdminPassword(password));
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyAdminPassword("x", "plain-text")).resolves.toBe(false);
    expect(isAdminPasswordHash("scrypt:only-salt")).toBe(false);
  });
});

describe("authenticateAdmin", () => {
  let hash: string;
  let password: string;

  beforeAll(async () => {
    // Generated per run so no username/password pair is committed.
    password = `auth-fixture-${randomUUID()}`;
    hash = await hashAdminPassword(password);
  });

  beforeEach(() => {
    resetAdminLoginAttemptsForTests();
  });

  it("accepts the admin username with the right password", async () => {
    await expect(authenticateAdmin({ username: ADMIN_USERNAME, password }, hash)).resolves.toBe(true);
  });

  it("rejects a wrong username, a wrong password and non-string input", async () => {
    await expect(authenticateAdmin({ username: "root", password }, hash)).resolves.toBe(false);
    await expect(authenticateAdmin({ username: ADMIN_USERNAME, password: "nope" }, hash)).resolves.toBe(false);
    await expect(authenticateAdmin({ username: [ADMIN_USERNAME], password }, hash)).resolves.toBe(false);
  });

  it("is disabled when no hash is configured", async () => {
    await expect(authenticateAdmin({ username: ADMIN_USERNAME, password }, undefined)).resolves.toBe(false);
  });

  it("locks out after 10 attempts in 15 minutes, even with the right password", async () => {
    const now = new Date("2026-11-12T10:00:00Z");
    for (let attempt = 0; attempt < 10; attempt++) {
      await authenticateAdmin({ username: ADMIN_USERNAME, password: "guess" }, hash, now);
    }

    await expect(authenticateAdmin({ username: ADMIN_USERNAME, password }, hash, now)).resolves.toBe(false);
    const later = new Date(now.getTime() + 15 * 60 * 1000 + 1);
    await expect(authenticateAdmin({ username: ADMIN_USERNAME, password }, hash, later)).resolves.toBe(true);
  });
});

describe("isAdminSessionFresh", () => {
  const now = new Date("2026-11-12T10:00:00Z");

  it("expires admin sessions after 8 hours", () => {
    expect(isAdminSessionFresh(now.getTime() - 60_000, now)).toBe(true);
    expect(isAdminSessionFresh(now.getTime() - ADMIN_SESSION_MAX_AGE_MS, now)).toBe(false);
    expect(isAdminSessionFresh(undefined, now)).toBe(false);
  });
});
