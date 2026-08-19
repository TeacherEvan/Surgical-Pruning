// CODEBASE-AUDITOR (Agent 6) — post-prune audit report generator.
// Consumes the Reviewer handoff and emits an AUDIT_REPORT.json matching the
// core Zod AuditReport schema.

import { AuditReport } from "@surgical-pruning/core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

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

  const orphans = inventory
    .filter(
      (f) =>
        f?.dead_code_signals?.zero_references &&
        !f?.dependency_graph?.is_entry_point &&
        !f?.dependency_graph?.is_test &&
        !f?.dependency_graph?.is_config,
    )
    .map((f) => String(f.path));

  const architecturalSmells = inventory
    .filter((f) => (Number(f?.lines) || 0) > 800)
    .map((f) => ({
      file: String(f.path),
      type: "god_module" as const,
      severity: "medium" as const,
      metric: Number(f.lines) || 0,
    }));

  const report = AuditReport.parse({
    timestamp: new Date().toISOString(),
    git_commit: String(reviewer?.metadata?.git_commit ?? "unknown"),
    dependency_health: {
      orphans,
      circular: [],
      duplicates: [],
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
      tsc_time_ms_delta: 0,
    },
    security_delta: {
      vulnerabilities_removed: 0,
      packages_removed: 0,
    },
    recommendations: [],
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
