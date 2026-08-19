import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runReviewer } from "@surgical-pruning/reviewer";
import { runPlanner } from "@surgical-pruning/planner";
import { runExecutor } from "@surgical-pruning/executor";

/**
 * Phase 7.1 verification tests for the three named safety guarantees:
 *  - rollback script is emitted on every executor run
 *  - protected files (e.g. *.pem) are never targeted for deletion
 *  - low-confidence files (< AUTO_PRUNE) are skipped for manual review, not
 *    blindly deleted, even on a real (non-dry) run with a matching commit.
 */
describe("phase7: executor safety guarantees", () => {
  let dir: string;
  let head: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sp-phase7-"));
    writeFileSync(join(dir, "dead-export.ts"), "export const unused = 42;\n");
    writeFileSync(join(dir, "secret.pem"), "PRIVATE KEY MATERIAL\n");
    execSync(
      "git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init",
      { cwd: dir },
    );
    head = execSync("git rev-parse --short HEAD", { cwd: dir })
      .toString()
      .trim();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeManifest(overrides: any[]) {
    const handoff = await runReviewer({
      targetPath: ".",
      userPrompt: "prune dead code",
      cwd: dir,
    });
    await runPlanner({
      reviewerHandoff: handoff,
      researcherHandoff: {
        user_prompt_analysis: {
          intent: "prune",
          scope: "folder",
          aggressiveness: "moderate",
          constraints_from_user: [],
        },
        language_specific_practices: {},
        general_practices: [],
        tool_recommendations: [],
        future_proofing: {
          ci_integration: "",
          precommit_hook: "",
          dependency_budget: "",
        },
      },
      cwd: dir,
    });
    const manifestPath = join(dir, ".prune", "PRUNE_MANIFEST.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.safety.dry_run = false;
    manifest.git_commit = head;
    manifest.selected_files = overrides;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    return manifestPath;
  }

  it("rollback script is emitted and references git checkout for real deletes", async () => {
    const manifestPath = await makeManifest([
      {
        path: "dead-export.ts",
        action: "delete",
        confidence: 0.99,
        reason: "unused export",
      },
    ]);
    const report = await runExecutor({ manifestPath, cwd: dir });
    // A real (non-dry) run deletes the high-confidence file.
    expect(report.files_deleted).toBe(1);
    expect(existsSync(join(dir, "dead-export.ts"))).toBe(false);

    // Rollback script must exist and contain a git checkout line.
    const pruneDir = join(dir, ".prune");
    const rollbackFile = readdirSync(pruneDir).find((f) =>
      f.startsWith("rollback-"),
    );
    expect(rollbackFile).toBeDefined();
    const rollback = readFileSync(join(pruneDir, rollbackFile!), "utf8");
    expect(rollback).toContain("git checkout HEAD -- dead-export.ts");
  });

  it("protected file (*.pem) is excluded from deletion", async () => {
    const manifestPath = await makeManifest([
      {
        path: "secret.pem",
        action: "delete",
        confidence: 0.99,
        reason: "should be protected",
      },
    ]);
    const report = await runExecutor({ manifestPath, cwd: dir });
    expect(report.files_deleted).toBe(0);
    expect(existsSync(join(dir, "secret.pem"))).toBe(true);
    expect(report.skipped_reasons.some((r) => /protected/.test(r))).toBe(true);
  });

  it("low-confidence file is skipped for manual review, not auto-deleted", async () => {
    // Re-create the deletable file (previous test removed it).
    writeFileSync(join(dir, "low-conf.ts"), "export const maybe = 1;\n");
    execSync("git add -A && git commit -qm add-lowconf", { cwd: dir });
    head = execSync("git rev-parse --short HEAD", { cwd: dir })
      .toString()
      .trim();

    const manifestPath = await makeManifest([
      {
        path: "low-conf.ts",
        action: "delete",
        confidence: 0.5, // below AUTO_PRUNE (0.95)
        reason: "maybe unused",
      },
    ]);
    const report = await runExecutor({ manifestPath, cwd: dir });
    expect(report.files_deleted).toBe(0);
    expect(existsSync(join(dir, "low-conf.ts"))).toBe(true);
    expect(
      report.skipped_reasons.some((r) => /manual review required/.test(r)),
    ).toBe(true);
  });
});
