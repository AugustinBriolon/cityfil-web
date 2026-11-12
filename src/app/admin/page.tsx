import type { Metadata } from "next";

import { AdminConsole } from "@/components/admin/admin-console";
import { getServices } from "@/server/services";
import { requireAdmin } from "@/server/session";

import { adminDeleteAccount, adminSetVisibility, adminSignOut, adminSyncRuns } from "./actions";

export const metadata: Metadata = {
  title: "Admin · Cityfil",
  robots: { index: false, follow: false },
};

export default async function AdminRoute() {
  await requireAdmin();
  const accounts = await getServices().accountSummaries.list();

  return (
    <AdminConsole
      accounts={accounts}
      setVisibilityAction={adminSetVisibility}
      syncAction={adminSyncRuns}
      deleteAction={adminDeleteAccount}
      signOutAction={adminSignOut}
    />
  );
}
