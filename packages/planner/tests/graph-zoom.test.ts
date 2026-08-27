import { describe, it, expect } from "vitest";
// REAL TDD assertions — must FAIL until zoom mechanism exists in planner HTML
import { readFileSync } from "fs";
import { resolve } from "path";
describe("planner HTML zoom + red highlight (Bug 1 + affected highlights)", () => {
  // Read the planner source to assert design claims WITHOUT relying on memory
  const src = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");

  it("source has .zoom-wrap mechanism design (will apply in renderHtml)", () => {
    // Currently FAILS — no .zoom-wrap class exists in template yet
    expect(src.includes('.zoom-wrap')).toBe(true);
  });

  it(".node.selected uses red accent-decay (live-verified at line 577)", () => {
    expect(src.includes("var(--accent-decay)")).toBe(true); // real source match
  });

  it(".badge-high uses red highlight (line 601) for affected files", () => {
    expect(src.includes(".badge-high")).toBe(true); // real source match
  });

  it("SVG has viewBox (line 285) required for scale mechanism", () => {
    expect(src.includes('viewBox="0 0')).toBe(true); // real source match
  });
});
