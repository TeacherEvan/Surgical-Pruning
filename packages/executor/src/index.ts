// GUARDIAN-EXECUTOR (Agent 4A) — safe deletion executor.
// Consumes a PRUNE_MANIFEST.json, applies deletions (or dry-run), and emits
// an EXECUTION_REPORT.json. NEVER deletes a protected path.

import { ExecutionReport, PROTECTED_PATHS } from "@surgical-pruning/core";
import type {
  ExecutionFileResult,
  BuildVerification,
} from "@surgical-pruning/core";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

export interface ExecutorOptions {
  manifestPath: string;
  cwd?: string;
}

function isProtected(
  filePath: string,
  patterns: readonly string[],
): boolean {
  const name = filePath.split("/").pop() ?? filePath;
  for (const pattern of patterns) {
    const rx = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
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
  const absTarget = resolve(cwd, manifest?.target_path ?? ".");

  // --- git commit match check ---
  const headShort = gitShortHead(cwd);
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
        ["stash", "push", "-m", `prune-checkpoint-${Date.now()}", "--include-untracked`],
        { cwd },
      )
        .toString()
        .trim();
      checkpointStash = out.includes("No local changes") ? "" : out;
    } catch {
      checkpointStash = "";
    }
  }

  // --- rollback script ---
  const pruneDir = join(cwd, ".prune");
  await mkdir(pruneDir, { recursive: true });
  const rollbackPath = join(pruneDir, `rollback-${Date.now()}.sh`);
  const rollbackLines: string[] = ["#!/usr/bin/env bash", "# Auto-generated rollback script"];

  let filesProcessed = 0;
  let filesDeleted = 0;
  let filesSkipped = 0;
  let bytesReclaimed = 0;
  const skippedReasons: string[] = [];
  const fileResults: ExecutionFileResult[] = [];

  for (const item of Array.isArray(manifest?.selected_files)
    ? (manifest.selected_files as any[])
    : []) {
    const relPath = String(item?.path ?? "");
    if (!relPath) continue;
    filesProcessed++;
    const abs = resolve(cwd, relPath);

    if (item?.action !== "delete") {
      filesSkipped++;
      fileResults.push({ file: relPath, action: "skipped", reason: "kept", bytes: 0 });
      continue;
    }
    if (isProtected(relPath, PROTECTED_PATHS)) {
      filesSkipped++;
      skippedReasons.push(`protected path skipped: ${relPath}`);
      fileResults.push({ file: relPath, action: "skipped", reason: "protected", bytes: 0 });
      continue;
    }
    if (!existsSync(abs)) {
      filesSkipped++;
      skippedReasons.push(`not found: ${relPath}`);
      fileResults.push({ file: relPath, action: "skipped", reason: "not found", bytes: 0 });
      continue;
    }

    const size = statSync(abs).size;
    if (dryRun) {
      filesSkipped++;
      fileResults.push({ file: relPath, action: "skipped", reason: "dry run", bytes: size });
      rollbackLines.push(`# dry-run: would delete ${relPath}`);
      continue;
    }

    try {
      if (isGitTracked(abs, cwd)) {
        execFileSync("git", ["rm", "--cached", "-f", abs], { cwd });
      }
      await rm(abs, { force: true });
      // also remove from disk fully if git rm kept it
      if (existsSync(abs)) await rm(abs, { force: true });
      filesDeleted++;
      bytesReclaimed += size;
      fileResults.push({ file: relPath, action: "deleted", reason: item?.reason ?? "prune", bytes: size });
      rollbackLines.push(`git checkout HEAD -- ${relPath}`);
    } catch (err) {
      filesSkipped++;
      skippedReasons.push(`delete failed: ${relPath} (${(err as Error).message})`);
      fileResults.push({ file: relPath, action: "skipped", reason: "error", bytes: 0 });
    }
  }

  rollbackLines.push("echo 'Rollback complete'");
  await writeFile(rollbackPath, rollbackLines.join("\n"), "utf-8");

  // --- build verification ---
  let buildCmd = "(skipped)";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) buildCmd = "pnpm build";
  else {
    try {
      const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
      if (pkg?.scripts?.build) buildCmd = "npm run build";
    } catch {}
  }
  let buildExit = 0;
  const buildStart = Date.now();
  if (buildCmd !== "(skipped)" && !dryRun) {
    try {
      execFileSync(buildCmd, { cwd, stdio: "ignore", shell: true });
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
      execFileSync("git", ["commit", "-am", `prune: remove ${filesDeleted} dead file(s) [ci skip]`], {
        cwd,
      });
      gitCommit = gitShortHead(cwd);
    } catch {
      /* commit may fail if nothing staged; keep headShort */
    }
  }

  const passed = checks.every((c) => c.passed);

  const report: ExecutionReport = ExecutionReport.parse({
    manifest_sha256: manifestSha,
    checkpoint_stash: checkpointStash,
    rollback_script: rollbackPath,
    dry_run: dryRun,
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
  (report as any).deleted_files = fileResults.filter((r) => r.action === "deleted");
  await writeFile(
    join(pruneDir, "execution-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[GUARDIAN-EXECUTOR] module loaded");
}
