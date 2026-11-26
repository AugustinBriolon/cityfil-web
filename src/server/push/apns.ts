import { connect } from "node:http2";

import { importPKCS8, SignJWT } from "jose";

import type { PushDevice } from "@/server/repositories/push-device-repository";

/** What the runner reads, already in their language, and the `cityfil://` screen a tap opens. */
export type ApnsAlert = { title: string; body: string; link: string };

export type ApnsResult = "sent" | "gone" | "failed";

export type ApnsSender = { send: (device: PushDevice, alert: ApnsAlert) => Promise<ApnsResult> };

export type ApnsCredentials = { keyId: string; teamId: string; privateKey: string };

/** Answer to one HTTP/2 request: what `send` needs to tell a dead token from a passing failure. */
export type ApnsTransport = (
  origin: string,
  headers: Record<string, string>,
  body: string,
) => Promise<{ status: number; reason: string | null }>;

const ORIGINS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" };
/** Apple refuses a token older than an hour and throttles one renewed more than every 20 minutes. */
const TOKEN_LIFETIME_MS = 50 * 60 * 1000;
/** Answers meaning the token will never work again: forget it. */
const GONE_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

export function apnsPayload(alert: ApnsAlert): string {
  return JSON.stringify({
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: "default",
    },
    link: alert.link,
  });
}

export function apnsOutcome(status: number, reason: string | null): ApnsResult {
  if (status === 200) return "sent";
  if (status === 410 || (reason && GONE_REASONS.has(reason))) return "gone";
  return "failed";
}

export function createApnsSender(
  credentials: ApnsCredentials,
  { transport = http2Transport, now = Date.now }: { transport?: ApnsTransport; now?: () => number } = {},
): ApnsSender {
  let signed: { jwt: string; at: number } | null = null;

  async function authorization() {
    if (!signed || now() - signed.at > TOKEN_LIFETIME_MS) {
      const key = await importPKCS8(credentials.privateKey, "ES256");
      const at = now();
      const jwt = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: credentials.keyId })
        .setIssuer(credentials.teamId)
        .setIssuedAt(Math.floor(at / 1000))
        .sign(key);
      signed = { jwt, at };
    }
    return `bearer ${signed.jwt}`;
  }

  return {
    async send(device, alert) {
      const { status, reason } = await transport(
        ORIGINS[device.environment],
        {
          ":method": "POST",
          ":path": `/3/device/${device.token}`,
          authorization: await authorization(),
          "apns-topic": device.topic,
          "apns-push-type": "alert",
          "content-type": "application/json",
        },
        apnsPayload(alert),
      );
      const outcome = apnsOutcome(status, reason);
      // Apple's reason is the only clue to a wrong key, team or environment: never drop it.
      if (outcome !== "sent")
        console.error(`APNs refused a push: ${status} ${reason ?? ""}`.trim(), device.environment);
      return outcome;
    },
  };
}

/** APNs speaks HTTP/2 only, which `fetch` does not: one short-lived session per notification is plenty here. */
const http2Transport: ApnsTransport = (origin, headers, body) =>
  new Promise((resolve, reject) => {
    const session = connect(origin);
    session.on("error", reject);
    const request = session.request(headers);
    let status = 0;
    let text = "";
    request.setEncoding("utf8");
    request.on("response", (responseHeaders) => {
      status = Number(responseHeaders[":status"]);
    });
    request.on("data", (chunk: string) => (text += chunk));
    request.on("end", () => {
      session.close();
      let reason: string | null = null;
      try {
        reason = text ? ((JSON.parse(text) as { reason?: string }).reason ?? null) : null;
      } catch {}
      resolve({ status, reason });
    });
    request.on("error", (error) => {
      session.close();
      reject(error);
    });
    request.setTimeout(10_000, () => request.close());
    request.end(body);
  });
