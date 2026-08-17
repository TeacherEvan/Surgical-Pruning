// GUARDIAN-VERIFIER (Agent 4B)
// Validates that an execution against a PruneManifest did not break guardrails:
//   - protected paths are never targeted for deletion
//   - git working tree has no protected-path changes
//   - the build still passes
//   - an execution log is present
// Emits a structured verification report to <cwd>/.prune/verification-report.json.

import { PROTECTED_PATHS } from "@surgical-pruning/core";
import type { ExecutionReport } from "@surgical-pruning/core";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export interface VerifierOptions {
  manifestPath: string;
  executionLogPath: string;
  cwd?: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface VerificationReport {
  passed: boolean;
  checks: VerificationCheck[];
  violations: string[];
  report_path: string;
  timestamp: string;
}

/** Mutable copy of the frozen core constant. */
const PROTECTED = [...PROTECTED_PATHS];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Test a file path against the PROTECTED_PATHS ruleset.
 * - directory prefixes (ending in "/") match any path under that directory
 * - globs ("*") are matched against the full path and the basename
 * - plain entries match the exact path or the basename
 */
export function isProtectedPath(p: string): boolean {
  const path = p.trim();
  if (path.length === 0) return false;
  const base = path.split("/").pop() ?? path;
  for (const pattern of PROTECTED) {
    if (pattern.endsWith("/")) {
      if (path === pattern.slice(0, -1) || path.startsWith(pattern) || path.includes("/" + pattern)) {
        return true;
      }
    } else if (pattern.includes("*")) {
      const re = new RegExp("^" + pattern.split("*").map(escapeRegExp).join(".*") + "$");
      if (re.test(path) || re.test(base)) return true;
    } else if (path === pattern || base === pattern) {
      return true;
    }
  }
  return false;
}

/** Parse a manifest JSON file; throw a clear Error when it is missing/invalid. */
async function loadManifest(manifestPath: string): Promise<any> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error("invalid manifest");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid manifest");
  }
}

/** Read an execution log; tolerate non-JSON (treat as raw text). */
async function loadExecutionLog(executionLogPath: string): Promise<{ exists: boolean; json: ExecutionReport | null; raw: string }> {
  let raw: string;
  try {
    raw = await readFile(executionLogPath, "utf8");
  } catch {
    return { exists: false, json: null, raw: "" };
  }
  let json: ExecutionReport | null = null;
  try {
    json = JSON.parse(raw) as ExecutionReport;
  } catch {
    json = null;
  }
  return { exists: true, json, raw };
}

/** Run `git status --porcelain`; return null when cwd is not a git repo. */
function gitPorcelain(cwd: string): string | null {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd,
      timeout: 30000,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
  } catch {
    return null;
  }
}

/** Extract the affected path from a porcelain line (handles renames `a -> b`). */
function porcelainPath(line: string): string {
  const body = line.slice(3).trim();
  const arrow = body.indexOf(" -> ");
  return arrow >= 0 ? body.slice(arrow + 4) : body;
}

/** Detect the build command for a working directory. */
async function detectBuildCommand(cwd: string): Promise<{ cmd: string[]; label: string } | null> {
  try {
    await stat(join(cwd, "pnpm-lock.yaml"));
    return { cmd: ["pnpm", "build"], label: "pnpm build" };
  } catch {
    /* no pnpm lockfile */
  }
  try {
    const pkgRaw = await readFile(join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    if (pkg.scripts && typeof pkg.scripts.build === "string") {
      return { cmd: ["npm", "run", "build"], label: "npm run build" };
    }
  } catch {
    /* no package.json or no scripts.build */
  }
  return null;
}

export async function runVerifier(options: VerifierOptions): Promise<VerificationReport> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const checks: VerificationCheck[] = [];
  const violations: string[] = [];

  // 2. Read + parse manifest (invalid => throw).
  const manifest = await loadManifest(options.manifestPath);

  // a) manifest_present
  checks.push({
    name: "manifest_present",
    passed: Array.isArray(manifest?.selected_files),
    details: Array.isArray(manifest?.selected_files)
      ? `selected_files: ${manifest.selected_files.length}`
      : "manifest.selected_files missing or not an array",
  });

  // b) no_protected_files_targeted
  let protectedOk = true;
  const selected: unknown[] = Array.isArray(manifest?.selected_files) ? manifest.selected_files : [];
  for (const entry of selected) {
    if (
      entry &&
      typeof entry === "object" &&
      (entry as any).action === "delete" &&
      typeof (entry as any).path === "string"
    ) {
      const p = (entry as any).path as string;
      if (isProtectedPath(p)) {
        protectedOk = false;
        violations.push(`Protected path targeted for deletion: ${p}`);
      }
    }
  }
  checks.push({
    name: "no_protected_files_targeted",
    passed: protectedOk,
    details: protectedOk ? "no protected paths targeted for deletion" : violations.join("; "),
  });

  // c) git_status_clean
  const porcelain = gitPorcelain(cwd);
  if (porcelain === null) {
    checks.push({ name: "git_status_clean", passed: true, details: "not a git repo / skipped" });
  } else {
    let gitOk = true;
    for (const line of porcelain.split("\n")) {
      if (line.trim().length === 0) continue;
      const p = porcelainPath(line);
      if (p && isProtectedPath(p)) {
        gitOk = false;
        violations.push(`Protected path changed in git status: ${p} (${line.slice(0, 2).trim()})`);
      }
    }
    checks.push({
      name: "git_status_clean",
      passed: gitOk,
      details: gitOk ? "no protected-path changes in git status" : violations.join("; "),
    });
  }

  // d) build_passes
  const buildCmd = await detectBuildCommand(cwd);
  if (!buildCmd) {
    checks.push({ name: "build_passes", passed: true, details: "no build cmd" });
  } else {
    let buildOk = true;
    let buildDetails = buildCmd.label;
    try {
      execFileSync(buildCmd.cmd[0]!, buildCmd.cmd.slice(1), {
        cwd,
        timeout: 60000,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (err: any) {
      buildOk = false;
      const status = typeof err?.status === "number" ? err.status : "error";
      buildDetails = `${buildCmd.label} exited ${status}`;
    }
    checks.push({ name: "build_passes", passed: buildOk, details: buildDetails });
  }

  // e) execution_log_present
  const exec = await loadExecutionLog(options.executionLogPath);
  checks.push({
    name: "execution_log_present",
    passed: exec.exists,
    details: exec.exists ? "execution log found" : "execution log missing",
  });

  const passed = checks.every((c) => c.passed);

  const timestamp = new Date().toISOString();
  const report: VerificationReport = {
    passed,
    checks,
    violations,
    report_path: join(cwd, ".prune", "verification-report.json"),
    timestamp,
  };

  // 6. Write verification-report.json (mkdir recursive first).
  const outDir = join(cwd, ".prune");
  await mkdir(outDir, { recursive: true });
  await writeFile(report.report_path, JSON.stringify(report, null, 2), "utf8");

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [manifestPath, executionLogPath] = process.argv.slice(2);
  if (manifestPath && executionLogPath) {
    runVerifier({ manifestPath, executionLogPath })
      .then((r) => {
        console.log(JSON.stringify(r, null, 2));
        process.exit(r.passed ? 0 : 1);
      })
      .catch((e) => {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(2);
      });
  } else {
    console.log("[GUARDIAN-VERIFIER] usage: node index.js <manifest> <execution-log>");
  }
}
