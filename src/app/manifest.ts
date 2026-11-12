import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cityfil",
    short_name: "Cityfil",
    description: "Run every street in your city.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0e18",
    theme_color: "#0c0e18",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
