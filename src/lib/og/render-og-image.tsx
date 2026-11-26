import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

type Size = { width: number; height: number };

/**
 * Renders an Open Graph card, or `fallback` when the renderer cannot draw some of its text. Arabic city names
 * hit OpenType lookups it does not support, and that error surfaces while streaming, after a 200 was promised:
 * chat apps then show no card at all. Rendering to a buffer first turns that into a plain card instead.
 */
export async function renderOgImage(card: ReactElement, fallback: () => ReactElement, size: Size): Promise<Response> {
  try {
    const image = new ImageResponse(card, size);
    return new Response(await image.arrayBuffer(), { headers: image.headers });
  } catch (error) {
    console.warn("Open Graph card fell back to its plain version", error);
    return new ImageResponse(fallback(), size);
  }
}
