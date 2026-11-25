import { ImageResponse } from "next/og";

import { OgBrand } from "@/components/brand/og-brand";
import { scoreShareRank, type ScoreSharePreview } from "@/lib/conquest/score-share-card";
import { formatPercent } from "@/lib/format";
import { loadScorePreview } from "@/server/conquest/load-score-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cityfil city score";

type ImageProps = { params: Promise<{ areaId: string; userId: string }> };

export default async function ScoreOpengraphImage({ params }: ImageProps) {
  const { areaId, userId } = await params;
  const preview = await loadScorePreview(areaId, userId);
  return new ImageResponse(<ScoreCard preview={preview} />, { ...size });
}

function ScoreCard({ preview }: { preview: ScoreSharePreview | null }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        backgroundColor: "#0b0d17",
      }}
    >
      <OgBrand />
      {preview ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 600, color: "#f5f3ee", letterSpacing: -1.5 }}>{preview.cityName}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
            <div style={{ fontSize: 168, fontWeight: 700, color: "#ff8a3d", letterSpacing: -5 }}>
              {formatPercent(preview.share)}
            </div>
            <div style={{ fontSize: 36, color: "#a9a6ad" }}>of its streets run</div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, color: "#f5f3ee" }}>
            {[preview.runnerName, scoreShareRank(preview)].filter(Boolean).join(" · ")}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 64, fontWeight: 600, color: "#f5f3ee" }}>Run every street of your city</div>
      )}
    </div>
  );
}
