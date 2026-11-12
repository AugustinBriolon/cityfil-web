"use client";

import { LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AdminActionResult } from "@/app/admin/actions";
import {
  PanelRow,
  PanelSection,
  RunnerAvatar,
  SegmentedControl,
  StatGrid,
} from "@/components/account/panel-primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { accountHealth, type AccountSummary } from "@/lib/account/account-summary";
import type { ProfileVisibility } from "@/lib/conquest/visibility";
import { formatKilometers, formatRelativeTime, formatWholeNumber } from "@/lib/format";
import type { RunSyncActionResult } from "@/lib/runs/run-sync-result";
import { cn } from "@/lib/utils";

import { AccountHealthBadge } from "./account-health-badge";

export type AdminAccountActions = {
  setVisibilityAction: (userId: string, visibility: ProfileVisibility) => Promise<AdminActionResult>;
  syncAction: (userId: string) => Promise<RunSyncActionResult>;
  deleteAction: (userId: string) => Promise<AdminActionResult>;
};

type Props = AdminAccountActions & {
  account: AccountSummary | null;
  onOpenChange: (open: boolean) => void;
};

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
] as const;

/** One account in detail, with every admin action on it. */
export function AccountDetailDialog({ account, onOpenChange, ...actions }: Props) {
  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto overscroll-contain p-5 sm:max-w-xl">
        {/* Keyed so a different account never inherits the previous one's delete confirmation. */}
        {account && (
          <AccountDetail key={account.id} account={account} onDone={() => onOpenChange(false)} {...actions} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccountDetail({
  account,
  onDone,
  setVisibilityAction,
  syncAction,
  deleteAction,
}: AdminAccountActions & { account: AccountSummary; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"visibility" | "sync" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const canDelete = confirmation.trim() === account.displayName.trim();

  function run(action: "visibility" | "sync" | "delete", task: () => Promise<AdminActionResult | RunSyncActionResult>) {
    setPendingAction(action);
    startTransition(async () => {
      const result = await task();
      setPendingAction(null);
      if (result.status === "error") return void toast.error(result.message);
      if ("syncedRuns" in result) toast.success(`${result.syncedRuns} new run${result.syncedRuns === 1 ? "" : "s"}`);
      else toast.success(result.message);
      if (action === "delete") onDone();
    });
  }

  return (
    <>
      <div className="flex items-center gap-3 pr-8">
        <RunnerAvatar displayName={account.displayName} avatarUrl={account.avatarUrl} className="size-12" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle className="truncate text-lg font-semibold tracking-tight">{account.displayName}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <AccountHealthBadge health={accountHealth(account)} />
            <span className="font-mono text-[0.75rem] text-muted-foreground select-all">{account.id}</span>
          </DialogDescription>
        </div>
      </div>

      <StatGrid
        stats={[
          { label: "Runs", value: formatWholeNumber(account.runCount) },
          { label: "Kilometers", value: formatKilometers(account.distanceMeters) },
          { label: "Cities", value: formatWholeNumber(account.cityCount) },
          { label: "Joined", value: formatRelativeTime(account.joinedAt) },
        ]}
      />

      <PanelSection title="Manage">
        <PanelRow label="Profile visibility" description="Controls hall-of-fame appearance">
          <SegmentedControl
            label="Profile visibility"
            value={account.visibility}
            options={VISIBILITY_OPTIONS}
            disabled={pending}
            onChange={(next) => run("visibility", () => setVisibilityAction(account.id, next))}
          />
        </PanelRow>
        <PanelRow
          label="Strava sync"
          description={`Last synced ${formatRelativeTime(account.lastSyncedAt).toLowerCase()} · last run ${formatRelativeTime(account.lastRunAt).toLowerCase()}`}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !account.stravaConnected}
            aria-busy={pendingAction === "sync"}
            onClick={() => run("sync", () => syncAction(account.id))}
          >
            <RefreshCw className={cn(pendingAction === "sync" && "animate-spin")} aria-hidden="true" />
            {pendingAction === "sync" ? "Syncing…" : "Force sync"}
          </Button>
        </PanelRow>
      </PanelSection>

      <PanelSection
        title="Delete account"
        tone="danger"
        description="Revokes Strava access and permanently erases this runner's runs, coverage and cities."
      >
        <form
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (canDelete) run("delete", () => deleteAction(account.id));
          }}
        >
          <label className="flex flex-1 flex-col gap-1.5 text-[0.8rem] text-muted-foreground">
            <span>
              Type <span className="font-medium text-foreground">{account.displayName}</span> to confirm
            </span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-[border-color,box-shadow] duration-150 ease-out outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <Button
            type="submit"
            variant="destructive"
            disabled={!canDelete || pending}
            aria-busy={pendingAction === "delete"}
          >
            {pendingAction === "delete" ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            {pendingAction === "delete" ? "Deleting…" : "Delete"}
          </Button>
        </form>
      </PanelSection>
    </>
  );
}
