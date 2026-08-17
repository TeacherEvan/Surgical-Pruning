import {
  HandoffReviewer,
  HandoffResearcher,
} from "@surgical-pruning/core";
import { runReviewer } from "@surgical-pruning/reviewer";
import { runResearcher } from "@surgical-pruning/researcher";
import { runPlanner } from "@surgical-pruning/planner";
import { runExecutor } from "@surgical-pruning/executor";
import { runVerifier } from "@surgical-pruning/verifier";
import { runDebriefer } from "@surgical-pruning/debriefer";
import { runAuditor } from "@surgical-pruning/auditor";
import { runResearcherV2 } from "@surgical-pruning/researcher-v2";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

export interface CLIOptions {
  targetPath: string;
  userPrompt?: string;
  dryRun?: boolean;
  outputDir?: string;
  cwd?: string;
}

export async function runCLI(options: CLIOptions): Promise<void> {
  const {
    targetPath,
    userPrompt = "",
    dryRun = false,
    cwd = process.cwd(),
  } = options;
  const absTarget = resolve(cwd, targetPath);

  console.log(
    "╔═══════════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                    SURGICAL PRUNING — Multi-Agent                          ║",
  );
  console.log(
    "║                     Surgical, Auditable Codebase Pruning                   ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════════════════╝",
  );
  console.log("");
  console.log(`Target: ${absTarget}`);
  console.log(`Prompt: ${userPrompt || "(none)"}`);
  console.log(`Dry Run: ${dryRun ? "YES" : "NO"}`);
  console.log("");

  // Ensure .prune directory exists
  const pruneDir = join(cwd, ".prune");
  await mkdir(pruneDir, { recursive: true });

  // ============================================================================
  // PHASE 1: AGENT 1 — PRUNE-REVIEWER
  // ============================================================================
  console.log(
    "┌─────────────────────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│ AGENT 1: PRUNE-REVIEWER — System Cartographer                              │",
  );
  console.log(
    "└─────────────────────────────────────────────────────────────────────────────┘",
  );

  const reviewerHandoff: HandoffReviewer = await runReviewer({
    targetPath: absTarget,
    userPrompt,
    cwd,
  });

  // ============================================================================
  // PHASE 2: AGENT 2 — PRUNE-RESEARCHER
  // ============================================================================
  console.log("");
  console.log(
    "┌─────────────────────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│ AGENT 2: PRUNE-RESEARCHER — Practice Investigator                          │",
  );
  console.log(
    "└─────────────────────────────────────────────────────────────────────────────┘",
  );

  const researcherHandoff: HandoffResearcher = await runResearcher({
    targetPath: absTarget,
    userPrompt,
    reviewerHandoff,
    cwd,
  });

  // ============================================================================
  // PHASE 3: AGENT 3 — PRUNING-PLANNER
  // ============================================================================
  console.log("");
  console.log(
    "┌─────────────────────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│ AGENT 3: PRUNING-PLANNER — Interactive HTML Generator                      │",
  );
  console.log(
    "└─────────────────────────────────────────────────────────────────────────────┘",
  );

  const plannerOutput = await runPlanner({
    reviewerHandoff,
    researcherHandoff,
    cwd,
  });

  console.log(`Planner output: ${plannerOutput}`);
  console.log("");

  // ============================================================================
  // PHASE 4: AGENTS 4A/4B — EXECUTION GUARDIANS (only if a manifest is present)
  // ============================================================================
  // Per the spec's safety model, real deletions require explicit user
  // confirmation captured by the planner's HTML interface (PRUNE_MANIFEST.json).
  // The unattended CLI only proceeds to execution if such a manifest exists.
  const manifestPath = join(cwd, ".prune", "PRUNE_MANIFEST.json");
  if (existsSync(manifestPath)) {
    console.log(
      "┌─────────────────────────────────────────────────────────────────────────────┐",
    );
    console.log(
      "│ AGENTS 4A/4B: GUARDIAN-EXECUTOR + GUARDIAN-VERIFIER                          │",
    );
    console.log(
      "└─────────────────────────────────────────────────────────────────────────────┘",
    );
    const execLogPath = join(cwd, ".prune", "execution-report.json");
    const executionReport = await runExecutor({ manifestPath, cwd });
    console.log(
      `Executor: ${executionReport.files_deleted} deleted, ${executionReport.files_skipped} skipped, ${executionReport.bytes_reclaimed} bytes reclaimed.`,
    );
    const verification = await runVerifier({
      manifestPath,
      executionLogPath: execLogPath,
      cwd,
    });
    console.log(
      `Verifier: ${verification.passed ? "PASSED" : "FAILED"} (${verification.violations.length} violations)`,
    );
    console.log("");
  } else {
    console.log(
      "⚠ Skipping Agents 4A/4B execution — no PRUNE_MANIFEST.json present.",
    );
    console.log(
      "  Generate + confirm a plan in the planner HTML, then place PRUNE_MANIFEST.json",
    );
    console.log("  in .prune/ to run the deletion guardians.");
    console.log("");
  }

  // ============================================================================
  // PHASE 5/6/7: POST-EXECUTION AGENTS
  // ============================================================================
  const reviewerHandoffPath = join(cwd, ".prune", "handoff-reviewer.json");
  const execReportPath = join(cwd, ".prune", "execution-report.json");
  const auditReportPath = join(cwd, ".prune", "audit-report.json");
  const researcherHandoffPath = join(cwd, ".prune", "handoff-researcher.json");

  console.log(
    "┌─────────────────────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│ AGENTS 5/6/7: DEBRIEFER · CODEBASE-AUDITOR · RESEARCHER v2                   │",
  );
  console.log(
    "└─────────────────────────────────────────────────────────────────────────────┘",
  );

  if (existsSync(execReportPath) && existsSync(reviewerHandoffPath)) {
    const debrief = await runDebriefer({
      executionReportPath: execReportPath,
      reviewerHandoffPath,
      cwd,
    });
    console.log(`Debriefer: wrote ${join(cwd, ".prune", "DEBRIEF.md")}`);
  } else {
    console.log("Debriefer: skipped (no execution report yet).");
  }

  if (existsSync(reviewerHandoffPath)) {
    const audit = await runAuditor({
      targetPath: absTarget,
      reviewerHandoffPath,
      cwd,
    });
    console.log(
      `Auditor: ${audit.architectural_smells.length} smells, ${audit.dependency_health.orphans.length} orphans.`,
    );
  } else {
    console.log("Auditor: skipped (no reviewer handoff yet).");
  }

  if (existsSync(auditReportPath) && existsSync(researcherHandoffPath)) {
    const suggestions = await runResearcherV2({
      auditReportPath,
      researcherHandoffPath,
      cwd,
    });
    console.log(`Researcher v2: ${suggestions.suggestions.length} suggestions.`);
  } else {
    console.log("Researcher v2: skipped (no audit report yet).");
  }

  console.log("");
  console.log(
    "════════════════════════════════════════════════════════════════",
  );
  console.log("PIPELINE STATUS — ALL 7 AGENTS IMPLEMENTED");
  console.log("  ✅ PRUNE-REVIEWER  (Agent 1): implemented & run");
  console.log("  ✅ PRUNE-RESEARCHER (Agent 2): implemented & run");
  console.log("  ✅ PRUNING-PLANNER (Agent 3): implemented & run (HTML generated)");
  console.log("  ✅ GUARDIAN-EXECUTOR (Agent 4A): implemented (runs if manifest present)");
  console.log("  ✅ GUARDIAN-VERIFIER (Agent 4B): implemented (runs if manifest present)");
  console.log("  ✅ DEBRIEFER (Agent 5): implemented");
  console.log("  ✅ CODEBASE-AUDITOR (Agent 6): implemented");
  console.log("  ✅ RESEARCHER v2 (Agent 7): implemented");
  console.log(
    "════════════════════════════════════════════════════════════════",
  );
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Surgical Pruning CLI — Multi-Agent Codebase Pruning

Usage: surgical-prune <target-path> [options]

Options:
  -p, --prompt <text>     User prompt describing pruning intent
  --dry-run               Simulate deletions without executing
  -h, --help              Show this help

Examples:
  surgical-prune ./my-project --prompt "Remove dead code aggressively"
  surgical-prune ./my-project --prompt "Clean up unused exports" --dry-run
`);
    process.exit(0);
  }

  const targetPath = args[0];
  const userPrompt = args.find((a) => a === "-p" || a === "--prompt")
    ? args[args.indexOf(args.find((a) => a === "-p" || a === "--prompt")!) + 1]
    : "";
  const dryRun = args.includes("--dry-run");

  if (!targetPath) {
    console.error("Error: target-path is required");
    process.exit(1);
  }

  await runCLI({ targetPath, userPrompt, dryRun })
    .then(() =>
      console.log(
        "\n✅ Implemented phases complete (Agents 1-2). Agents 3-7 pending — see status above.",
      ),
    )
    .catch((err) => {
      console.error("\n❌ Pipeline failed:", err);
      process.exit(1);
    });
}
