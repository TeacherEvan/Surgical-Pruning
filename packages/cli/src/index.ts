import {
  HandoffReviewer,
  HandoffResearcher,
} from "@surgical-pruning/core";
import { runReviewer } from "@surgical-pruning/reviewer";
import { runResearcher } from "@surgical-pruning/researcher";
import { runPlanner } from "@surgical-pruning/planner";
import { mkdir } from "node:fs/promises";
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

  // HONEST STATUS — Agents 3-7 (planner, executor, verifier, debriefer,
  // auditor, researcher-v2) are NOT yet implemented in this codebase. The
  // pipeline genuinely cannot proceed to the execution phase until they exist.
  console.log(
    "════════════════════════════════════════════════════════════════",
  );
  console.log("PIPELINE STATUS — PARTIAL IMPLEMENTATION");
  console.log("  ✅ PRUNE-REVIEWER  (Agent 1): implemented & run");
  console.log("  ✅ PRUNE-RESEARCHER (Agent 2): implemented & run");
  console.log("  ⛔ PRUNING-PLANNER (Agent 3): NOT YET IMPLEMENTED");
  console.log("  ⛔ GUARDIAN-EXECUTOR (Agent 4A): NOT YET IMPLEMENTED");
  console.log("  ⛔ GUARDIAN-VERIFIER (Agent 4B): NOT YET IMPLEMENTED");
  console.log("  ⛔ DEBRIEFER (Agent 5): NOT YET IMPLEMENTED");
  console.log("  ⛔ CODEBASE-AUDITOR (Agent 6): NOT YET IMPLEMENTED");
  console.log("  ⛔ RESEARCHER v2 (Agent 7): NOT YET IMPLEMENTED");
  console.log("");
  console.log("Implemented phases ran successfully. The pipeline stops here");
  console.log("because Agents 3-7 have no implementation to execute.");
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
