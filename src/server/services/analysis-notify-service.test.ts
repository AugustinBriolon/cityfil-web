import { describe, expect, it, vi } from "vitest";

import type { User } from "@/server/db/schema";
import type { ApnsSender } from "@/server/push/apns";
import type { PushDevice } from "@/server/repositories/push-device-repository";

import { createAnalysisNotifyService } from "./analysis-notify-service";

const now = new Date("2026-10-06T12:00:00Z");
const phone: PushDevice = {
  token: "a".repeat(64),
  topic: "run.cityfil.app",
  environment: "production",
  locale: "fr-FR",
};
const oldPad: PushDevice = {
  token: "b".repeat(64),
  topic: "run.cityfil.app",
  environment: "production",
  locale: "fr-FR",
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    displayName: "Ada",
    avatarUrl: null,
    profileVisibility: "private",
    expoPushToken: null,
    analysisNotifyPending: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness({ pending = true, devices = [] as PushDevice[], apns = null as ApnsSender | null } = {}) {
  const users = {
    findById: vi.fn(async () => user({ analysisNotifyPending: pending })),
    setAnalysisNotifyPending: vi.fn(),
  };
  const deviceStore = { listForUser: vi.fn(async () => devices), forget: vi.fn() };
  return { users, deviceStore, service: createAnalysisNotifyService({ users, devices: deviceStore, apns }) };
}

describe("createAnalysisNotifyService", () => {
  it("skips when analysis is not pending", async () => {
    const { service, users } = harness({ pending: false });
    await expect(service.notifyIfPending("user-1")).resolves.toBe("skipped");
    expect(users.setAnalysisNotifyPending).not.toHaveBeenCalled();
  });

  it("clears the flag when pending but nothing can be notified", async () => {
    const { service, users } = harness();
    await expect(service.notifyIfPending("user-1")).resolves.toBe("cleared");
    expect(users.setAnalysisNotifyPending).toHaveBeenCalledWith("user-1", false);
  });

  it("notifies every device of the runner and forgets a token APNs says is gone", async () => {
    const send = vi.fn(async (device: PushDevice) => (device === oldPad ? ("gone" as const) : ("sent" as const)));
    const { service, deviceStore, users } = harness({ devices: [phone, oldPad], apns: { send } });

    await expect(service.notifyIfPending("user-1")).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith(phone, {
      title: "Ta carte est prête 🗺️",
      body: "Toutes tes courses sont posées. Viens voir les rues qui t'appartiennent déjà 👀",
      link: "cityfil://map",
    });
    expect(deviceStore.forget).toHaveBeenCalledWith(oldPad.token);
    expect(deviceStore.forget).toHaveBeenCalledTimes(1);
    expect(users.setAnalysisNotifyPending).toHaveBeenCalledWith("user-1", false);
  });

  it("still clears the flag when APNs fails", async () => {
    const send = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const { service, users } = harness({ devices: [phone], apns: { send } });

    await expect(service.notifyIfPending("user-1")).resolves.toBe("cleared");
    expect(users.setAnalysisNotifyPending).toHaveBeenCalledWith("user-1", false);
  });
});
