import { describe, expect, it, vi } from "vitest";

import { queueApproachStreets } from "./approach-streets";

describe("queueApproachStreets", () => {
  it("queues the city the runner stands in, ahead of background imports", async () => {
    const catalog = {
      findContainingPoints: vi.fn(async () => [{ osmRelationId: 91738, name: "Colombes", pointCount: 1 }]),
    };
    const importQueue = { enqueueMissing: vi.fn(async () => 1) };

    const queued = await queueApproachStreets({ catalog, importQueue }, { lng: 2.243, lat: 48.9117 });

    expect(queued).toBe(1);
    expect(catalog.findContainingPoints).toHaveBeenCalledWith([{ lat: 48.9117, lon: 2.243 }]);
    expect(importQueue.enqueueMissing).toHaveBeenCalledWith([
      { osmRelationId: 91738, name: "Colombes", priority: 100 },
    ]);
  });

  it("queues nothing where no known city contains the runner", async () => {
    const importQueue = { enqueueMissing: vi.fn(async (cities: unknown[]) => cities.length) };
    const queued = await queueApproachStreets(
      { catalog: { findContainingPoints: vi.fn(async () => []) }, importQueue },
      { lng: 0, lat: 0 },
    );
    expect(queued).toBe(0);
  });
});
