import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runCLI } from "../src/index.js";

describe("cli/runCLI (implemented phases)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sp-cli-"));
  writeFileSync(join(dir, "mod.ts"), "export const x = 1;\n");
  execSync(
    "git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init",
    { cwd: dir },
  );

  it("runs Agents 1-2 and stops honestly at the stub boundary (no throw, real output produced)", async () => {
    await expect(
      runCLI({
        targetPath: ".",
        userPrompt: "cleanup dead code",
        dryRun: true,
        cwd: dir,
      }),
    ).resolves.toBeUndefined();

    // Reviewer (Agent 1) actually ran and wrote its handoff.
    expect(existsSync(join(dir, ".prune", "handoff-reviewer.json"))).toBe(true);
  });

  it("cleanup", () => {
    rmSync(dir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
