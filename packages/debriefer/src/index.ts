// DEBRIEFER (Agent 5) — Markdown summary generator
// Consumes an ExecutionReport + Reviewer handoff and renders a debrief.

export interface DebrieferOptions {
  executionReportPath: string;
  reviewerHandoffPath: string;
  cwd?: string;
}

interface DebriefFileRow {
  file: string;
  action: string;
  reason: string;
  bytes: number;
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "(n/a)";
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

export async function runDebriefer(options: DebrieferOptions): Promise<string> {
  const {
    executionReportPath,
    reviewerHandoffPath,
    cwd = process.cwd(),
  } = options;

  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const execRaw = await readFile(executionReportPath, "utf-8").catch(
    () => "{}",
  );
  const reviewerRaw = await readFile(reviewerHandoffPath, "utf-8").catch(
    () => "{}",
  );

  const exec = safeParse<Record<string, any>>(execRaw, {});
  const reviewer = safeParse<Record<string, any>>(reviewerRaw, {});

  const target: string =
    (reviewer?.metadata?.target_path as string) ??
    (exec?.target_path as string) ??
    "(unknown)";

  const filesProcessed = Number(exec?.files_processed ?? 0);
  const filesDeleted = Number(exec?.files_deleted ?? 0);
  const filesSkipped = Number(exec?.files_skipped ?? 0);
  const bytesReclaimed = Number(exec?.bytes_reclaimed ?? 0);
  const dryRun: boolean = Boolean(exec?.dry_run);

  const deletedRows: DebriefFileRow[] = Array.isArray(
    (exec as any)?.deleted_files,
  )
    ? ((exec as any).deleted_files as DebriefFileRow[])
    : [];

  const build = (exec?.build_verification ?? {}) as {
    command?: string;
    exit_code?: number;
    duration_ms?: number;
  };
  const verification = (exec?.verification ?? {}) as {
    passed?: boolean;
    checks?: { name: string; passed: boolean }[];
  };

  const lines: string[] = [];
  lines.push("# Surgical Pruning — Debrief");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Target: \`${target}\``);
  lines.push(`- Files processed: ${filesProcessed}`);
  lines.push(`- Files deleted: ${filesDeleted}`);
  lines.push(`- Files skipped: ${filesSkipped}`);
  lines.push(`- Bytes reclaimed: ${fmtBytes(bytesReclaimed)}`);
  lines.push(`- Dry run: ${dryRun ? "YES" : "NO"}`);
  lines.push(
    `- Build exit code: ${
      typeof build.exit_code === "number" ? build.exit_code : "(n/a)"
    }`,
  );
  lines.push("");

  lines.push("## Target");
  lines.push("");
  lines.push(`\`${target}\``);
  lines.push("");

  lines.push("## Files Deleted");
  lines.push("");
  if (deletedRows.length > 0) {
    lines.push("| File | Bytes | Reason |");
    lines.push("| --- | --- | --- |");
    for (const row of deletedRows) {
      lines.push(
        `| \`${row.file}\` | ${fmtBytes(row.bytes)} | ${
          row.reason || "(n/a)"
        } |`,
      );
    }
  } else {
    lines.push("(see execution report for per-file deletion detail)");
  }
  lines.push("");

  lines.push("## Files Skipped");
  lines.push("");
  const skippedReasons = Array.isArray(exec?.skipped_reasons)
    ? (exec?.skipped_reasons as string[])
    : [];
  if (skippedReasons.length > 0) {
    for (const r of skippedReasons) lines.push(`- ${r}`);
  } else {
    lines.push(`Skipped count: ${filesSkipped}`);
  }
  lines.push("");

  lines.push("## Protected Skipped");
  lines.push("");
  const protectedSkipped = Array.isArray(exec?.protected_skipped)
    ? (exec?.protected_skipped as string[])
    : [];
  lines.push(
    protectedSkipped.length > 0
      ? protectedSkipped.map((p) => `- \`${p}\``).join("\n")
      : "(none)",
  );
  lines.push("");

  lines.push("## Build Verification");
  lines.push("");
  lines.push(`- Command: ${build.command ?? "(n/a)"}`);
  lines.push(
    `- Exit code: ${
      typeof build.exit_code === "number" ? build.exit_code : "(n/a)"
    }`,
  );
  lines.push(
    `- Duration: ${
      typeof build.duration_ms === "number"
        ? `${build.duration_ms} ms`
        : "(n/a)"
    }`,
  );
  lines.push("");

  lines.push("## Verification");
  lines.push("");
  lines.push(
    `- Passed: ${
      verification.passed === true
        ? "YES"
        : verification.passed === false
          ? "NO"
          : "(n/a)"
    }`,
  );
  if (Array.isArray(verification.checks) && verification.checks.length > 0) {
    lines.push("");
    lines.push("| Check | Passed |");
    lines.push("| --- | --- |");
    for (const c of verification.checks) {
      lines.push(`| ${c.name} | ${c.passed ? "YES" : "NO"} |`);
    }
  }
  lines.push("");

  lines.push("## Safety");
  lines.push("");
  lines.push(`- Git checkpoint: \`${exec?.checkpoint_stash || "(none)"}\``);
  lines.push(`- Rollback script: \`${exec?.rollback_script || "(none)"}\``);
  lines.push("");

  lines.push("## Recommendations");
  lines.push("");
  lines.push(
    "- Re-run the target project's test suite to confirm no behaviour regressed.",
  );
  lines.push(
    "- Manually review any file with confidence < 70% before committing a real deletion.",
  );
  lines.push(
    "- Commit the prune in a scoped, reviewable commit once verified.",
  );
  lines.push(
    "- Keep the generated rollback script until the prune is fully validated.",
  );
  lines.push("");

  const md = lines.join("\n");

  const pruneDir = join(cwd, ".prune");
  await mkdir(pruneDir, { recursive: true });
  await writeFile(join(pruneDir, "DEBRIEF.md"), md, "utf-8");

  return md;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[DEBRIEFER] module loaded");
}
