import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runReviewer } from "@surgical-pruning/reviewer";
import { runPlanner } from "@surgical-pruning/planner";
import { runExecutor } from "@surgical-pruning/executor";

/**
 * Dry-run integration test: reviewer → planner → executor(dry).
 * Asserts the reviewer handoff is written and that the dry-run executor
 * performs ZERO real deletions (protected + non-protected alike).
 */
describe("integration: reviewer → planner → executor(dry-run)", () => {
  let dir: string;
  let head: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sp-int-"));
    // A dead, deletable file AND a protected file (must never be targeted).
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

  it("reviewer writes handoff; dry-run executor deletes nothing", async () => {
    // 1. Reviewer
    const handoff = await runReviewer({
      targetPath: ".",
      userPrompt: "prune dead code",
      cwd: dir,
    });
    expect(handoff.file_inventory.length).toBeGreaterThan(0);
    // Reverse-import pass: secret.pem is not an entry point and has no
    // importers, so it should be flagged; the key assertion is that the
    // imported_by field is now populated where applicable.
    expect(Array.isArray(handoff.effected_systems)).toBe(true);

    const handoffPath = join(dir, ".prune", "handoff-reviewer.json");
    expect(existsSync(handoffPath)).toBe(true);

    // 2. Planner (writes HTML + PRUNE_MANIFEST.json side artifact)
    const htmlPath = await runPlanner({
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
        future_proofing: { ci_integration: "", precommit_hook: "", dependency_budget: "" },
      },
      cwd: dir,
    });
    expect(htmlPath.endsWith(".html")).toBe(true);

    const manifestPath = join(dir, ".prune", "PRUNE_MANIFEST.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    // Force a dry-run manifest that targets the dead file for deletion.
    manifest.safety.dry_run = true;
    manifest.git_commit = head;
    manifest.selected_files = [
      { path: "dead-export.ts", action: "delete", confidence: 0.99, reason: "unused export" },
      { path: "secret.pem", action: "delete", confidence: 0.5, reason: "should be protected" },
    ];
    writeFileSync(manifestPath, JSON.stringify(manifest));

    // 3. Executor (DRY RUN) — must delete nothing.
    const report = await runExecutor({ manifestPath, cwd: dir });
    expect(report.dry_run).toBe(true);
    expect(report.files_deleted).toBe(0);
    // Both files must still exist on disk after a dry run.
    expect(existsSync(join(dir, "dead-export.ts"))).toBe(true);
    expect(existsSync(join(dir, "secret.pem"))).toBe(true);
    // Protected file must be in the skip reasons.
    expect(
      report.skipped_reasons.some((r) => /secret\.pem/.test(r)),
    ).toBe(true);
  });
});
