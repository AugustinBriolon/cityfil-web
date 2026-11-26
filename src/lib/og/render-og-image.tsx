import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

type Size = { width: number; height: number };

const FONT_DIR = join(process.cwd(), "src/lib/og/fonts");

/**
 * Giving `next/og` any font replaces its default, so Geist comes along with the Arabic face. IBM Plex Sans Arabic
 * is one the renderer can shape; the Noto Arabic faces it would fetch on its own crash it (OFL licences alongside).
 */
const fonts = Promise.all([
  readFile(join(FONT_DIR, "Geist-Regular.ttf")),
  readFile(join(FONT_DIR, "IBMPlexSansArabic-SemiBold.ttf")),
]).then(([geist, arabic]) => [
  { name: "Geist", data: geist, weight: 400 as const, style: "normal" as const },
  { name: "IBM Plex Sans Arabic", data: arabic, weight: 600 as const, style: "normal" as const },
]);

/**
 * Renders an Open Graph card, or `fallback` when the renderer still cannot draw some of its text (Thai, Hindi…).
 * That error surfaces while streaming, after a 200 was promised, so chat apps would show no card at all:
 * rendering to a buffer first turns it into a plain card instead.
 */
export async function renderOgImage(card: ReactElement, fallback: () => ReactElement, size: Size): Promise<Response> {
  const options = { ...size, fonts: await fonts };
  try {
    const image = new ImageResponse(card, options);
    return new Response(await image.arrayBuffer(), { headers: image.headers });
  } catch (error) {
    console.warn("Open Graph card fell back to its plain version", error);
    return new ImageResponse(fallback(), options);
  }
}
