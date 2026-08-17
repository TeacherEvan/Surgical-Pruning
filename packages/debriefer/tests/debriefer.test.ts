import { describe, it, expect } from "vitest";
import { runDebriefer } from "../src/index.js";

describe("debriefer stub (NOT yet implemented)", () => {
  it("returns a non-empty placeholder markdown string", async () => {
    const out = await runDebriefer({
      executionReportPath: "/t",
      reviewerHandoffPath: "/t",
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
