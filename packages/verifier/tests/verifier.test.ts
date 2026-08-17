import { describe, it, expect } from "vitest";
import { runVerifier } from "../src/index.js";

describe("verifier stub (NOT yet implemented)", () => {
  it("resolves without throwing and returns empty result", async () => {
    const res = await runVerifier({
      manifestPath: "/t",
      executionLogPath: "/t",
    });
    expect(res).toEqual({});
  });
});
