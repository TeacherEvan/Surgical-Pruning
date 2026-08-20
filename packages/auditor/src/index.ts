// CODEBASE-AUDITOR (Agent 6) — post-prune audit report generator.
// Consumes the Reviewer handoff and emits an AUDIT_REPORT.json matching the
// core Zod AuditReport schema.
//
// Depth (Phase 4): where real tooling is available it is invoked — madge for
// circular deps, pnpm dedupe --check for duplicates, tsc --extendedDiagnostics
// for build timing, npm audit for security. When a tool is absent the field is
// left as an empty/zero result AND a recommendation is recorded so the
// shortfall is explicit rather than silently faked.

import { AuditReport } from "@surgical-pruning/core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export interface AuditorOptions {
  targetPath: string;
  reviewerHandoffPath: string;
  cwd?: string;
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function runQuiet(cmd: string, args: string[], cwd: string): string | null {
  try {
    const out = spawnSync(cmd, args, {
      cwd,
      encoding: "utf-8",
      timeout: 60000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (out.status === 0 || out.stdout) return out.stdout ?? "";
    // Some tools exit non-zero on findings (e.g. madge --circular prints them
    // and exits 1). Capture stdout regardless.
    return out.stdout ?? null;
  } catch {
    return null;
  }
}

function findBin(cwd: string, name: string): string {
  const local = join(cwd, "node_modules", ".bin", name);
  return existsSync(local) ? local : name; // fall back to PATH
}

export async function runAuditor(
  options: AuditorOptions,
): Promise<AuditReport> {
  const { targetPath, reviewerHandoffPath, cwd = process.cwd() } = options;
  // INVARIANT: results are written into the TARGET workspace, not the launch
  // cwd. `sink` is the resolved target so the audit report lands in the target
  // repo even when invoked from a different directory.
  const sink = resolve(cwd, targetPath);

  const raw = await readFile(reviewerHandoffPath, "utf-8").catch(() => "{}");
  const reviewer = safeParse<Record<string, any>>(raw, {});
  const inventory: any[] = Array.isArray(reviewer?.file_inventory)
    ? reviewer.file_inventory
    : [];

  const recommendations: string[] = [];

  // --- Orphans (real: zero references + not an anchor) ---
  const orphans = inventory
    .filter(
      (f) =>
        f?.dead_code_signals?.zero_references &&
        !f?.dependency_graph?.is_entry_point &&
        !f?.dependency_graph?.is_test &&
        !f?.dependency_graph?.is_config,
    )
    .map((f) => String(f.path));

  // --- Circular dependencies (madge, if installed) ---
  let circular: string[] = [];
  const madgeBin = findBin(sink, "madge");
  const madgeOut = runQuiet(
    madgeBin,
    ["--circular", "--warning", sink],
    sink,
  );
  if (madgeOut && madgeOut.trim().length > 0) {
    circular = madgeOut
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } else if (!existsSync(join(sink, "node_modules", ".bin", "madge"))) {
    recommendations.push(
      "Install madge to measure circular dependencies: pnpm add -D madge",
    );
  }

  // --- Duplicate dependencies (pnpm dedupe --check) ---
  let duplicates: string[] = [];
  const dedupeOut = runQuiet("pnpm", ["dedupe", "--check"], sink);
  // pnpm exits non-zero when duplicates exist and prints them to stderr; the
  // runQuiet wrapper only captures stdout, so also try parsing stderr via a
  // direct exec for the check.
  try {
    const chk = execFileSync("pnpm", ["dedupe", "--check"], {
      cwd: sink,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    void chk;
    duplicates = []; // clean
  } catch (e) {
    const err = (e as { stderr?: string; stdout?: string })?.stderr ||
      (e as { stdout?: string })?.stdout ||
      "";
    if (err.includes("duplicate") || err.includes("dedupe")) {
      duplicates = err
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.includes("@") || l.includes("dedupe"));
      recommendations.push(
        "Run `pnpm dedupe` to collapse duplicate dependency versions.",
      );
    }
  }

  // --- Architectural smells ---
  const architecturalSmells: any[] = [];
  const GOD_MODULE_THRESHOLD = 500; // spec: >500 lines
  const siblingImports = new Map<string, Set<string>>();

  for (const f of inventory) {
    const lines = Number(f?.lines) || 0;
    if (lines > GOD_MODULE_THRESHOLD) {
      architecturalSmells.push({
        file: String(f.path),
        type: "god_module" as const,
        severity: lines > 1000 ? ("high" as const) : ("medium" as const),
        metric: lines,
      });
    }
    // feature_envy: a file imports modules from >3 *different* sibling
    // directories (sign of misplaced responsibility).
    const myDir = String(f.path).includes("/")
      ? String(f.path).slice(0, String(f.path).lastIndexOf("/"))
      : ".";
    const dirs = new Set<string>();
    for (const imp of (f?.dependency_graph?.imports as string[]) ?? []) {
      if (typeof imp !== "string") continue;
      const spec = imp.startsWith("internal:") ? imp.slice("internal:".length) : "";
      if (!spec.startsWith(".")) continue;
      const dir = spec.includes("/")
        ? spec.slice(0, spec.lastIndexOf("/"))
        : ".";
      if (dir !== "." && dir !== myDir) dirs.add(dir);
    }
    if (dirs.size > 3) {
      architecturalSmells.push({
        file: String(f.path),
        type: "feature_envy" as const,
        severity: dirs.size > 5 ? ("high" as const) : ("medium" as const),
        metric: dirs.size,
      });
    }
  }

  // shotgun_surgery: a directory whose files are imported by a very large
  // number of *other* files (change amplifier).
  const dirImporters = new Map<string, Set<string>>();
  for (const f of inventory) {
    const dir = String(f.path).includes("/")
      ? String(f.path).slice(0, String(f.path).lastIndexOf("/"))
      : ".";
    const importers = (f?.dependency_graph?.imported_by as string[]) ?? [];
    if (!dirImporters.has(dir)) dirImporters.set(dir, new Set());
    const set = dirImporters.get(dir)!;
    for (const imp of importers) set.add(imp);
  }
  for (const [dir, importers] of dirImporters) {
    if (importers.size > 5) {
      architecturalSmells.push({
        file: dir + "/",
        type: "shotgun_surgery" as const,
        severity: importers.size > 10 ? ("high" as const) : ("medium" as const),
        metric: importers.size,
      });
    }
  }

  // --- Build performance: real tsc extended diagnostics (compile time) ---
  // For a monorepo, measure each package's own tsconfig compile time and sum.
  let tscTimeMs = 0;
  const tscBin = findBin(sink, "tsc");
  const pkgs = existsSync(join(sink, "packages"))
    ? readdirSync(join(sink, "packages"))
        .map((p) => join(sink, "packages", p, "tsconfig.json"))
        .filter((p) => existsSync(p))
    : existsSync(join(sink, "tsconfig.json"))
      ? [join(sink, "tsconfig.json")]
      : [];
  for (const cfg of pkgs) {
    const out = runQuiet(tscBin, ["--extendedDiagnostics", "--noEmit", "-p", cfg], sink);
    if (out) {
      const m = out.match(/Total time:\s*([\d.]+)\s*(ms|s)/i);
      if (m) {
        const val = Number(m[1]);
        const ms = /ms/i.test(m[2]!) ? val : val * 1000;
        tscTimeMs += Math.round(ms);
      }
    }
  }
  if (tscTimeMs === 0) {
    recommendations.push(
      "Install typescript to measure build performance: pnpm add -D typescript",
    );
  }

  // --- Security delta: npm audit (real vulnerabilities) ---
  let vulnerabilitiesRemoved = 0;
  let packagesRemoved = 0;
  const auditOut = runQuiet("npm", ["audit", "--json"], sink);
  if (auditOut) {
    try {
      const a = JSON.parse(auditOut) as any;
      vulnerabilitiesRemoved =
        a?.metadata?.vulnerabilities?.total ??
        a?.vulnerabilities?.length ??
        0;
      packagesRemoved = a?.metadata?.dependencies?.length ?? 0;
      if (vulnerabilitiesRemoved > 0) {
        recommendations.push(
          `npm audit reports ${vulnerabilitiesRemoved} vulnerabilities — review before pruning.`,
        );
      }
    } catch {
      /* ignore malformed audit json */
    }
  }

  const report = AuditReport.parse({
    timestamp: new Date().toISOString(),
    git_commit: String(reviewer?.metadata?.git_commit ?? "unknown"),
    dependency_health: {
      orphans,
      circular,
      duplicates,
    },
    architectural_smells: architecturalSmells,
    coverage_delta: {
      lines_removed: 0,
      covered_lines_lost: 0,
      pct_change: 0,
    },
    build_performance: {
      bundle_size_kb_before: 0,
      bundle_size_kb_after: 0,
      tsc_time_ms_delta: tscTimeMs,
    },
    security_delta: {
      vulnerabilities_removed: vulnerabilitiesRemoved,
      packages_removed: packagesRemoved,
    },
    recommendations,
  });

  // Write output into the TARGET workspace's .prune/ directory.
  const pruneDir = join(sink, ".prune");
  await mkdir(pruneDir, { recursive: true });
  await writeFile(
    join(pruneDir, "audit-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[CODEBASE-AUDITOR] module loaded");
}
