import { ImageResponse } from "next/og";

import { CITYFIL_MARK } from "@/components/brand/cityfil-logo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        backgroundColor: "#0c0e18",
        backgroundImage: "radial-gradient(circle at 62% 32%, rgba(255,138,76,0.22), rgba(12,14,24,0) 55%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {/* Same mark as the app icon (public/brand/cityfil/app-icon.svg). */}
        <svg width={132} height={132} viewBox="0 0 256 256">
          <path d={CITYFIL_MARK.orbitBack} fill="none" stroke="#ff8a3d" strokeWidth="14" strokeLinecap="round" />
          <circle cx="128" cy="130" r="56" fill="#f5f3ee" />
          <path d={CITYFIL_MARK.orbitCut} fill="none" stroke="#0c0e18" strokeWidth="28" />
          <path d={CITYFIL_MARK.orbitFront} fill="none" stroke="#ff8a3d" strokeWidth="14" strokeLinecap="round" />
          <circle cx={CITYFIL_MARK.runner.cx} cy={CITYFIL_MARK.runner.cy} r={CITYFIL_MARK.runner.r} fill="#ffe08a" />
        </svg>
        <div style={{ fontSize: 96, fontWeight: 600, color: "#f5f3ee", letterSpacing: -2 }}>Cityfil</div>
      </div>
      <div style={{ fontSize: 34, color: "#a9a6ad", letterSpacing: 2 }}>Every street, filled in</div>
    </div>,
    { ...size },
  );
}
