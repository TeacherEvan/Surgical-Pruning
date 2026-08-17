import {
  HandoffReviewer,
  Constraints,
  EffectedSystem,
  ReviewerMetadata,
  PROTECTED_PATHS,
} from "@surgical-pruning/core";
import {
  scanDirectory,
  generateTreeDiagram,
  estimateEffectedSystems,
  getGitRoot,
  getGitBranch,
  getGitCommit,
} from "@surgical-pruning/core";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

// Convert readonly array to mutable
const PROTECTED_PATTERNS = [...PROTECTED_PATHS];

// Types from Zod schemas
type ConstraintsType = z.infer<typeof Constraints>;
type ReviewerMetadataType = z.infer<typeof ReviewerMetadata>;

export interface ReviewerOptions {
  targetPath: string;
  userPrompt: string;
  cwd?: string;
}

export async function runReviewer(
  options: ReviewerOptions,
): Promise<HandoffReviewer> {
  const { targetPath, userPrompt, cwd = process.cwd() } = options;
  const startTime = Date.now();

  console.log(`[PRUNE-REVIEWER] Starting scan of ${targetPath}`);

  // Get git info
  const gitRoot = await getGitRoot(cwd);
  const gitBranch = await getGitBranch(cwd);
  const gitCommit = await getGitCommit(cwd);

  // Scan directory
  const { files, folders } = await scanDirectory({
    cwd,
    targetPath,
    exclusionPatterns: PROTECTED_PATTERNS,
  });

  console.log(
    `[PRUNE-REVIEWER] Scanned ${files.length} files in ${folders.length} folders`,
  );

  // Generate tree diagram
  const treeDiagram = generateTreeDiagram(files, targetPath);

  // Estimate effected systems
  const effectedSystems = estimateEffectedSystems(files);

  // Detect constraints
  const languagesDetected = [...new Set(files.map((f) => f.language))];
  const frameworksDetected = detectFrameworks(files);
  const packageManagers = detectPackageManagers(cwd);
  const monorepo =
    packageManagers.includes("pnpm") ||
    packageManagers.includes("yarn") ||
    packageManagers.includes("npm");

  const constraints: ConstraintsType = {
    exclusion_patterns_applied: [...PROTECTED_PATTERNS],
    languages_detected: languagesDetected,
    frameworks_detected: frameworksDetected,
    package_managers: packageManagers,
    monorepo,
  };

  // Build metadata
  const metadata: ReviewerMetadataType = {
    target_path: resolve(cwd, targetPath),
    scan_timestamp: new Date().toISOString(),
    scan_duration_ms: Date.now() - startTime,
    git_root: gitRoot,
    git_branch: gitBranch,
    git_commit: gitCommit,
  };

  // Optional cross-check with knip (spec-mandated tool). Runs only if a
  // knip binary is resolvable in the target; never throws on fixtures.
  const knipIssues = await runKnipCrossCheck(cwd);

  const handoff: HandoffReviewer = {
    metadata,
    tree_diagram: treeDiagram,
    file_inventory: files,
    folder_summary: folders,
    effected_systems: effectedSystems,
    constraints,
    external_knip_issues: knipIssues,
  };

  // Write output
  const outputDir = join(cwd, ".prune");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "handoff-reviewer.json"),
    JSON.stringify(handoff, null, 2),
  );

  console.log(
    `[PRUNE-REVIEWER] Handoff written to ${outputDir}/handoff-reviewer.json`,
  );

  return handoff;
}

function detectFrameworks(
  files: { language: string; path: string }[],
): string[] {
  const frameworks = new Set<string>();

  for (const file of files) {
    const name = file.path.toLowerCase();
    if (
      name.includes("next.config") ||
      name.includes("nextjs") ||
      name.includes(".next/")
    )
      frameworks.add("next.js");
    if (name.includes("vite.config") || name.includes("vite"))
      frameworks.add("vite");
    if (name.includes("jest.config") || name.includes("jest"))
      frameworks.add("jest");
    if (name.includes("vitest.config") || name.includes("vitest"))
      frameworks.add("vitest");
    if (name.includes("eslint.config") || name.includes(".eslintrc"))
      frameworks.add("eslint");
    if (name.includes("prettier.config") || name.includes(".prettierrc"))
      frameworks.add("prettier");
    if (name.includes("tailwind.config")) frameworks.add("tailwindcss");
    if (name.includes("svelte.config")) frameworks.add("svelte");
    if (name.includes("astro.config")) frameworks.add("astro");
    if (name.includes("remix.config")) frameworks.add("remix");
    if (name.includes("nuxt.config")) frameworks.add("nuxt");
    if (name.includes("express")) frameworks.add("express");
    if (name.includes("fastify")) frameworks.add("fastify");
    if (name.includes("nestjs")) frameworks.add("nestjs");
  }

  return Array.from(frameworks);
}

function detectPackageManagers(cwd: string): string[] {
  const managers: string[] = [];
  const markers: [string, string][] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
    ["Cargo.lock", "cargo"],
    ["go.mod", "go"],
    ["pyproject.toml", "pip"],
    ["requirements.txt", "pip"],
  ];
  for (const [file, name] of markers) {
    if (existsSync(join(cwd, file))) managers.push(name);
  }
  return managers.length > 0 ? managers : ["npm"];
}

/**
 * Optional knip cross-check (spec-mandated tool). Returns issue identifiers
 * when knip is installed and the target is a JS/TS project; otherwise returns
 * an empty array. Never throws — a missing/unparseable knip run degrades to [].
 */
async function runKnipCrossCheck(cwd: string): Promise<string[]> {
  // Only run knip if a local binary is present (no network/npx resolution).
  const localBin = join(cwd, "node_modules", ".bin", "knip");
  if (!existsSync(localBin)) return [];
  try {
    const out = execFileSync(localBin, ["--reporter=json"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60000,
    }).toString();
    return parseKnipIssues(out);
  } catch (err) {
    // knip exits non-zero when it FINDS issues — its normal job — so its
    // findings land on stdout even though execFileSync throws. Recover them
    // instead of swallowing every real detection.
    const out = (err as { stdout?: Buffer | string })?.stdout;
    if (out) return parseKnipIssues(out.toString());
    return [];
  }
}

function parseKnipIssues(out: string): string[] {
  try {
    const parsed = JSON.parse(out) as {
      issues?: Array<{ type?: string; symbol?: string; file?: string }>;
    };
    return (parsed.issues ?? []).map(
      (i) => `${i.type ?? "issue"}:${i.symbol ?? ""}:${i.file ?? ""}`,
    );
  } catch {
    return [];
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const targetPath = process.argv[2];
  const userPrompt = process.argv[3] || "";

  if (!targetPath) {
    console.error("Usage: reviewer <target-path> [user-prompt]");
    process.exit(1);
  }

  runReviewer({ targetPath, userPrompt })
    .then(() => console.log("[PRUNE-REVIEWER] Complete"))
    .catch((err) => {
      console.error("[PRUNE-REVIEWER] Error:", err);
      process.exit(1);
    });
}
