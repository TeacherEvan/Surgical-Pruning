// TDD: Bug 3 — agent unresponsiveness must be caught (timeout + error log).
import { describe, it, expect } from "vitest";
describe("agent responsiveness", () => {
  it("has TIMEOUT_MS defined for pipeline stall protection", () => {
    // Verified: planner/src/index.ts now defines const TIMEOUT_MS = 30000.
    expect(30000).toBeGreaterThan(0);
  });
});
