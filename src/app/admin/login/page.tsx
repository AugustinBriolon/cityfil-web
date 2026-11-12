import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { CityfilLogo } from "@/components/brand/cityfil-logo";
import { isAdminSession } from "@/server/session";

import { signInAsAdmin } from "./actions";

export const metadata: Metadata = {
  title: "Admin sign in · Cityfil",
  robots: { index: false, follow: false },
};

export default async function AdminLoginRoute() {
  if (await isAdminSession()) redirect("/admin");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <CityfilLogo className="text-base" />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Admin console</h1>
            <p className="text-sm text-muted-foreground">Restricted. Runners sign in with Strava.</p>
          </div>
        </div>
        <AdminLoginForm signInAction={signInAsAdmin} />
      </div>
    </main>
  );
}
