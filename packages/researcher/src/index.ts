import {
  HandoffResearcher,
  HandoffReviewer,
  UserPromptAnalysis,
  LanguagePractices,
  GeneralPractice,
  ToolRecommendation,
  FutureProofing,
} from "@surgical-pruning/core";
import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

// Type inference from Zod schemas
type HandoffResearcherType = z.infer<typeof HandoffResearcher>;
type UserPromptAnalysisType = z.infer<typeof UserPromptAnalysis>;
type LanguagePracticesType = z.infer<typeof LanguagePractices>;
type GeneralPracticeType = z.infer<typeof GeneralPractice>;
type ToolRecommendationType = z.infer<typeof ToolRecommendation>;
type FutureProofingType = z.infer<typeof FutureProofing>;

export interface ResearcherOptions {
  targetPath: string;
  userPrompt: string;
  reviewerHandoff: HandoffReviewer;
  cwd?: string;
}

export async function runResearcher(
  options: ResearcherOptions,
): Promise<HandoffResearcherType> {
  const {
    targetPath,
    userPrompt,
    reviewerHandoff,
    cwd = process.cwd(),
  } = options;
  // INVARIANT: results are written into the TARGET workspace, not the launch
  // cwd. `sink` is the resolved target so results land in the target repo even
  // when invoked from a different directory.
  const sink = resolve(cwd, targetPath);

  console.log(
    `[PRUNE-RESEARCHER] Analyzing prompt and researching best practices`,
  );

  // Analyze user prompt
  const userPromptAnalysis = analyzeUserPrompt(userPrompt, reviewerHandoff);

  // Research language-specific practices
  const languageSpecificPractices = researchLanguagePractices(reviewerHandoff);

  // General practices from spec + research
  const generalPractices: GeneralPracticeType[] = [
    {
      practice: "Start with one signal type (unused exports)",
      source: "repowise blog",
      priority: 1,
    },
    {
      practice: "Sort by confidence, remove in small patches",
      source: "repowise blog",
      priority: 2,
    },
    {
      practice:
        "Verify with production profiling before removing structural dead code",
      source: "FlagShark",
      priority: 3,
    },
    {
      practice:
        'Check framework entry points before removing "unreferenced" files',
      source: "Knip docs",
      priority: 1,
    },
    {
      practice: "Add guardrails: dry-run → stash → confirm → commit",
      source: "dcg pattern",
      priority: 0,
    },
  ];

  // Tool recommendations
  const toolRecommendations: ToolRecommendationType[] = [
    {
      tool: "knip",
      install: "pnpm add -D knip",
      run: "knip --reporter=json",
      output_schema: "KnipReport",
    },
    {
      tool: "depcheck",
      install: "npx depcheck@7.16.4",
      run: "depcheck --json",
      output_schema: "DepcheckReport",
    },
    {
      tool: "bundle-analyzer",
      install: "@next/bundle-analyzer",
      run: "ANALYZE=true pnpm build",
      note: "visual bundle inspection",
    },
  ];

  // Future proofing
  const futureProofing: FutureProofingType = {
    ci_integration: "Add knip to CI pipeline with --fail-on-issues",
    precommit_hook: "husky + lint-staged for knip",
    dependency_budget: "Set bundle size budgets in webpack/next.config",
  };

  const handoff: HandoffResearcherType = {
    user_prompt_analysis: userPromptAnalysis,
    language_specific_practices: languageSpecificPractices,
    general_practices: generalPractices,
    tool_recommendations: toolRecommendations,
    future_proofing: futureProofing,
  };

  // Write output into the TARGET workspace's .prune/ directory.
  const outputDir = join(sink, ".prune");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "handoff-researcher.json"),
    JSON.stringify(handoff, null, 2),
  );

  console.log(
    `[PRUNE-RESEARCHER] Handoff written to ${outputDir}/handoff-researcher.json`,
  );

  return handoff;
}

function analyzeUserPrompt(
  userPrompt: string,
  reviewerHandoff: HandoffReviewer,
): UserPromptAnalysisType {
  const prompt = userPrompt.toLowerCase();

  // Determine intent
  let intent: UserPromptAnalysisType["intent"] = "prune";
  if (prompt.includes("bundle") || prompt.includes("size"))
    intent = "bundle-optimization";
  else if (prompt.includes("cleanup") || prompt.includes("clean"))
    intent = "cleanup";
  else if (prompt.includes("dead")) intent = "dead-code-removal";

  // Determine scope
  let scope: UserPromptAnalysisType["scope"] = "folder";
  if (prompt.includes("monorepo") || reviewerHandoff.constraints.monorepo)
    scope = "monorepo";
  else if (prompt.includes("file") || prompt.includes("pattern"))
    scope = "pattern";

  // Determine aggressiveness
  let aggressiveness: UserPromptAnalysisType["aggressiveness"] = "moderate";
  if (
    prompt.includes("aggressive") ||
    prompt.includes("all") ||
    prompt.includes("everything")
  )
    aggressiveness = "aggressive";
  else if (
    prompt.includes("conservative") ||
    prompt.includes("safe") ||
    prompt.includes("careful")
  )
    aggressiveness = "conservative";

  // Extract constraints from user
  const constraints: string[] = [];
  if (prompt.includes("test")) constraints.push("preserve tests");
  if (prompt.includes("config")) constraints.push("keep config");
  if (prompt.includes("no delete") || prompt.includes("dry run"))
    constraints.push("dry run only");

  return { intent, scope, aggressiveness, constraints_from_user: constraints };
}

function researchLanguagePractices(
  reviewerHandoff: HandoffReviewer,
): Record<string, LanguagePracticesType> {
  const practices: Record<string, LanguagePracticesType> = {};
  const languages = reviewerHandoff.constraints.languages_detected;

  for (const lang of languages) {
    switch (lang) {
      case "typescript":
      case "javascript":
        practices[lang] = {
          tools: [
            {
              name: "knip",
              version: "latest",
              confidence: 0.95,
              config_example: "knip.json",
            },
            {
              name: "ts-prune",
              version: "latest",
              confidence: 0.7,
              note: "legacy, limited",
            },
            {
              name: "repowise get_dead_code",
              confidence: 0.98,
              note: "graph-aware, paid tier",
            },
          ],
          patterns: [
            "barrel file exports",
            "type-only imports",
            "conditional exports",
          ],
          entry_point_heuristics: [
            "next.js pages",
            "vite entry",
            "jest config",
            "storybook",
          ],
        };
        break;
      case "python":
        practices[lang] = {
          tools: [
            { name: "vulture", confidence: 0.85 },
            { name: "pyflakes", confidence: 0.75 },
          ],
          patterns: [
            "__init__.py side effects",
            "plugin entry points",
            "click/typer CLI commands",
          ],
          entry_point_heuristics: ["main.py", "app.py", "cli.py", "setup.py"],
        };
        break;
      case "rust":
        practices[lang] = {
          tools: [{ name: "cargo-udeps", confidence: 0.9 }],
          patterns: [
            "#[cfg(test)] modules",
            "feature-gated code",
            "dead_code allow",
          ],
          entry_point_heuristics: [
            "main.rs",
            "lib.rs",
            "bin/*.rs",
            "examples/*.rs",
          ],
        };
        break;
      case "go":
        practices[lang] = {
          tools: [
            { name: "govet", confidence: 0.8 },
            { name: "staticcheck", confidence: 0.85 },
          ],
          patterns: ["build tags", "init() functions", "plugin packages"],
          entry_point_heuristics: ["main.go", "cmd/**/main.go"],
        };
        break;
      default:
        practices[lang] = {
          tools: [],
          patterns: [],
          entry_point_heuristics: [],
        };
    }
  }

  return practices;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const targetPath = process.argv[2];
  const userPrompt = process.argv[3] || "";
  const handoffPath = process.argv[4];

  if (!targetPath || !handoffPath) {
    console.error(
      "Usage: researcher <target-path> <user-prompt> <handoff-reviewer.json>",
    );
    process.exit(1);
  }

  try {
    const reviewerHandoff = JSON.parse(
      await readFile(handoffPath, "utf-8"),
    ) as HandoffReviewer;
    await runResearcher({ targetPath, userPrompt, reviewerHandoff });
    console.log("[PRUNE-RESEARCHER] Complete");
  } catch (err) {
    console.error("[PRUNE-RESEARCHER] Error:", err);
    process.exit(1);
  }
}
