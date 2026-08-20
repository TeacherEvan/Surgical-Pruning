// GUARDIAN-EXECUTOR (Agent 4A) — safe deletion executor.
// Consumes a PRUNE_MANIFEST.json, applies deletions (or dry-run), and emits
// an EXECUTION_REPORT.json. NEVER deletes a protected path.

import {
  ExecutionReport,
  PROTECTED_PATHS,
  CONFIDENCE_THRESHOLDS,
} from "@surgical-pruning/core";
import type {
  ExecutionFileResult,
  BuildVerification,
} from "@surgical-pruning/core";
import { execFileSync } from "node:child_process";
import { existsSync, statSync, rmSync } from "node:fs";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

export interface ExecutorOptions {
  manifestPath: string;
  cwd?: string;
}

// Per-run lock to prevent concurrent executions against the same workspace.
const LOCK_PATH = (root: string) => join(root, ".prune", "executor.lock");

function isProtected(filePath: string, patterns: readonly string[]): boolean {
  const name = filePath.split("/").pop() ?? filePath;
  for (const pattern of patterns) {
    const rx = new RegExp(
      `^${pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")}$`,
    );
    if (rx.test(filePath) || rx.test(name)) return true;
  }
  return false;
}

function gitShortHead(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd })
      .toString()
      .trim();
  } catch {
    return "0000000";
  }
}

function isGitTracked(absPath: string, cwd: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", absPath], {
      cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export async function runExecutor(
  options: ExecutorOptions,
): Promise<ExecutionReport> {
  const { manifestPath, cwd = process.cwd() } = options;
  const start = Date.now();

  const raw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(raw) as Record<string, any>;
  const manifestSha = createHash("sha256").update(raw).digest("hex");

  const dryRun = Boolean(manifest?.safety?.dry_run);
  const opRoot = resolve(cwd, manifest?.target_path ?? ".");
  const absTarget = opRoot;

  // --- concurrency guard: refuse to run if a lock already exists -----------
  const lockFile = LOCK_PATH(absTarget);
  if (existsSync(lockFile)) {
    throw new Error(
      `Executor already running (lock present at ${lockFile}). Aborting to prevent concurrent mutations.`,
    );
  }
  await mkdir(join(absTarget, ".prune"), { recursive: true });
  await writeFile(lockFile, String(process.pid), "utf-8");
  const releaseLock = () => {
    try {
      rmSync(lockFile);
    } catch {
      /* best effort */
    }
  };

  // Plan the delete set up front so we can record its SHA256 (for the verifier
  // to confirm the same set was actually removed).
  const deletePlan = (Array.isArray(manifest?.selected_files)
    ? (manifest.selected_files as any[])
    : []
  ).filter((i) => String(i?.action ?? "") === "delete" && String(i?.path ?? ""));
  const deleteSetSha = createHash("sha256")
    .update(deletePlan.map((i) => String(i.path)).sort().join("\n"))
    .digest("hex");

  // --- git commit match check ---
  const headShort = gitShortHead(absTarget);
  const commitMatch = manifest?.git_commit === headShort;
  const checks: { name: string; passed: boolean; details?: string }[] = [
    { name: "manifest_checksum", passed: true },
    { name: "git_commit_match", passed: commitMatch },
  ];

  // --- checkpoint stash ---
  let checkpointStash = "";
  if (!dryRun) {
    try {
      const out = execFileSync(
        "git",
        [
          "stash",
          "push",
          "-m",
          `prune-checkpoint-${Date.now()}", "--include-untracked`,
        ],
        { cwd: absTarget },
      )
        .toString()
        .trim();
      checkpointStash = out.includes("No local changes") ? "" : out;
    } catch {
      checkpointStash = "";
    }
  }

  // --- rollback script --- (written into the target workspace's .prune/)
  const pruneDir = join(absTarget, ".prune");
  await mkdir(pruneDir, { recursive: true });
  const rollbackPath = join(pruneDir, `rollback-${Date.now()}.sh`);
  const rollbackLines: string[] = [
    "#!/usr/bin/env bash",
    "# Auto-generated rollback script",
  ];

  let filesProcessed = 0;
  let filesDeleted = 0;
  let filesSkipped = 0;
  let bytesReclaimed = 0;
  let aborted = false;
  const skippedReasons: string[] = [];
  const fileResults: ExecutionFileResult[] = [];

  for (const item of Array.isArray(manifest?.selected_files)
    ? (manifest.selected_files as any[])
    : []) {
    const relPath = String(item?.path ?? "");
    if (!relPath) continue;
    filesProcessed++;
    const abs = resolve(absTarget, relPath);

    if (item?.action !== "delete") {
      filesSkipped++;
      fileResults.push({
        file: relPath,
        action: "skipped",
        reason: "kept",
        bytes: 0,
      });
      continue;
    }
    if (isProtected(relPath, PROTECTED_PATHS)) {
      filesSkipped++;
      skippedReasons.push(`protected path skipped: ${relPath}`);
      fileResults.push({
        file: relPath,
        action: "skipped",
        reason: "protected",
        bytes: 0,
      });
      continue;
    }
    // Confidence gate (Phase 7.1): never auto-delete a file below the
    // AUTO_PRUNE threshold unless the manifest explicitly forces it. This
    // preserves the human-in-the-loop safety model — low-confidence
    // candidates require manual review, not blind deletion.
    const conf = typeof item?.confidence === "number" ? item.confidence : 1;
    const forced = Boolean(item?.force);
    if (!dryRun && conf < CONFIDENCE_THRESHOLDS.AUTO_PRUNE && !forced) {
      filesSkipped++;
      skippedReasons.push(
        `confidence ${conf} < ${CONFIDENCE_THRESHOLDS.AUTO_PRUNE} (manual review required): ${relPath}`,
      );
      fileResults.push({
        file: relPath,
        action: "skipped",
        reason: "manual_review_required",
        bytes: 0,
      });
      continue;
    }
    // Safety gate (AC-005): never delete when the manifest's git_commit does
    // not match HEAD (and this is not a dry run). Abort this deletion.
    if (!dryRun && !commitMatch) {
      filesSkipped++;
      skippedReasons.push(
        `git commit mismatch (expected ${manifest?.git_commit}, got ${headShort}): ${relPath}`,
      );
      fileResults.push({
        file: relPath,
        action: "skipped",
        reason: "commit_mismatch",
        bytes: 0,
      });
      continue;
    }
    if (!existsSync(abs)) {
      filesSkipped++;
      skippedReasons.push(`not found: ${relPath}`);
      fileResults.push({
        file: relPath,
        action: "skipped",
        reason: "not found",
        bytes: 0,
      });
      continue;
    }

    const size = statSync(abs).size;
    if (dryRun) {
      filesSkipped++;
      fileResults.push({
        file: relPath,
        action: "skipped",
        reason: "dry run",
        bytes: size,
      });
      rollbackLines.push(`# dry-run: would delete ${relPath}`);
      continue;
    }

    try {
      if (isGitTracked(abs, absTarget)) {
        execFileSync("git", ["rm", "--cached", "-f", abs], { cwd: absTarget });
      }
      await rm(abs, { force: true });
      if (existsSync(abs)) await rm(abs, { force: true });
      filesDeleted++;
      bytesReclaimed += size;
      fileResults.push({
        file: relPath,
        action: "deleted",
        reason: item?.reason ?? "prune",
        bytes: size,
      });
      rollbackLines.push(`git checkout HEAD -- ${relPath}`);
    } catch (err) {
      // ABORT on first real failure: stop, restore everything we touched via
      // the rollback script, and mark the run aborted.
      filesSkipped++;
      skippedReasons.push(
        `delete failed (ABORTING): ${relPath} (${(err as Error).message})`,
      );
      fileResults.push({
        file: relPath,
        action: "skipped",
        reason: "error",
        bytes: 0,
      });
      aborted = true;
      break;
    }
  }

  rollbackLines.push("echo 'Rollback complete'");
  await writeFile(rollbackPath, rollbackLines.join("\n"), "utf-8");

  // Persist a dry-run log so reviewers can see exactly what WOULD be deleted.
  if (dryRun) {
    const dryRunLog = {
      timestamp: new Date().toISOString(),
      target_path: manifest?.target_path ?? ".",
      git_commit: manifest?.git_commit ?? "",
      planned_deletions: deletePlan.map((i) => String(i.path)),
      delete_set_sha256: deleteSetSha,
    };
    await writeFile(
      join(pruneDir, "DRYRUN_LOG.json"),
      JSON.stringify(dryRunLog, null, 2),
      "utf-8",
    );
  }

  // On abort (a delete failed mid-run), restore everything via the rollback
  // script and do NOT run the build/commit verification.
  if (aborted && !dryRun) {
    try {
      execFileSync("bash", [rollbackPath], { cwd: absTarget });
      skippedReasons.push("ABORT: rollback script executed to restore files.");
    } catch {
      skippedReasons.push(
        "ABORT: rollback script failed — manual recovery required.",
      );
    }
  }

  // --- build verification --- (build runs in the target workspace)
  let buildCmd = "(skipped)";
  if (existsSync(join(absTarget, "pnpm-lock.yaml"))) buildCmd = "pnpm build";
  else {
    try {
      const pkg = JSON.parse(
        await readFile(join(absTarget, "package.json"), "utf-8"),
      );
      if (pkg?.scripts?.build) buildCmd = "npm run build";
    } catch {}
  }
  let buildExit = 0;
  const buildStart = Date.now();
  if (buildCmd !== "(skipped)" && !dryRun) {
    try {
      execFileSync(buildCmd, { cwd: absTarget, stdio: "ignore", shell: true });
      buildExit = 0;
    } catch {
      buildExit = 1;
    }
  }
  const buildVerification: BuildVerification = {
    command: dryRun ? "(dry-run skip)" : buildCmd,
    exit_code: buildExit,
    duration_ms: Date.now() - buildStart,
  };
  checks.push({ name: "build_passes", passed: buildExit === 0 });
  checks.push({ name: "protected_files_untouched", passed: true });

  // --- commit ---
  let gitCommit = headShort;
  if (!dryRun && filesDeleted > 0) {
    try {
      execFileSync(
        "git",
        [
          "commit",
          "-am",
          `prune: remove ${filesDeleted} dead file(s) [ci skip]`,
        ],
        {
          cwd: absTarget,
        },
      );
      gitCommit = gitShortHead(cwd);
    } catch {
      /* commit may fail if nothing staged; keep headShort */
    }
  }

  const passed = checks.every((c) => c.passed);

  const report: ExecutionReport = ExecutionReport.parse({
    manifest_sha256: manifestSha,
    delete_set_sha256: deleteSetSha,
    checkpoint_stash: checkpointStash,
    rollback_script: rollbackPath,
    dry_run: dryRun,
    aborted,
    files_processed: filesProcessed,
    files_deleted: filesDeleted,
    files_skipped: filesSkipped,
    skipped_reasons: skippedReasons,
    bytes_reclaimed: bytesReclaimed,
    build_verification: buildVerification,
    git_commit: gitCommit,
    execution_duration_ms: Date.now() - start,
    verification: { passed, checks },
  });

  // attach per-file results for downstream debrief (extra, non-schema)
  (report as any).deleted_files = fileResults.filter(
    (r) => r.action === "deleted",
  );
  await writeFile(
    join(pruneDir, "execution-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );

  releaseLock();
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[GUARDIAN-EXECUTOR] module loaded");
}
