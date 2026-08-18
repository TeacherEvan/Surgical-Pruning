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
});
