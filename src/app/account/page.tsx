import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountPanel } from "@/components/account/account-panel";
import { getServices } from "@/server/services";
import { requireCurrentUser } from "@/server/session";

import { deleteMyData, reconnectStrava, signOutFromCityfil, syncRuns } from "../globe/actions";
import { setProfileVisibility } from "./actions";

export const metadata: Metadata = {
  title: "Account · Cityfil",
  description: "Your runs, privacy, Strava connection and account controls.",
};

export default async function AccountRoute() {
  const user = await requireCurrentUser();
  const account = await getServices().accountSummaries.find(user.id);
  if (!account) redirect("/login");

  return (
    <AccountPanel
      account={account}
      setVisibilityAction={setProfileVisibility}
      syncAction={syncRuns}
      reconnectAction={reconnectStrava}
      signOutAction={signOutFromCityfil}
      deleteDataAction={deleteMyData}
    />
  );
}
