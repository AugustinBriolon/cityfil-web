/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { readLoop } from "./route-shape";

describe("readLoop", () => {
  const read = (query: string) => readLoop(new URLSearchParams(query));

  it("plans a loop unless told otherwise", () => {
    expect(read("")).toBe(true);
    expect(read("loop=1")).toBe(true);
  });

  it("plans a one-way run on loop=0", () => {
    expect(read("loop=0")).toBe(false);
  });

  it("refuses anything else rather than guessing", () => {
    expect(read("loop=true")).toBeNull();
    expect(read("loop=")).toBeNull();
  });
});
