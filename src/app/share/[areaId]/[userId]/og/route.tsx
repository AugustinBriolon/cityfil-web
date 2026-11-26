import { OgBrand } from "@/components/brand/og-brand";
import { scoreShareCopy, scoreShareRank, type ScoreSharePreview } from "@/lib/conquest/score-share-card";
import { shareLanguage, type ShareLanguage } from "@/lib/conquest/share-language";
import { formatPercent } from "@/lib/format";
import { renderOgImage } from "@/lib/og/render-og-image";
import { visualOrder } from "@/lib/og/visual-order";
import { loadScorePreview } from "@/server/conquest/load-score-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const size = { width: 1200, height: 630 };

/** Past this many characters the city name drops a size, so the longest real names still fit on two lines. */
const LONG_CITY_NAME = 24;

/**
 * The score card chat apps show for `/share/:areaId/:userId`. A route, not an `opengraph-image` file, because the
 * card must read `?lang=`: the page points its `og:image` here with the language it was shared in.
 */
export async function GET(request: Request, { params }: { params: Promise<{ areaId: string; userId: string }> }) {
  const { areaId, userId } = await params;
  const language = shareLanguage(new URL(request.url).searchParams.get("lang"), request.headers.get("accept-language"));
  const loaded = await loadScorePreview(areaId, userId);
  const preview = loaded && {
    ...loaded,
    cityName: visualOrder(loaded.cityName),
    runnerName: loaded.runnerName && visualOrder(loaded.runnerName),
  };
  // The fallback keeps the score and drops the two strings that can be in a script the renderer cannot draw.
  const plain = preview && { ...preview, cityName: "", runnerName: null };
  return renderOgImage(
    <ScoreCard preview={preview} language={language} />,
    () => <ScoreCard preview={plain} language={language} />,
    size,
  );
}

function ScoreCard({ preview, language }: { preview: ScoreSharePreview | null; language: ShareLanguage }) {
  const copy = scoreShareCopy[language];
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
          {preview.cityName ? (
            <div
              style={{
                display: "block",
                fontSize: preview.cityName.length > LONG_CITY_NAME ? 48 : 64,
                fontWeight: 600,
                color: "#f5f3ee",
                letterSpacing: -1.5,
                wordBreak: "break-word",
                lineClamp: 2,
              }}
            >
              {preview.cityName}
            </div>
          ) : null}
          {/* Satori ignores baseline alignment: bottom-align, then lift the caption onto the figure's baseline. */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
            <div style={{ fontSize: 168, fontWeight: 700, color: "#ff8a3d", letterSpacing: -5 }}>
              {formatPercent(preview.share, language)}
            </div>
            <div style={{ fontSize: 36, color: "#a9a6ad", paddingBottom: 38 }}>{copy.ofItsStreets}</div>
          </div>
          <div style={{ display: "block", fontSize: 40, fontWeight: 600, color: "#f5f3ee", lineClamp: 1 }}>
            {[preview.runnerName, scoreShareRank(preview, language)].filter(Boolean).join(" · ")}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 64, fontWeight: 600, color: "#f5f3ee" }}>{copy.fallback}</div>
      )}
    </div>
  );
}
