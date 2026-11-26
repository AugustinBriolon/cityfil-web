import type { Metadata } from "next";
import { headers } from "next/headers";

import { CityfilLogo } from "@/components/brand/cityfil-logo";
import {
  inviteShareCopy,
  inviteShareDescription,
  inviteShareHeadline,
  titleChips,
} from "@/lib/conquest/invite-share-card";
import { shareLanguage } from "@/lib/conquest/share-language";
import { formatPercent } from "@/lib/format";
import { IOS_APP_STORE_URL } from "@/lib/ios-app-store";
import { loadInvitePreview } from "@/server/conquest/load-invite-preview";

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string | string[] }> };

export const dynamic = "force-dynamic";

/** `?lang=` from the app that shared the link, else the reader's browser. */
async function languageOf(searchParams: PageProps["searchParams"]) {
  const { lang } = await searchParams;
  return shareLanguage(typeof lang === "string" ? lang : null, (await headers()).get("accept-language"));
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const language = await languageOf(searchParams);
  const copy = inviteShareCopy[language];
  const preview = await loadInvitePreview(token);
  const image = { url: `/invite/${token}/og?lang=${language}`, width: 1200, height: 630, alt: copy.alt };
  const title = preview ? inviteShareHeadline(preview, language) : copy.expiredCard;
  const description = preview ? inviteShareDescription(preview, language) : copy.expiredCardBody;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "Cityfil",
      type: "website",
      locale: language === "fr" ? "fr_FR" : "en_US",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function InviteLandingPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const language = await languageOf(searchParams);
  const copy = inviteShareCopy[language];
  const preview = await loadInvitePreview(token);
  const appUrl = `cityfil://invite/${token}`;

  return (
    <main
      lang={language}
      className="starfield relative flex min-h-dvh flex-col items-center justify-center px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
    >
      <CityfilLogo className="absolute top-[max(1.5rem,env(safe-area-inset-top,0px))] left-6 text-base" />
      <section className="glass-panel flex w-full max-w-md flex-col gap-5 rounded-xl p-8">
        <p className="eyebrow text-ember">{copy.eyebrow}</p>
        {preview ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">{inviteShareHeadline(preview, language)}</h1>
            <p className="text-4xl font-semibold tracking-tight text-ember">
              {preview.inviterShare == null ? "—" : formatPercent(preview.inviterShare, language)}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{inviteShareDescription(preview, language)}</p>
            <ul className="flex flex-wrap gap-2">
              {titleChips(preview, language).map((chip) => (
                <li
                  key={chip.name}
                  className={
                    chip.open
                      ? "rounded-full bg-ember/15 px-3 py-1 text-xs font-semibold text-ember"
                      : "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
                  }
                >
                  {chip.name} {chip.open ? copy.open : copy.claimed}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">{copy.howTo}</p>
            <div className="flex flex-col gap-3">
              <a
                href={appUrl}
                className="flex min-h-12 items-center justify-center rounded-lg bg-ember text-sm font-semibold text-ember-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                {copy.openInApp}
              </a>
              <a
                href={IOS_APP_STORE_URL}
                className="flex min-h-12 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                {copy.getApp}
              </a>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">{copy.expiredTitle}</h1>
            <p className="text-sm text-muted-foreground">{copy.expiredBody}</p>
          </>
        )}
      </section>
    </main>
  );
}
