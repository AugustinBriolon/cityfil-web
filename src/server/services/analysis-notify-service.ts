import type { ApnsSender } from "@/server/push/apns";
import { analysisCompleteCopy } from "@/server/push/push-copy";
import { analysisCompletePayload, sendExpoPush } from "@/server/push/expo-push";
import type { PushDeviceRepository } from "@/server/repositories/push-device-repository";
import type { UserRepository } from "@/server/repositories/user-repository";

export type AnalysisNotifyService = {
  /** Sends the completion push once, then clears the pending flag even if nothing could be notified. */
  notifyIfPending: (userId: string) => Promise<"sent" | "cleared" | "skipped">;
};

type Dependencies = {
  users: Pick<UserRepository, "findById" | "setAnalysisNotifyPending">;
  devices: Pick<PushDeviceRepository, "listForUser" | "forget">;
  /** Null when no APNs key is configured: only the Expo token (the older app) is notified. */
  apns: ApnsSender | null;
};

export function createAnalysisNotifyService({ users, devices, apns }: Dependencies): AnalysisNotifyService {
  /** Every device of the runner; a dead token is forgotten, any other failure only logged. */
  async function notifyDevices(userId: string): Promise<boolean> {
    if (!apns) return false;
    let sent = false;
    for (const device of await devices.listForUser(userId)) {
      const result = await apns
        .send(device, { ...analysisCompleteCopy(device.locale), link: "cityfil://map" })
        .catch((error: unknown) => {
          console.error("APNs push failed", error);
          return "failed" as const;
        });
      if (result === "gone") await devices.forget(device.token);
      sent ||= result === "sent";
    }
    return sent;
  }

  async function notifyExpo(token: string | null): Promise<boolean> {
    if (!token) return false;
    try {
      await sendExpoPush(analysisCompletePayload(token));
      return true;
    } catch (error) {
      console.error("Analysis complete push failed", error);
      return false;
    }
  }

  return {
    async notifyIfPending(userId) {
      const user = await users.findById(userId);
      if (!user?.analysisNotifyPending) return "skipped";

      const [native, expo] = await Promise.all([notifyDevices(userId), notifyExpo(user.expoPushToken)]);
      await users.setAnalysisNotifyPending(userId, false);
      return native || expo ? "sent" : "cleared";
    },
  };
}
