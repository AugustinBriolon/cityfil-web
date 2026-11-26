import { formatPercent } from "@/lib/format";
import { renderOgImage } from "@/lib/og/render-og-image";
import { visualOrder } from "@/lib/og/visual-order";
import {
  inviteShareCopy,
  inviteShareDescription,
  inviteShareHeadline,
  titleChips,
  type InviteSharePreview,
} from "@/lib/conquest/invite-share-card";
import { shareLanguage, type ShareLanguage } from "@/lib/conquest/share-language";
import { OgBrand as Brand } from "@/components/brand/og-brand";
import { loadInvitePreview } from "@/server/conquest/load-invite-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const size = { width: 1200, height: 630 };

/** The invite card chat apps show for `/invite/:token`, in the `?lang=` it was shared in (see the share card). */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const language = shareLanguage(new URL(request.url).searchParams.get("lang"), request.headers.get("accept-language"));
  const copy = inviteShareCopy[language];
  const loaded = await loadInvitePreview(token);
  const preview = loaded && {
    ...loaded,
    cityName: visualOrder(loaded.cityName),
    inviterName: visualOrder(loaded.inviterName),
  };
  // Same words the service uses when it knows no name: always drawable.
  const plain = preview && { ...preview, cityName: copy.thisCity, inviterName: copy.someone };
  return renderOgImage(
    <InviteCard preview={preview} language={language} />,
    () => <InviteCard preview={plain} language={language} />,
    size,
  );
}

function InviteCard({ preview, language }: { preview: InviteSharePreview | null; language: ShareLanguage }) {
  const copy = inviteShareCopy[language];
  if (!preview) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          backgroundColor: "#0c0e18",
          backgroundImage: "radial-gradient(circle at 62% 32%, rgba(255,138,76,0.18), rgba(12,14,24,0) 55%)",
        }}
      >
        <Brand />
        <div style={{ marginTop: 48, fontSize: 64, fontWeight: 600, color: "#f5f3ee", letterSpacing: -1.5 }}>
          {copy.expiredCard}
        </div>
        <div style={{ marginTop: 20, fontSize: 32, color: "#a9a6ad" }}>{copy.expiredCardBody}</div>
      </div>
    );
  }

  const share = preview.inviterShare == null ? "—" : formatPercent(preview.inviterShare, language);
  const chips = titleChips(preview, language);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        backgroundColor: "#0c0e18",
        backgroundImage: "radial-gradient(circle at 78% 18%, rgba(255,138,76,0.28), rgba(12,14,24,0) 48%)",
      }}
    >
      <Brand />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 28, color: "#ff8a4c", letterSpacing: 4, textTransform: "uppercase" }}>
          {copy.eyebrow}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 72,
            fontWeight: 600,
            color: "#f5f3ee",
            letterSpacing: -2,
            lineHeight: 1.05,
          }}
        >
          {inviteShareHeadline(preview, language)}
        </div>
        <div style={{ marginTop: 20, fontSize: 32, color: "#a9a6ad", lineHeight: 1.35 }}>
          {inviteShareDescription(preview, language)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 22, color: "#a9a6ad" }}>{preview.inviterName}</div>
          <div style={{ fontSize: 88, fontWeight: 700, color: "#ffe08a", letterSpacing: -3 }}>{share}</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {chips.map((chip) => (
            <div
              key={chip.name}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "14px 22px",
                borderRadius: 999,
                backgroundColor: chip.open ? "rgba(255,138,76,0.18)" : "rgba(255,255,255,0.06)",
                color: chip.open ? "#ff8a4c" : "#7d7a82",
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              {chip.name} {chip.open ? copy.open : copy.claimed}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
