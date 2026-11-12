import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CityfilLogo } from "@/components/brand/cityfil-logo";
import { PRIVACY_CONTACT_EMAIL } from "@/components/privacy/privacy-policy";

export const metadata: Metadata = {
  title: "Support · Cityfil",
  description: "Answers about street coverage, runs, rivals and your account, and how to reach us.",
};

const LINK_CLASS =
  "text-foreground underline underline-offset-4 outline-none hover:text-ember focus-visible:ring-2 focus-visible:ring-ring";

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-2 text-base leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function SupportPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-6 pt-[max(3rem,env(safe-area-inset-top,0px))] pb-[max(3rem,env(safe-area-inset-bottom,0px))] sm:pt-[max(4rem,env(safe-area-inset-top,0px))]">
      <header className="flex items-center justify-between gap-4">
        <CityfilLogo className="text-base" />
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Home
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        <p className="eyebrow text-ember">Support</p>
        <h1 className="text-4xl font-semibold tracking-tight">How can we help?</h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Something not answered here? Write to{" "}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className={LINK_CLASS}>
            {PRIVACY_CONTACT_EMAIL}
          </a>{" "}
          and we&apos;ll get back to you within a few days.
        </p>
      </div>

      <Question title="How does Cityfil decide a street is conquered?">
        <p>
          Every street is cut into short pieces. A piece counts once your route runs along most of it, within about
          twenty metres. Shorter contacts give partial credit, so the percentage moves even before a whole street is
          done.
        </p>
      </Question>

      <Question title="A run is missing or didn't count">
        <p>
          Cityfil imports outdoor runs and trail runs from Strava. New runs arrive within a few minutes; pull down on
          the city list to sync now. Streets inside a Strava privacy zone are never sent to Cityfil, so they can&apos;t
          be counted.
        </p>
      </Question>

      <Question title="Why does the route ask me to come closer?">
        <p>
          A planned run starts where you stand, so you need to be in the city or within about a kilometre of it. From
          further away, Cityfil still shows the route and gives you walking directions to its start.
        </p>
      </Question>

      <Question title="How is &ldquo;finish it all&rdquo; calculated?">
        <p>
          Cityfil plans the actual run that goes through every street left, dead ends included, and shows its length.
          Choose that distance or more and the generated route covers them all.
        </p>
      </Question>

      <Question title="Who can see my name on leaderboards?">
        <p>
          By default you appear as an anonymous runner. Rivals you invited always see your name; everyone else only does
          if you turn on <span className="text-foreground">Show me on leaderboards</span> in Settings.
        </p>
      </Question>

      <Question title="How do I delete my account?">
        <p>
          In the app, open <span className="text-foreground">Settings</span>, then{" "}
          <span className="text-foreground">Delete my account</span>. Your profile, runs and coverage are erased and
          Cityfil&apos;s access to Strava is revoked. See the{" "}
          <Link href="/privacy" className={LINK_CLASS}>
            privacy policy
          </Link>{" "}
          for details.
        </p>
      </Question>
    </main>
  );
}
