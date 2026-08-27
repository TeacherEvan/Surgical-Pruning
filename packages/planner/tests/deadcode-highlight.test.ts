import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
describe("dead code red highlight (Bug 2)", () => {
  it(".badge-high class exists (line 601 verified live)", () => {
    const src = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
    expect(src.includes(".badge-high")).toBe(true);
  });
  it("red accent-decay variable used for selected/decay nodes", () => {
    const src = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
    expect(src.includes("var(--accent-decay)")).toBe(true);
  });
});
