import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAuditor } from "../src/index.js";
import { writeFile, mkdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditReport } from "@surgical-pruning/core";

let tmp: string;

beforeEach(async () => {
  tmp = join(tmpdir(), `sp-aud-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("runAuditor (Agent 6)", () => {
  it("produces a valid AuditReport with smells + orphans", async () => {
    const handoff = {
      metadata: {
        target_path: "/tmp/demo",
        scan_timestamp: new Date().toISOString(),
        scan_duration_ms: 1,
        git_root: "/tmp/demo",
        git_branch: "main",
        git_commit: "abc1234",
      },
      tree_diagram: "",
      file_inventory: [
        {
          path: "src/big.ts",
          size_bytes: 9000,
          lines: 900,
          language: "typescript",
          last_modified: new Date().toISOString(),
          git_history: {
            first_commit: new Date().toISOString(),
            last_commit: new Date().toISOString(),
            commit_count: 3,
            authors: ["x"],
          },
          dependency_graph: {
            imports: [],
            imported_by: [],
            entry_point_distance: 2,
            is_entry_point: false,
            is_test: false,
            is_config: false,
          },
          dead_code_signals: {
            unused_exports: ["a"],
            unreachable: false,
            zero_references: true,
            confidence: 0.8,
          },
        },
        {
          path: "src/normal.ts",
          size_bytes: 100,
          lines: 20,
          language: "typescript",
          last_modified: new Date().toISOString(),
          git_history: {
            first_commit: new Date().toISOString(),
            last_commit: new Date().toISOString(),
            commit_count: 1,
            authors: ["x"],
          },
          dependency_graph: {
            imports: [],
            imported_by: [],
            entry_point_distance: 1,
            is_entry_point: false,
            is_test: false,
            is_config: false,
          },
          dead_code_signals: {
            unused_exports: [],
            unreachable: false,
            zero_references: false,
            confidence: 0.1,
          },
        },
      ],
      folder_summary: [],
      effected_systems: [],
      constraints: {
        exclusion_patterns_applied: [],
        languages_detected: ["typescript"],
        frameworks_detected: [],
        package_managers: ["pnpm"],
        monorepo: true,
      },
    };
    const handoffPath = join(tmp, "handoff-reviewer.json");
    await writeFile(handoffPath, JSON.stringify(handoff), "utf-8");

    const r = await runAuditor({
      targetPath: tmp,
      reviewerHandoffPath: handoffPath,
      cwd: tmp,
    });

    expect(r.architectural_smells.length).toBeGreaterThanOrEqual(1);
    expect(r.dependency_health.orphans).toContain("src/big.ts");
    expect(Array.isArray(r.recommendations)).toBe(true);

    // re-validate against schema
    expect(() => AuditReport.parse(r)).not.toThrow();

    await expect(stat(join(tmp, ".prune", "audit-report.json"))).resolves.toBeDefined();
  });
});
