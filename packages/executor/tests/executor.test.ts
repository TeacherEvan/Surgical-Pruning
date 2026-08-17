import { describe, it, expect } from "vitest";
import { runExecutor } from "../src/index.js";

describe("executor stub (NOT yet implemented)", () => {
  it("resolves without throwing and returns empty result", async () => {
    const res = await runExecutor({ manifestPath: "/tmp/x.json" });
    expect(res).toEqual({});
  });
});
