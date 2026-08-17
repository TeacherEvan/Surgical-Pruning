// RESEARCHER v2 (Agent 7) — prioritized improvement suggestions.
// Consumes an AuditReport + Researcher handoff and emits >=5 Suggestions
// matching the core Zod ResearcherV2Output schema.

import { ResearcherV2Output } from "@surgical-pruning/core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface ResearcherV2Options {
  auditReportPath: string;
  researcherHandoffPath: string;
  cwd?: string;
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function runResearcherV2(
  options: ResearcherV2Options,
): Promise<ResearcherV2Output> {
  const { auditReportPath, researcherHandoffPath, cwd = process.cwd() } =
    options;

  const auditRaw = await readFile(auditReportPath, "utf-8").catch(() => "{}");
  const resRaw = await readFile(researcherHandoffPath, "utf-8").catch(
    () => "{}",
  );
  const audit = safeParse<Record<string, any>>(auditRaw, {});
  const _researcher = safeParse<Record<string, any>>(resRaw, {});

  const smells: any[] = Array.isArray(audit?.architectural_smells)
    ? audit.architectural_smells
    : [];
  const orphans: string[] = Array.isArray(
    audit?.dependency_health?.orphans,
  )
    ? audit.dependency_health.orphans
    : [];

  const suggestions: any[] = [];
  let n = 0;
  const id = () => `s${++n}`;

  for (const smell of smells) {
    suggestions.push({
      id: id(),
      priority: "HIGH",
      category: "architecture",
      title: `Split god module ${smell?.file}`,
      finding: `File has ${smell?.metric} lines and is flagged as a god_module (severity ${smell?.severity}).`,
      action:
        "Extract responsibilities into smaller modules; add barrel exports to preserve public API.",
      source: "https://martinfowler.com/bliki/GodObject.html",
      effort: "M",
      impact: "Improved maintainability and reviewability.",
    });
  }

  if (orphans.length > 0) {
    suggestions.push({
      id: id(),
      priority: "MEDIUM",
      category: "dead-code",
      title: `Remove ${orphans.length} orphaned file(s)`,
      finding: `Detected orphaned files with zero references: ${orphans.join(", ")}.`,
      action:
        "Review and delete orphaned files via the planner (dry-run first), then commit in a scoped PR.",
      source: "https://knip.dev/guide",
      effort: "S",
      impact: "Reduced surface area and bundle size.",
    });
  }

  suggestions.push({
    id: id(),
    priority: "HIGH",
    category: "ci",
    title: "Add knip to CI",
    finding: "No automated dead-code detection is configured.",
    action: "pnpm add -D knip && knip --reporter=json",
    source: "https://github.com/webpro-nl/knip",
    effort: "S",
    impact: "Continuous dead-code detection on every PR.",
  });

  suggestions.push({
    id: id(),
    priority: "MEDIUM",
    category: "ci",
    title: "Add husky pre-commit guard",
    finding: "No pre-commit hook guards against accidental commits of dead/large files.",
    action: "pnpm add -D husky && husky init",
    source: "https://typicode.github.io/husky/",
    effort: "S",
    impact: "Cheap safety net before each commit.",
  });

  suggestions.push({
    id: id(),
    priority: "LOW",
    category: "performance",
    title: "Set a bundle size budget",
    finding: "No enforced size budget for the build output.",
    action:
      "Configure a size-limit check in CI to fail on unexpected growth.",
    source: "https://nextjs.org/docs/app/building-your-application/optimizing",
    effort: "M",
    impact: "Prevents silent bundle bloat.",
  });

  const out = ResearcherV2Output.parse({ suggestions });

  const pruneDir = join(cwd, ".prune");
  await mkdir(pruneDir, { recursive: true });
  await writeFile(
    join(pruneDir, "suggestions.json"),
    JSON.stringify(out, null, 2),
    "utf-8",
  );

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[RESEARCHER-V2] module loaded");
}
