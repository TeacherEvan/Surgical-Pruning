import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runDebriefer } from "../src/index.js";
import { writeFile, mkdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmp: string;

beforeEach(async () => {
  tmp = join(
    tmpdir(),
    `sp-debriefer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("runDebriefer (Agent 5)", () => {
  it("produces a markdown debrief and writes DEBRIEF.md", async () => {
    const execPath = join(tmp, "exec-report.json");
    const revPath = join(tmp, "handoff-reviewer.json");

    await writeFile(
      execPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        target_path: "/tmp/demo",
        git_commit: "abc1234",
        selected_files: [],
        files_processed: 2,
        files_deleted: 1,
        files_skipped: 1,
        skipped_reasons: ["protected path"],
        bytes_reclaimed: 100,
        dry_run: false,
        build_verification: { command: "echo", exit_code: 0, duration_ms: 1 },
        checkpoint_stash: "stash@{0}",
        rollback_script: "/tmp/demo/.prune/rb.sh",
        verification: { passed: true, checks: [{ name: "x", passed: true }] },
      }),
      "utf-8",
    );

    await writeFile(
      revPath,
      JSON.stringify({
        metadata: {
          target_path: "/tmp/demo",
          scan_timestamp: new Date().toISOString(),
          scan_duration_ms: 1,
          git_root: "/tmp/demo",
          git_branch: "main",
          git_commit: "abc1234",
        },
        tree_diagram: "",
        file_inventory: [],
        folder_summary: [],
        effected_systems: [],
        constraints: {
          exclusion_patterns_applied: [],
          languages_detected: [],
          frameworks_detected: [],
          package_managers: [],
          monorepo: false,
        },
      }),
      "utf-8",
    );

    const md = await runDebriefer({
      executionReportPath: execPath,
      reviewerHandoffPath: revPath,
      cwd: tmp,
    });

    expect(typeof md).toBe("string");
    expect(md.startsWith("#")).toBe(true);
    expect(md).toContain("Debrief");
    expect(md.toLowerCase()).toContain("bytes reclaimed");
    expect(md).toContain("100");

    // DEBRIEF.md should have been written to tmp/.prune
    const st = await stat(join(tmp, ".prune", "DEBRIEF.md"));
    expect(st.isFile()).toBe(true);
  });

  it("Phase 6: computes Before/After/Δ from reviewer inventory and separates Flagged-for-review", async () => {
    const execPath = join(tmp, "exec-report.json");
    const revPath = join(tmp, "handoff-reviewer.json");

    await writeFile(
      execPath,
      JSON.stringify({
        target_path: "/tmp/demo",
        git_commit: "abc1234",
        selected_files: [],
        files_processed: 3,
        files_deleted: 1,
        files_skipped: 2,
        skipped_reasons: [
          "manual_review_required: lib/foo.ts (confidence 0.82)",
          "confidence 0.70 < 0.95 threshold",
          "protected path: package.json",
        ],
        bytes_reclaimed: 500,
        dry_run: false,
        build_verification: { command: "echo", exit_code: 0, duration_ms: 1 },
        checkpoint_stash: "stash@{0}",
        rollback_script: "/tmp/demo/.prune/rb.sh",
        verification: { passed: true, checks: [] },
      }),
      "utf-8",
    );

    await writeFile(
      revPath,
      JSON.stringify({
        metadata: { target_path: "/tmp/demo", git_commit: "abc1234" },
        tree_diagram: "",
        // inventory gives the pre-prune baseline: 3 files, 3000 bytes
        file_inventory: [
          { path: "a.ts", loc: 100, bytes: 1000, is_protected: false },
          { path: "b.ts", loc: 100, bytes: 1000, is_protected: false },
          { path: "c.ts", loc: 100, bytes: 1000, is_protected: false },
        ],
        folder_summary: [],
        effected_systems: [],
        constraints: {
          exclusion_patterns_applied: [],
          languages_detected: [],
          frameworks_detected: [],
          package_managers: [],
          monorepo: false,
        },
      }),
      "utf-8",
    );

    const md = await runDebriefer({
      executionReportPath: execPath,
      reviewerHandoffPath: revPath,
      cwd: tmp,
    });

    // F1: Before/After/Δ table
    expect(md).toContain("## Reclamation (Before / After / Δ)");
    expect(md).toContain("| Files | 3 | 2 | -1 |");
    expect(md).toContain("| Total bytes | 2.93 KB | 2.44 KB | -500 B |");

    // F2: flagged-for-review separated (the two 70-94% reasons, not "protected")
    expect(md).toContain("## Flagged for Review (manual, 70–94%)");
    expect(md).toContain("manual_review_required: lib/foo.ts (confidence 0.82)");
    expect(md).toContain("confidence 0.70 < 0.95 threshold");
    // protected skip should NOT appear inside the flagged-for-review section
    const flaggedSectionStart = md.indexOf("## Flagged for Review");
    const protectedIdx = md.indexOf("protected path: package.json");
    const flaggedSectionEnd = md.indexOf("## Protected Skipped");
    expect(protectedIdx).toBeGreaterThanOrEqual(0);
    if (flaggedSectionEnd !== -1) {
      expect(protectedIdx).toBeLessThan(flaggedSectionStart);
    }
  });
});
