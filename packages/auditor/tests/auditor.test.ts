import { describe, it, expect } from "vitest";
import { runAuditor } from "../src/index.js";

describe("auditor stub (NOT yet implemented)", () => {
  it("resolves without throwing and returns empty result", async () => {
    const res = await runAuditor({
      targetPath: "/t",
      reviewerHandoffPath: "/t",
    });
    expect(res).toEqual({});
  });
});
