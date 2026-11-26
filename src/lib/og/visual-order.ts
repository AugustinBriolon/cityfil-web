const RIGHT_TO_LEFT = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-z]/;

/**
 * The Open Graph renderer shapes Arabic letters but lays words out left to right, so "محمد بن عبد الله" comes
 * out back to front. A name written only in a right-to-left script gets its words reversed to read correctly;
 * anything mixed with Latin is left alone rather than guessed at.
 */
export function visualOrder(text: string): string {
  if (!RIGHT_TO_LEFT.test(text) || LATIN.test(text)) return text;
  return text.trim().split(/\s+/).reverse().join(" ");
}
