import { cn } from "@/lib/utils";

export type CityfilLogoProps = {
  className?: string;
};

/** Orbit geometry shared with the app icon (`public/brand/cityfil/app-icon.svg`, 256 × 256 canvas). */
export const CITYFIL_MARK = {
  orbitBack: "M24.16 169.96A112 34 -22 0 1 231.84 86.04",
  orbitFront: "M231.84 86.04A112 34 -22 0 1 24.16 169.96",
  orbitCut: "M232.35 87.67A112 34 -22 0 1 24.92 171.48",
  runner: { cx: 217.6, cy: 76.8, r: 15 },
  planet: { cx: 128, cy: 130, r: 56 },
} as const;

/** The city as a planet, the run as its orbit, the runner as the gold dot riding it. */
export function CityfilMark({ className }: { className?: string }) {
  const { orbitBack, orbitFront, orbitCut, runner, planet } = CITYFIL_MARK;
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" className={className}>
      <path d={orbitBack} fill="none" className="stroke-ember" strokeWidth="14" strokeLinecap="round" />
      <circle {...planet} className="fill-foreground" />
      <path d={orbitCut} fill="none" className="stroke-background" strokeWidth="28" />
      <path d={orbitFront} fill="none" className="stroke-ember" strokeWidth="14" strokeLinecap="round" />
      <circle {...runner} fill="#ffe08a" />
    </svg>
  );
}

export function CityfilLogo({ className }: CityfilLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <CityfilMark className="size-7" />
      <span>Cityfil</span>
    </span>
  );
}
