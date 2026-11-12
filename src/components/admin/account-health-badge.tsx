import type { AccountHealth } from "@/lib/account/account-summary";
import { cn } from "@/lib/utils";

const HEALTH: Record<AccountHealth, { label: string; dot: string }> = {
  healthy: { label: "Healthy", dot: "bg-layer-covered" },
  importing: { label: "Importing", dot: "bg-layer-remaining" },
  stale: { label: "Stale sync", dot: "bg-layer-remaining" },
  disconnected: { label: "No Strava", dot: "bg-destructive" },
};

/** Dot + word: color is never the only signal. */
export function AccountHealthBadge({ health, className }: { health: AccountHealth; className?: string }) {
  const { label, dot } = HEALTH[health];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.8rem] text-muted-foreground", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
