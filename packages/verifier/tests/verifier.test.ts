import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runVerifier } from "../src/index.js";
import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verifier-test-"));
}

async function initGit(dir: string): Promise<void> {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@local"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

const MINIMAL_EXEC_REPORT = {
  manifest_sha256: "0".repeat(64),
  delete_set_sha256: "0".repeat(64),
  checkpoint_stash: "",
  rollback_script: "",
  dry_run: false,
  aborted: false,
  files_processed: 2,
  files_deleted: 0,
  files_skipped: 0,
  skipped_reasons: [],
  bytes_reclaimed: 0,
  build_verification: { command: "x", exit_code: 0, duration_ms: 0 },
  git_commit: "abc1234",
  execution_duration_ms: 0,
  verification: { passed: true, checks: [] },
};

describe("GUARDIAN-VERIFIER (Agent 4B)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTempDir();
  });

  afterEach(async () => {
    // NEVER touch the host repo; only clean up our temp dir.
    await rm(tmp, { recursive: true, force: true });
  });

  it("Test A: flags a violation when a protected path is targeted for deletion", async () => {
    // Set up a real git repo with a tracked secret + normal file.
    await initGit(tmp);
    await writeFile(join(tmp, "secret.pem"), "PRIVATE KEY CONTENT\n");
    await writeFile(join(tmp, "old.ts"), "export const x = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: tmp });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: tmp });

    const manifestPath = join(tmp, "prune-manifest.json");
    const executionLogPath = join(tmp, "exec-report.json");

    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: tmp,
      git_commit: "abc1234",
      selected_files: [
        { path: "old.ts", action: "delete", confidence: 0.9, reason: "x" },
        {
          path: "secret.pem",
          action: "delete",
          confidence: 0.5,
          reason: "should be protected",
        },
      ],
      protected_skipped: [],
      estimated_reclamation: { bytes: 0, files: 0, ci_seconds: 0 },
      safety: { dry_run: false, stash_created: false, rollback_script: "" },
    };

    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await writeFile(
      executionLogPath,
      JSON.stringify(MINIMAL_EXEC_REPORT),
      "utf8",
    );

    const r = await runVerifier({ manifestPath, executionLogPath, cwd: tmp });

    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => /secret\.pem/.test(v))).toBe(true);
    // Report was written to <cwd>/.prune/.
    const written = await stat(join(tmp, ".prune", "verification-report.json"));
    expect(written.isFile()).toBe(true);
  });

  it("Test B: passes a clean manifest with a valid build and no git repo", async () => {
    // No git repo here -> git_status_clean is skipped.
    await writeFile(join(tmp, "old.ts"), "export const y = 2;\n");
    await writeFile(
      join(tmp, "package.json"),
      JSON.stringify({
        name: "tmp",
        scripts: { build: 'node -e "process.exit(0)"' },
      }),
      "utf8",
    );

    const manifestPath = join(tmp, "prune-manifest.json");
    const executionLogPath = join(tmp, "exec-report.json");

    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: tmp,
      git_commit: "abc1234",
      selected_files: [
        { path: "old.ts", action: "delete", confidence: 0.9, reason: "x" },
      ],
      protected_skipped: [],
      estimated_reclamation: { bytes: 0, files: 0, ci_seconds: 0 },
      safety: { dry_run: false, stash_created: false, rollback_script: "" },
    };

    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await mkdir(join(tmp, "logs"), { recursive: true });
    await writeFile(executionLogPath, JSON.stringify({ ok: true }), "utf8");

    const r = await runVerifier({ manifestPath, executionLogPath, cwd: tmp });

    expect(r.passed).toBe(true);
    const written = await stat(join(tmp, ".prune", "verification-report.json"));
    expect(written.isFile()).toBe(true);
  });

  it("Phase 5: manifest_integrity + delete_set_integrity pass when exec report matches manifest", async () => {
    await writeFile(join(tmp, "old.ts"), "export const y = 2;\n");
    await writeFile(
      join(tmp, "package.json"),
      JSON.stringify({ name: "tmp", scripts: { build: 'node -e "process.exit(0)"' } }),
      "utf8",
    );
    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: tmp,
      git_commit: "abc1234",
      selected_files: [{ path: "old.ts", action: "delete", confidence: 0.9, reason: "x" }],
      protected_skipped: [],
      estimated_reclamation: { bytes: 0, files: 0, ci_seconds: 0 },
      safety: { dry_run: false, stash_created: false, rollback_script: "" },
    };
    const manifestPath = join(tmp, "prune-manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const { createHash } = await import("node:crypto");
    const manifestSha = createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex");
    const deleteSetSha = createHash("sha256").update("old.ts").digest("hex");
    const execReport = {
      ...MINIMAL_EXEC_REPORT,
      manifest_sha256: manifestSha,
      delete_set_sha256: deleteSetSha,
    };
    const executionLogPath = join(tmp, "exec-report.json");
    await writeFile(executionLogPath, JSON.stringify(execReport), "utf8");

    const r = await runVerifier({ manifestPath, executionLogPath, cwd: tmp });
    const names = r.checks.map((c) => c.name);
    expect(names).toContain("manifest_integrity");
    expect(names).toContain("delete_set_integrity");
    expect(r.checks.find((c) => c.name === "manifest_integrity")?.passed).toBe(true);
    expect(r.checks.find((c) => c.name === "delete_set_integrity")?.passed).toBe(true);
    expect(r.passed).toBe(true);
  });
});
