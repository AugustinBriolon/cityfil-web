import type { Metadata } from "next";

import { CityfilLogo } from "@/components/brand/cityfil-logo";
import { scoreShareHeadline, scoreShareRank } from "@/lib/conquest/score-share-card";
import { formatPercent } from "@/lib/format";
import { IOS_APP_STORE_URL } from "@/lib/ios-app-store";
import { loadScorePreview } from "@/server/conquest/load-score-preview";

type PageProps = { params: Promise<{ areaId: string; userId: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { areaId, userId } = await params;
  const preview = await loadScorePreview(areaId, userId);
  const title = preview ? scoreShareHeadline(preview) : "Cityfil — run every street";
  const description = preview
    ? `${scoreShareRank(preview)} on ${preview.cityName}.`
    : "Conquer your city street by street.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: "Cityfil", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ScoreSharePage({ params }: PageProps) {
  const { areaId, userId } = await params;
  const preview = await loadScorePreview(areaId, userId);

  return (
    <main className="starfield relative flex min-h-dvh flex-col items-center justify-center px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <CityfilLogo className="absolute top-[max(1.5rem,env(safe-area-inset-top,0px))] left-6 text-base" />
      <section className="glass-panel flex w-full max-w-md flex-col gap-5 rounded-xl p-8">
        {preview ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">{preview.cityName}</h1>
            <p className="text-5xl font-semibold tracking-tight text-ember">{formatPercent(preview.share)}</p>
            <p className="text-sm text-muted-foreground">
              {[preview.runnerName, scoreShareRank(preview)].filter(Boolean).join(" · ")}
            </p>
          </>
        ) : (
          <h1 className="text-3xl font-semibold tracking-tight">Run every street of your city.</h1>
        )}
        <a
          href={IOS_APP_STORE_URL}
          className="flex min-h-12 items-center justify-center rounded-lg bg-ember text-sm font-semibold text-ember-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          Get Cityfil on the App Store
        </a>
      </section>
    </main>
  );
}
