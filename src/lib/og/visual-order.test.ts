import { describe, expect, it } from "vitest";

import { visualOrder } from "./visual-order";

describe("visualOrder", () => {
  it("reverses the words of a right-to-left name so they read right to left", () => {
    expect(visualOrder("محمد بن عبد الله")).toBe("الله عبد بن محمد");
    expect(visualOrder("القاهرة")).toBe("القاهرة");
  });

  it("leaves Latin and mixed text as written", () => {
    expect(visualOrder("Saint-Rémy-lès-Chevreuse")).toBe("Saint-Rémy-lès-Chevreuse");
    expect(visualOrder("Ali القاهرة")).toBe("Ali القاهرة");
    expect(visualOrder("東京都千代田区")).toBe("東京都千代田区");
  });
});
