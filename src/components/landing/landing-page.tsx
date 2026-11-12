import { Crown, Flag, Medal, Route, ScanLine, Smartphone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CityfilLogo } from "@/components/brand/cityfil-logo";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in-stagger";
import { IOS_APP_STORE_URL } from "@/lib/ios-app-store";

const LINK_CLASS =
  "rounded-md text-sm text-muted-foreground transition-colors duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

function AppStoreButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={IOS_APP_STORE_URL}
      className={`inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-ember px-6 text-sm font-semibold text-ember-foreground transition-[background-color,transform] duration-150 ease-out outline-none hover:bg-ember/90 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] ${className}`}
    >
      <Smartphone className="size-4" aria-hidden="true" />
      Download on the App Store
    </a>
  );
}

/** A phone-shaped frame around a real app screenshot. */
function PhoneShot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-[2.4rem] border border-white/10 bg-black shadow-2xl shadow-black/60 ${className}`}
    >
      <Image src={src} alt={alt} width={660} height={1434} className="h-auto w-full" priority />
    </div>
  );
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="glass-panel flex flex-col gap-3 rounded-xl p-6">
      <span className="flex size-10 items-center justify-center rounded-lg bg-ember/15 text-ember" aria-hidden="true">
        {icon}
      </span>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </li>
  );
}

function Title({ icon, name, children }: { icon: ReactNode; name: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 text-ember" aria-hidden="true">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{name}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

/** Public home: what Cityfil is, how it works, and where to get it. */
export function LandingPage() {
  return (
    <div className="starfield min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-4">
        <CityfilLogo className="text-base" />
        <nav aria-label="Main" className="flex items-center gap-5">
          <Link href="/support" className={LINK_CLASS}>
            Support
          </Link>
          <Link href="/login" className={LINK_CLASS}>
            Sign in on the web
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-28 px-6 pb-20">
        <section className="grid items-center gap-14 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <FadeInStagger className="flex flex-col gap-6">
            <FadeInItem>
              <p className="eyebrow text-ember">Street conquest for runners</p>
            </FadeInItem>
            <FadeInItem>
              <h1 className="text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl">
                Run every street in your city.
              </h1>
            </FadeInItem>
            <FadeInItem>
              <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
                Cityfil turns your Strava runs into a map of the streets you&apos;ve conquered, city by city, in
                percent. Then it plans a run through the ones you haven&apos;t, and guides you street by street.
              </p>
            </FadeInItem>
            <FadeInItem className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <AppStoreButton />
              <span className="text-sm text-muted-foreground">Free · iPhone · Works with Strava</span>
            </FadeInItem>
          </FadeInStagger>

          <div className="relative mx-auto flex w-full max-w-md items-end justify-center" aria-hidden="false">
            <PhoneShot
              src="/marketing/03-route.webp"
              alt="A planned route through unfinished streets in Paris 11e"
              className="absolute bottom-8 left-0 w-[44%] -rotate-6 opacity-80 max-sm:hidden"
            />
            <PhoneShot
              src="/marketing/05-podium.webp"
              alt="A city podium with rivals and anonymous runners"
              className="absolute right-0 bottom-8 w-[44%] rotate-6 opacity-80 max-sm:hidden"
            />
            <PhoneShot
              src="/marketing/01-home.webp"
              alt="Cityfil home: kilometres conquered and every city with its percentage"
              className="relative z-10 w-[58%] max-sm:w-[78%]"
            />
          </div>
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <p className="eyebrow text-ember">How it works</p>
            <h2 id="how" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              From your past runs to your next street.
            </h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            <Step icon={<ScanLine className="size-5" />} title="Connect Strava">
              Your runs are imported and matched to the streets they cover. No account to create, nothing to log twice.
            </Step>
            <Step icon={<Flag className="size-5" />} title="See every city in percent">
              Conquered streets glow in ember, the ones left in gold. Each city shows how much is yours and what
              remains.
            </Step>
            <Step icon={<Route className="size-5" />} title="Run what's left">
              Pick a distance. Cityfil chains unfinished streets into one route from where you stand and tells you when
              a single run can finish the city.
            </Step>
          </ol>
        </section>

        <section aria-labelledby="rivals" className="grid items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <p className="eyebrow text-ember">Rivals</p>
            <h2 id="rivals" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Every city has a podium.
            </h2>
            <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
              See where you rank among everyone running the same streets, invite friends onto the board, and race for
              the titles that stay with a city.
            </p>
            <ul className="flex flex-col gap-5">
              <Title icon={<Flag className="size-5" />} name="Founder">
                The first runner to finish every street. Permanent.
              </Title>
              <Title icon={<Medal className="size-5" />} name="Conqueror">
                Finished it in the fewest kilometres.
              </Title>
              <Title icon={<Crown className="size-5" />} name="Keeper">
                Re-ran the most of the city this month. Up for grabs every month.
              </Title>
            </ul>
          </div>
          <div className="glass-panel flex flex-col gap-3 rounded-xl p-8">
            <p className="eyebrow text-muted-foreground">Private by default</p>
            <p className="text-lg leading-relaxed">
              On leaderboards you appear as an <span className="text-ember">anonymous runner</span>. Your name and photo
              only show to rivals you invited, or to everyone if you choose a public profile.
            </p>
            <Link href="/privacy" className={`${LINK_CLASS} self-start underline underline-offset-4`}>
              Read the privacy policy
            </Link>
          </div>
        </section>

        <section className="flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your city is waiting. Start with the street outside.
          </h2>
          <AppStoreButton />
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 border-t border-border px-6 py-8 pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          <Link href="/support" className={LINK_CLASS}>
            Support
          </Link>
          <Link href="/privacy" className={LINK_CLASS}>
            Privacy
          </Link>
          <Link href="/login" className={LINK_CLASS}>
            Web globe
          </Link>
        </nav>
        <div className="flex items-center gap-5">
          <Image src="/brand/strava/powered-by-strava-white.svg" alt="Powered by Strava" width={130} height={13} />
          <p className="text-sm text-muted-foreground">© 2026 Cityfil</p>
        </div>
      </footer>
    </div>
  );
}
