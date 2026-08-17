import { describe, it, expect } from "vitest";
import { runPlanner } from "../src/index.js";

describe("planner stub (NOT yet implemented)", () => {
  it("returns placeholder.html and does not throw", async () => {
    const out = await runPlanner({
      reviewerHandoff: {},
      researcherHandoff: {},
    });
    expect(out).toBe("placeholder.html");
  });
});
