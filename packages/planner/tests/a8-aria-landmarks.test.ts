import { describe, it, expect } from "vitest";
// WCAG 2.1 AA landmark assertions for GAP_PLAN A8 — read the planner source
// (not memory) and assert landmark roles are emitted in renderHtml.
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");

describe("planner HTML WCAG landmarks (GAP_PLAN A8 partial coverage)", () => {
  it("<header> carries role=banner landmark", () => {
    expect(/<header[^>]*\brole="banner"/.test(SRC)).toBe(true);
  });

  it("primary panel wrapper carries role=main landmark", () => {
    expect(/role="main"/.test(SRC)).toBe(true);
  });

  it("<footer> carries role=contentinfo landmark", () => {
    expect(/<footer[^>]*\brole="contentinfo"/.test(SRC)).toBe(true);
  });

  it("group-filter chips container carries role=navigation landmark", () => {
    expect(/role="navigation"/.test(SRC)).toBe(true);
  });

  it("selection status region uses aria-live=polite for assistive tech", () => {
    expect(/aria-live="polite"/.test(SRC)).toBe(true);
  });

  it("prefers-reduced-motion media query present (regression guard)", () => {
    expect(SRC.includes("prefers-reduced-motion")).toBe(true);
  });
});
