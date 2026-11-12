import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** A titled group of rows, iOS inset-grouped style: the label sits outside, the rows share one surface. */
export function PanelSection({
  id,
  title,
  description,
  children,
  tone = "default",
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="flex scroll-mt-24 flex-col gap-2.5">
      <div className="flex flex-col gap-1 px-1">
        <h2
          id={id ? `${id}-title` : undefined}
          className={cn("text-[0.8rem] font-medium", tone === "danger" ? "text-destructive" : "text-muted-foreground")}
        >
          {title}
        </h2>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      <div
        className={cn(
          "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border bg-card/60",
          tone === "danger" ? "border-destructive/25" : "border-border",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** One line of a section: what it is on the left, its control on the right (stacks on narrow screens). */
export function PanelRow({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-14 flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-[0.8rem] text-pretty text-muted-foreground">{description}</span>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export type Stat = { label: string; value: string };

/** Big tabular numbers; no count-up, these are read, not watched. */
export function StatGrid({ stats }: { stats: readonly Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-1 bg-card px-4 py-3.5">
          <dt className="text-[0.8rem] text-muted-foreground">{stat.label}</dt>
          <dd className="truncate text-xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RunnerAvatar({
  displayName,
  avatarUrl,
  className,
}: {
  displayName: string;
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    // Decorative: the name always sits next to it.
    <Avatar aria-hidden="true" className={cn("size-10", className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-ember/15 font-semibold text-ember">
        {displayName.trim().charAt(0).toUpperCase() || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string };

/** Two-to-four option switch with radio semantics; the selected pill moves without animation (frequent action). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={disabled}
      className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => !selected && onChange(option.value)}
            className={cn(
              "h-7 rounded-md px-3 text-[0.8rem] font-medium transition-[color,background-color,transform] duration-150 ease-out outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring enabled:active:scale-[0.96] disabled:opacity-60",
              selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
