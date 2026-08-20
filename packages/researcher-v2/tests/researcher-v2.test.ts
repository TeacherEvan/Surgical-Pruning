import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runResearcherV2 } from "../src/index.js";
import { webSearch, cite } from "@surgical-pruning/core";
import { writeFile, mkdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ResearcherV2Output } from "@surgical-pruning/core";

let tmp: string;

beforeEach(async () => {
  tmp = join(
    tmpdir(),
    `sp-rv2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("webResearch (Phase 3)", () => {
  it("webSearch returns real, decodable result URLs", async () => {
    const hits = await webSearch("knip dead code typescript", 3, 8000);
    // Network may be unavailable in CI; when it is, we assert graceful [].
    if (hits.length === 0) return;
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(() => new URL(h.url)).not.toThrow();
      expect(h.url.startsWith("http")).toBe(true);
    }
  });

  it("cite returns a web URL when reachable, else the static fallback", async () => {
    const url = await cite("refactor god object", "https://martinfowler.com/bliki/GodObject.html", 6000);
    expect(() => new URL(url)).not.toThrow();
    expect(url.startsWith("http")).toBe(true);
  });
});

describe("runResearcherV2 (Agent 7)", () => {
  it("emits >=5 prioritized suggestions with valid URLs", async () => {
    const audit = {
      timestamp: new Date().toISOString(),
      git_commit: "abc1234",
      dependency_health: {
        orphans: ["src/old.ts"],
        circular: [],
        duplicates: [],
      },
      architectural_smells: [
        {
          file: "src/big.ts",
          type: "god_module",
          severity: "medium",
          metric: 900,
        },
      ],
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
      security_delta: { vulnerabilities_removed: 0, packages_removed: 0 },
      recommendations: [],
    };
    const researcher = {
      user_prompt_analysis: {
        intent: "prune",
        scope: "folder",
        aggressiveness: "moderate",
        constraints_from_user: [],
      },
      language_specific_practices: {},
      general_practices: [],
      tool_recommendations: [],
      future_proofing: {
        ci_integration: "",
        precommit_hook: "",
        dependency_budget: "",
      },
    };
    const auditPath = join(tmp, "audit-report.json");
    const resPath = join(tmp, "handoff-researcher.json");
    await writeFile(auditPath, JSON.stringify(audit), "utf-8");
    await writeFile(resPath, JSON.stringify(researcher), "utf-8");

    const r = await runResearcherV2({
      auditReportPath: auditPath,
      researcherHandoffPath: resPath,
      cwd: tmp,
    });

    expect(Array.isArray(r.suggestions)).toBe(true);
    expect(r.suggestions.length).toBeGreaterThanOrEqual(5);

    for (const s of r.suggestions) {
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(s.priority);
      expect(() => new URL(s.source)).not.toThrow();
      expect(s.source.startsWith("http")).toBe(true);
    }
    const ids = r.suggestions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // unique

    expect(() => ResearcherV2Output.parse(r)).not.toThrow();
    await expect(
      stat(join(tmp, ".prune", "suggestions.json")),
    ).resolves.toBeDefined();
  });
});
