import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runPlanner } from "../src/index.js";

function makeReviewerHandoff() {
  const iso = new Date().toISOString();
  return {
    metadata: {
      target_path: "/tmp/demo",
      scan_timestamp: iso,
      scan_duration_ms: 1,
      git_root: "/tmp/demo",
      git_branch: "main",
      git_commit: "abc1234",
    },
    tree_diagram: "tree",
    file_inventory: [
      {
        path: "src/dead.ts",
        size_bytes: 100,
        lines: 10,
        language: "typescript",
        last_modified: iso,
        git_history: {
          first_commit: iso,
          last_commit: iso,
          commit_count: 1,
          authors: ["x"],
        },
        dependency_graph: {
          imports: [],
          imported_by: [],
          entry_point_distance: 3,
          is_entry_point: false,
          is_test: false,
          is_config: false,
        },
        dead_code_signals: {
          unused_exports: ["foo"],
          unreachable: false,
          zero_references: true,
          confidence: 0.99,
        },
      },
      {
        path: ".github/workflows/ci.yml",
        size_bytes: 50,
        lines: 5,
        language: "yaml",
        last_modified: iso,
        git_history: {
          first_commit: iso,
          last_commit: iso,
          commit_count: 1,
          authors: ["x"],
        },
        dependency_graph: {
          imports: [],
          imported_by: [],
          entry_point_distance: 1,
          is_entry_point: false,
          is_test: false,
          is_config: true,
        },
        dead_code_signals: {
          unused_exports: [],
          unreachable: false,
          zero_references: false,
          confidence: 0.1,
        },
      },
    ],
    folder_summary: [],
    effected_systems: [],
    constraints: {
      exclusion_patterns_applied: [],
      languages_detected: ["typescript"],
      frameworks_detected: [],
      package_managers: ["pnpm"],
      monorepo: true,
    },
  };
}

function makeResearcherHandoff() {
  return {
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
}

describe("runPlanner", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "planner-test-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns an absolute .html path and writes a self-contained plan to disk", async () => {
    const reviewerHandoff = makeReviewerHandoff();
    const researcherHandoff = makeResearcherHandoff();

    const out = await runPlanner({
      reviewerHandoff,
      researcherHandoff,
      cwd: tmp,
    });

    expect(typeof out).toBe("string");
    expect(out.endsWith(".html")).toBe(true);

    // File exists on disk
    const st = await stat(out);
    expect(st.isFile()).toBe(true);

    const html = await readFile(out, "utf8");

    // Self-contained HTML markers
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("src/dead.ts");

    // Export / manifest UI present
    expect(html).toMatch(/PRUNE_MANIFEST|EXPORT PLAN/);

    // Protected file is grouped as "Protected" (never a delete-default state)
    expect(html).toContain(".github/workflows/ci.yml");
    expect(html).toContain('data-group="Protected"');

    // The auto-prune candidate should be pre-checked for deletion
    expect(html).toContain('data-group="Auto-prune"');
    expect(html).toContain("checked");
  });

  it("returns a deterministic filename derived from target_path", async () => {
    const reviewerHandoff = makeReviewerHandoff();
    const researcherHandoff = makeResearcherHandoff();
    const result = await runPlanner({
      reviewerHandoff,
      researcherHandoff,
      cwd: tmp,
    });
    expect(result).toContain("surgical-pruning-");
    expect(result).toContain("demo.html");
  });

  it("persists a PruneManifest side artifact to .prune/PRUNE_MANIFEST.json", async () => {
    const reviewerHandoff = makeReviewerHandoff();
    const researcherHandoff = makeResearcherHandoff();

    await runPlanner({ reviewerHandoff, researcherHandoff, cwd: tmp });

    const manifestPath = join(tmp, ".prune", "PRUNE_MANIFEST.json");
    const st = await stat(manifestPath);
    expect(st.isFile()).toBe(true);

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    // Schema-shape checks (mirrors the browser buildManifest output).
    expect(manifest).toHaveProperty("selected_files");
    expect(manifest).toHaveProperty("protected_skipped");
    expect(manifest).toHaveProperty("safety.dry_run");
    expect(manifest.target_path).toBe("/tmp/demo");

    // Auto-prune candidate is selected for deletion; protected file is skipped.
    const deadEntry = manifest.selected_files.find(
      (f: any) => f.path === "src/dead.ts",
    );
    expect(deadEntry?.action).toBe("delete");
    expect(manifest.protected_skipped).toContain(".github/workflows/ci.yml");
    expect(manifest.safety.dry_run).toBe(true);
  });

  it("renders the three diagram modes + self-contained, themed plan (Phase 1)", async () => {
    const reviewerHandoff = makeReviewerHandoff();
    const researcherHandoff = makeResearcherHandoff();
    const out = await runPlanner({
      reviewerHandoff,
      researcherHandoff,
      cwd: tmp,
    });
    const html = await readFile(out, "utf8");

    // No external (CDN) scripts — must be fully self-contained / offline.
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/);

    // Three diagram panes present.
    expect(html).toContain('data-diagpane="tree"');
    expect(html).toContain('data-diagpane="mermaid"');
    expect(html).toContain('data-diagpane="circle"');
    // SVGs actually produced (radial + flow + pack each emit an <svg>).
    const svgCount = (html.match(/<svg/g) || []).length;
    expect(svgCount).toBeGreaterThanOrEqual(3);

    // Theme toggle + ARIA tab semantics + postMessage PRUNE handoff.
    expect(html).toContain('id="themeBtn"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('PRUNE_TRIGGER');
    expect(html).toContain('localStorage.setItem("sp-theme"');

    // Also persisted into .prune/ (spec deviation: plan lives beside artifacts).
    const pruneHtml = join(tmp, ".prune", basename(out));
    expect((await stat(pruneHtml)).isFile()).toBe(true);
  });
});
