import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runCLI } from "../src/index.js";

describe("cli/runCLI (full 7-agent pipeline)", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sp-cli-"));
    writeFileSync(join(dir, "mod.ts"), "export const x = 1;\n");
    writeFileSync(
      join(dir, "dead-export.ts"),
      "export const unused = 42;\n",
    );
    execSync(
      "git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init",
      { cwd: dir },
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs the full pipeline without throwing and produces agent artifacts", async () => {
    await expect(
      runCLI({
        targetPath: ".",
        userPrompt: "cleanup dead code",
        dryRun: true,
        cwd: dir,
      }),
    ).resolves.toBeUndefined();

    // Reviewer (Agent 1) ran and wrote its handoff.
    expect(existsSync(join(dir, ".prune", "handoff-reviewer.json"))).toBe(
      true,
    );
    // Researcher (Agent 2) ran and wrote its handoff.
    expect(existsSync(join(dir, ".prune", "handoff-researcher.json"))).toBe(
      true,
    );
    // Planner (Agent 3) generated an HTML file (written to cwd, not .prune).
    const cwdEntries = readdirSync(dir);
    expect(cwdEntries.some((f: string) => f.endsWith(".html"))).toBe(true);
    // Auditor (Agent 6) writes an audit report (runs after reviewer handoff).
    expect(existsSync(join(dir, ".prune", "audit-report.json"))).toBe(true);
    // Researcher v2 (Agent 7) writes suggestions (runs after audit + researcher handoff).
    expect(existsSync(join(dir, ".prune", "suggestions.json"))).toBe(true);
  });
});
