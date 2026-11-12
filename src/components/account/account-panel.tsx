"use client";

import { ArrowLeft, ExternalLink, LogOut, RefreshCw, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { SetVisibilityResult } from "@/app/account/actions";
import { CityfilLogo } from "@/components/brand/cityfil-logo";
import { DeleteDataDialog } from "@/components/dashboard/delete-data-dialog";
import { Button } from "@/components/ui/button";
import { useRunSync } from "@/hooks/use-run-sync";
import type { AccountSummary } from "@/lib/account/account-summary";
import type { ProfileVisibility } from "@/lib/conquest/visibility";
import { formatKilometers, formatRelativeTime, formatWholeNumber } from "@/lib/format";
import type { RunSyncActionResult } from "@/lib/runs/run-sync-result";
import { cn } from "@/lib/utils";

import { PanelRow, PanelSection, RunnerAvatar, SegmentedControl, StatGrid } from "./panel-primitives";

export type AccountPanelProps = {
  account: AccountSummary;
  setVisibilityAction: (visibility: ProfileVisibility) => Promise<SetVisibilityResult>;
  syncAction: () => Promise<RunSyncActionResult>;
  reconnectAction: () => Promise<void>;
  signOutAction: () => Promise<void>;
  deleteDataAction: () => Promise<void>;
};

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "privacy", label: "Privacy" },
  { id: "strava", label: "Strava" },
  { id: "account", label: "Account" },
] as const;

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
] as const;

const POWERED_BY_STRAVA = { src: "/brand/strava/powered-by-strava-white.svg", width: 365, height: 37 };

/** The runner's account panel: overview, privacy, Strava connection, sign out and deletion. */
export function AccountPanel({
  account,
  setVisibilityAction,
  syncAction,
  reconnectAction,
  signOutAction,
  deleteDataAction,
}: AccountPanelProps) {
  const [visibility, setVisibility] = useState(account.visibility);
  const [visibilityPending, startVisibility] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { status, sync } = useRunSync({ syncAction, syncOnMount: false });
  const syncing = status === "syncing";

  function chooseVisibility(next: ProfileVisibility) {
    const previous = visibility;
    setVisibility(next);
    startVisibility(async () => {
      const result = await setVisibilityAction(next);
      if (result.status === "error") {
        setVisibility(previous);
        toast.error(result.message);
        return;
      }
      toast.success(next === "public" ? "Profile is public" : "Profile is private");
    });
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/globe"
            className="-ml-2 flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Globe
          </Link>
          <CityfilLogo className="text-sm" />
          <span className="w-16" aria-hidden="true" />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 pt-8 pb-[max(3rem,env(safe-area-inset-bottom,0px))] sm:px-6 md:grid-cols-[11rem_1fr] md:gap-12 md:pt-12">
        <nav aria-label="Account sections" className="max-md:hidden">
          <ul className="sticky top-24 flex flex-col gap-0.5">
            {NAV.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="flex h-8 items-center rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 ease-out outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex max-w-2xl min-w-0 flex-col gap-10">
          <div id="overview" className="flex scroll-mt-24 flex-col gap-6">
            <div className="flex items-center gap-4">
              <RunnerAvatar
                displayName={account.displayName}
                avatarUrl={account.avatarUrl}
                className="size-14 text-xl"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <h1 className="truncate text-2xl leading-tight font-semibold tracking-tight">{account.displayName}</h1>
                <p className="text-sm text-muted-foreground">
                  Runner since{" "}
                  {account.joinedAt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                </p>
              </div>
            </div>
            <StatGrid
              stats={[
                { label: "Runs", value: formatWholeNumber(account.runCount) },
                { label: "Kilometers", value: formatKilometers(account.distanceMeters) },
                { label: "Cities", value: formatWholeNumber(account.cityCount) },
                { label: "Last run", value: formatRelativeTime(account.lastRunAt) },
              ]}
            />
          </div>

          <PanelSection
            id="privacy"
            title="Privacy"
            description="Public runners appear on a city's hall of fame as Founder, Conqueror or Keeper. Invited rivals always see you."
          >
            <PanelRow
              label="Profile visibility"
              description={
                visibility === "public" ? "Anyone can see your name on city boards" : "Only rivals you invite"
              }
            >
              <SegmentedControl
                label="Profile visibility"
                value={visibility}
                options={VISIBILITY_OPTIONS}
                onChange={chooseVisibility}
                disabled={visibilityPending}
              />
            </PanelRow>
            <PanelRow label="Privacy policy" description="What Cityfil stores and why">
              <Button variant="ghost" size="sm" render={<Link href="/privacy" />} nativeButton={false}>
                Read
                <ExternalLink aria-hidden="true" />
              </Button>
            </PanelRow>
          </PanelSection>

          <PanelSection
            id="strava"
            title="Strava"
            description="New outdoor GPS runs import automatically. Sync pulls them right now."
          >
            <PanelRow
              label={
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      account.stravaConnected ? "bg-layer-covered" : "bg-destructive",
                    )}
                  />
                  {account.stravaConnected ? "Connected" : "Not connected"}
                </span>
              }
              description={
                account.historyImportRunning
                  ? "Importing your run history…"
                  : `Last synced ${formatRelativeTime(account.lastSyncedAt).toLowerCase()}`
              }
            >
              <Button variant="outline" size="sm" onClick={sync} disabled={syncing} aria-busy={syncing}>
                <RefreshCw className={cn(syncing && "animate-spin")} aria-hidden="true" />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </PanelRow>
            <PanelRow label="Permissions" description="Missing runs? Grant Cityfil access to your activities again.">
              <form action={reconnectAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Reconnect
                </Button>
              </form>
            </PanelRow>
            <div className="px-4 py-3">
              <Image {...POWERED_BY_STRAVA} alt="Powered by Strava" className="h-3 w-auto" />
            </div>
          </PanelSection>

          <PanelSection id="account" title="Account">
            <PanelRow label="Sign out" description="On this browser only">
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm">
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </form>
            </PanelRow>
          </PanelSection>

          <PanelSection title="Danger zone" tone="danger">
            <PanelRow
              label="Delete account"
              description="Revokes Strava access and erases your runs, coverage and cities. Your Strava activities stay."
            >
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden="true" />
                Delete…
              </Button>
            </PanelRow>
          </PanelSection>
        </main>
      </div>

      <DeleteDataDialog open={deleteOpen} onOpenChange={setDeleteOpen} deleteAction={deleteDataAction} />
    </div>
  );
}
