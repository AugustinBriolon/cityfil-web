import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_MAX_AGE_MS,
  authenticateAdmin,
  isAdminSessionFresh,
  resetAdminLoginAttemptsForTests,
} from "./admin-auth";
import { hashAdminPassword, isAdminPasswordHash, verifyAdminPassword } from "./admin-password";

describe("admin password hashing", () => {
  it("verifies the original password and rejects others", async () => {
    const hash = await hashAdminPassword("correct horse");

    expect(isAdminPasswordHash(hash)).toBe(true);
    expect(hash).not.toContain("correct horse");
    expect(hash).not.toContain("$");
    await expect(verifyAdminPassword("correct horse", hash)).resolves.toBe(true);
    await expect(verifyAdminPassword("correct hors", hash)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashAdminPassword("same")).not.toBe(await hashAdminPassword("same"));
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyAdminPassword("x", "plain-text")).resolves.toBe(false);
    expect(isAdminPasswordHash("scrypt:only-salt")).toBe(false);
  });
});

describe("authenticateAdmin", () => {
  let hash: string;

  beforeAll(async () => {
    hash = await hashAdminPassword("s3cret!");
  });

  beforeEach(() => {
    resetAdminLoginAttemptsForTests();
  });

  it("accepts the admin username with the right password", async () => {
    await expect(authenticateAdmin({ username: "admin", password: "s3cret!" }, hash)).resolves.toBe(true);
  });

  it("rejects a wrong username, a wrong password and non-string input", async () => {
    await expect(authenticateAdmin({ username: "root", password: "s3cret!" }, hash)).resolves.toBe(false);
    await expect(authenticateAdmin({ username: "admin", password: "nope" }, hash)).resolves.toBe(false);
    await expect(authenticateAdmin({ username: ["admin"], password: "s3cret!" }, hash)).resolves.toBe(false);
  });

  it("is disabled when no hash is configured", async () => {
    await expect(authenticateAdmin({ username: "admin", password: "s3cret!" }, undefined)).resolves.toBe(false);
  });

  it("locks out after 10 attempts in 15 minutes, even with the right password", async () => {
    const now = new Date("2026-11-12T10:00:00Z");
    for (let attempt = 0; attempt < 10; attempt++) {
      await authenticateAdmin({ username: "admin", password: "guess" }, hash, now);
    }

    await expect(authenticateAdmin({ username: "admin", password: "s3cret!" }, hash, now)).resolves.toBe(false);
    const later = new Date(now.getTime() + 15 * 60 * 1000 + 1);
    await expect(authenticateAdmin({ username: "admin", password: "s3cret!" }, hash, later)).resolves.toBe(true);
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
