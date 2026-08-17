import { describe, it, expect } from "vitest";
import { runResearcher } from "../src/index.js";
import type { HandoffReviewer } from "@surgical-pruning/core";

const fakeReviewerHandoff = {
  metadata: {
    target_path: "/tmp/x",
    scan_timestamp: new Date().toISOString(),
    scan_duration_ms: 0,
    git_root: "/tmp/x",
    git_branch: "main",
    git_commit: "abc1234",
  },
  tree_diagram: "",
  file_inventory: [],
  folder_summary: [],
  effected_systems: [],
  constraints: {
    exclusion_patterns_applied: [],
    languages_detected: ["typescript", "python"],
    frameworks_detected: [],
    package_managers: ["pnpm"],
    monorepo: false,
  },
} as unknown as HandoffReviewer;

describe("researcher/runResearcher", () => {
  it("returns a structured handoff covering all five sections", async () => {
    const out = await runResearcher({
      targetPath: "/tmp/x",
      userPrompt: "remove dead code aggressively",
      reviewerHandoff: fakeReviewerHandoff,
      cwd: process.cwd(),
    });
    expect(out.user_prompt_analysis.intent).toBe("dead-code-removal");
    expect(out.user_prompt_analysis.aggressiveness).toBe("aggressive");
    expect(out.language_specific_practices).toHaveProperty("typescript");
    expect(out.language_specific_practices).toHaveProperty("python");
    expect(Array.isArray(out.general_practices)).toBe(true);
    expect(Array.isArray(out.tool_recommendations)).toBe(true);
    expect(typeof out.future_proofing).toBe("object");
  });

  it("derives scope=monorepo when the reviewer reports a monorepo", async () => {
    const monorepoHandoff = {
      ...fakeReviewerHandoff,
      constraints: { ...fakeReviewerHandoff.constraints, monorepo: true },
    };
    const out = await runResearcher({
      targetPath: "/tmp/x",
      userPrompt: "cleanup",
      reviewerHandoff: monorepoHandoff,
      cwd: process.cwd(),
    });
    expect(out.user_prompt_analysis.scope).toBe("monorepo");
  });
});
