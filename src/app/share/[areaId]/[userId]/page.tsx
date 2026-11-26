import type { Metadata } from "next";
import { headers } from "next/headers";

import { CityfilLogo } from "@/components/brand/cityfil-logo";
import {
  scoreShareCopy,
  scoreShareDescription,
  scoreShareHeadline,
  scoreShareRank,
} from "@/lib/conquest/score-share-card";
import { shareLanguage } from "@/lib/conquest/share-language";
import { formatPercent } from "@/lib/format";
import { IOS_APP_STORE_URL } from "@/lib/ios-app-store";
import { loadScorePreview } from "@/server/conquest/load-score-preview";

type PageProps = {
  params: Promise<{ areaId: string; userId: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
};

export const dynamic = "force-dynamic";

/** `?lang=` from the app that shared the link, else the reader's browser. */
async function languageOf(searchParams: PageProps["searchParams"]) {
  const { lang } = await searchParams;
  return shareLanguage(typeof lang === "string" ? lang : null, (await headers()).get("accept-language"));
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { areaId, userId } = await params;
  const language = await languageOf(searchParams);
  const preview = await loadScorePreview(areaId, userId);
  const copy = scoreShareCopy[language];
  const title = preview ? scoreShareHeadline(preview, language) : "Cityfil";
  const description = preview ? scoreShareDescription(preview, language) : `${copy.fallback}.`;
  const image = { url: `/share/${areaId}/${userId}/og?lang=${language}`, width: 1200, height: 630, alt: copy.alt };
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

export default async function ScoreSharePage({ params, searchParams }: PageProps) {
  const { areaId, userId } = await params;
  const language = await languageOf(searchParams);
  const preview = await loadScorePreview(areaId, userId);
  const copy = scoreShareCopy[language];

  return (
    <main
      lang={language}
      className="starfield relative flex min-h-dvh flex-col items-center justify-center px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
    >
      <CityfilLogo className="absolute top-[max(1.5rem,env(safe-area-inset-top,0px))] left-6 text-base" />
      <section className="glass-panel flex w-full max-w-md flex-col gap-5 rounded-xl p-8">
        {preview ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{preview.cityName}</h1>
            <p className="text-5xl font-semibold tracking-tight text-ember">{formatPercent(preview.share, language)}</p>
            <p className="text-sm text-muted-foreground">
              {[preview.runnerName, scoreShareRank(preview, language)].filter(Boolean).join(" · ")}
            </p>
          </>
        ) : (
          <h1 className="text-3xl font-semibold tracking-tight">{copy.fallback}.</h1>
        )}
        <a
          href={IOS_APP_STORE_URL}
          className="flex min-h-12 items-center justify-center rounded-lg bg-ember text-sm font-semibold text-ember-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          {copy.getApp}
        </a>
      </section>
    </main>
  );
}
