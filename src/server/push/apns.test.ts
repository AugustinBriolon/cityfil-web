import { generateKeyPairSync } from "node:crypto";

import { decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it, vi } from "vitest";

import { apnsOutcome, apnsPayload, createApnsSender, type ApnsTransport } from "./apns";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const credentials = {
  keyId: "ABCDE12345",
  teamId: "TEAM123456",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const device = { token: "f".repeat(64), topic: "run.cityfil.app", environment: "sandbox" as const };
const alert = { titleKey: "push.analysisComplete.title", bodyKey: "push.analysisComplete.body", link: "cityfil://map" };

describe("apnsPayload", () => {
  it("lets the device word the alert in its own language and says where a tap goes", () => {
    expect(JSON.parse(apnsPayload({ ...alert, bodyArgs: ["Trappes"], link: "cityfil://city/49540" }))).toEqual({
      aps: {
        alert: {
          "title-loc-key": "push.analysisComplete.title",
          "loc-key": "push.analysisComplete.body",
          "loc-args": ["Trappes"],
        },
        sound: "default",
      },
      link: "cityfil://city/49540",
    });
  });
});

describe("apnsOutcome", () => {
  it("tells a dead token from a passing failure", () => {
    expect(apnsOutcome(200, null)).toBe("sent");
    expect(apnsOutcome(410, "Unregistered")).toBe("gone");
    expect(apnsOutcome(400, "BadDeviceToken")).toBe("gone");
    expect(apnsOutcome(429, "TooManyRequests")).toBe("failed");
    expect(apnsOutcome(500, null)).toBe("failed");
  });
});

describe("createApnsSender", () => {
  it("signs with the team key and addresses the device's own app and environment", async () => {
    const transport = vi.fn<ApnsTransport>(async () => ({ status: 200, reason: null }));
    const sender = createApnsSender(credentials, { transport, now: () => 1_800_000_000_000 });

    await expect(sender.send(device, alert)).resolves.toBe("sent");

    const [origin, headers] = transport.mock.calls[0]!;
    expect(origin).toBe("https://api.sandbox.push.apple.com");
    expect(headers[":path"]).toBe(`/3/device/${device.token}`);
    expect(headers["apns-topic"]).toBe("run.cityfil.app");
    const jwt = headers.authorization!.replace("bearer ", "");
    expect(decodeProtectedHeader(jwt)).toEqual({ alg: "ES256", kid: "ABCDE12345" });
    expect(decodeJwt(jwt)).toEqual({ iss: "TEAM123456", iat: 1_800_000_000 });
  });

  it("reuses its signing token for 50 minutes, then renews it", async () => {
    let clock = 1_800_000_000_000;
    const transport = vi.fn<ApnsTransport>(async () => ({ status: 200, reason: null }));
    const sender = createApnsSender(credentials, { transport, now: () => clock });

    await sender.send(device, alert);
    clock += 49 * 60 * 1000;
    await sender.send(device, alert);
    clock += 2 * 60 * 1000;
    await sender.send(device, alert);

    const tokens = transport.mock.calls.map(([, headers]) => headers.authorization);
    expect(tokens[1]).toBe(tokens[0]);
    expect(tokens[2]).not.toBe(tokens[0]);
  });
});
