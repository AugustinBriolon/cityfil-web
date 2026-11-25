/** Cityfil mark for Open Graph cards (`next/og` renders inline styles only, so it cannot reuse the site logo). */
export function OgBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width={56} height={56} viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="9" fill="rgba(255,255,255,0.12)" stroke="#f5f3ee" strokeWidth="1.4" />
        <ellipse
          cx="16"
          cy="16"
          rx="14"
          ry="5.3"
          transform="rotate(-24 16 16)"
          fill="none"
          stroke="#ff8a4c"
          strokeWidth="1.4"
        />
        <circle cx="27.7" cy="10.9" r="2.3" fill="#ff8a4c" />
      </svg>
      <div style={{ fontSize: 36, fontWeight: 600, color: "#f5f3ee" }}>Cityfil</div>
    </div>
  );
}
