"use client";

import { ChevronRight, LogOut, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { RunnerAvatar, StatGrid } from "@/components/account/panel-primitives";
import { CityfilLogo } from "@/components/brand/cityfil-logo";
import { Button } from "@/components/ui/button";
import { accountHealth, filterAccounts, type AccountSummary } from "@/lib/account/account-summary";
import { formatKilometers, formatRelativeTime, formatWholeNumber } from "@/lib/format";

import { AccountDetailDialog, type AdminAccountActions } from "./account-detail-dialog";
import { AccountHealthBadge } from "./account-health-badge";

export type AdminConsoleProps = AdminAccountActions & {
  accounts: readonly AccountSummary[];
  signOutAction: () => Promise<void>;
};

/** Admin overview of every runner account; selecting a row opens its actions. */
export function AdminConsole({ accounts, signOutAction, ...actions }: AdminConsoleProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => filterAccounts(accounts, deferredQuery), [accounts, deferredQuery]);
  // Looked up from fresh server data so the dialog reflects every action, and closes once the account is deleted.
  const selected = accounts.find((account) => account.id === selectedId) ?? null;
  const needAttention = accounts.filter((account) => {
    const health = accountHealth(account);
    return health === "stale" || health === "disconnected";
  }).length;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <CityfilLogo className="text-sm" />
            <span className="rounded-md bg-ember/15 px-1.5 py-0.5 text-[0.7rem] font-semibold text-ember">Admin</span>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-8 pb-[max(3rem,env(safe-area-inset-bottom,0px))] sm:px-6 md:pt-12">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Every runner on Cityfil. Open one to sync, change visibility or delete.
          </p>
        </div>

        <StatGrid
          stats={[
            { label: "Accounts", value: formatWholeNumber(accounts.length) },
            { label: "Public", value: formatWholeNumber(accounts.filter((a) => a.visibility === "public").length) },
            { label: "Runs", value: formatWholeNumber(accounts.reduce((sum, a) => sum + a.runCount, 0)) },
            { label: "Need attention", value: formatWholeNumber(needAttention) },
          ]}
        />

        <section aria-label="Account list" className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">Search accounts</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or id"
              className="h-10 w-full rounded-xl border border-input bg-card/60 pr-3 pl-9 text-sm transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
            <div
              aria-hidden="true"
              className="grid grid-cols-[1fr_auto] gap-4 border-b border-border px-4 py-2 text-[0.75rem] text-muted-foreground md:grid-cols-[minmax(0,1fr)_7rem_6rem_6rem_8rem_1rem]"
            >
              <span>Runner</span>
              <span className="max-md:hidden">Status</span>
              <span className="text-right max-md:hidden">Runs</span>
              <span className="text-right max-md:hidden">Km</span>
              <span className="text-right max-md:hidden">Last sync</span>
            </div>
            {visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {accounts.length === 0 ? "No accounts yet." : `No account matches “${deferredQuery}”.`}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((account) => (
                  <li key={account.id}>
                    <AccountRow account={account} onOpen={() => setSelectedId(account.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="px-1 text-[0.8rem] text-muted-foreground tabular-nums">
            {visible.length} of {accounts.length} accounts
          </p>
        </section>
      </main>

      <AccountDetailDialog account={selected} onOpenChange={(open) => !open && setSelectedId(null)} {...actions} />
    </div>
  );
}

/** Row hover is instant (high-frequency); only the press scales, for feedback. */
function AccountRow({ account, onOpen }: { account: AccountSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:grid-cols-[minmax(0,1fr)_7rem_6rem_6rem_8rem_1rem]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <RunnerAvatar displayName={account.displayName} avatarUrl={account.avatarUrl} className="size-8 text-xs" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{account.displayName}</span>
          <span className="truncate text-[0.8rem] text-muted-foreground">
            {account.visibility === "public" ? "Public" : "Private"} · joined{" "}
            {formatRelativeTime(account.joinedAt).toLowerCase()}
          </span>
        </span>
      </span>
      <AccountHealthBadge health={accountHealth(account)} className="max-md:hidden" />
      <span className="text-right text-sm tabular-nums max-md:hidden">{formatWholeNumber(account.runCount)}</span>
      <span className="text-right text-sm tabular-nums max-md:hidden">{formatKilometers(account.distanceMeters)}</span>
      <span className="text-right text-[0.8rem] text-muted-foreground max-md:hidden">
        {formatRelativeTime(account.lastSyncedAt)}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
