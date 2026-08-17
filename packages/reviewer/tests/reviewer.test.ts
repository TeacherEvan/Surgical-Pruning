import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runReviewer } from "../src/index.js";
import { HandoffReviewer } from "@surgical-pruning/core";

describe("reviewer/runReviewer", () => {
  const dir = mkdtempSync(join(tmpdir(), "sp-rev-"));
  writeFileSync(join(dir, "mod.ts"), "export const x = 1;\n");
  execSync(
    "git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init",
    { cwd: dir },
  );

  it("produces a valid handoff-reviewer.json", async () => {
    await runReviewer({
      targetPath: ".",
      userPrompt: "aggressive dead-code tuning",
      cwd: dir,
    });
    const out = join(dir, ".prune", "handoff-reviewer.json");
    expect(existsSync(out)).toBe(true);
    const parsed = HandoffReviewer.safeParse(
      JSON.parse(readFileSync(out, "utf-8")),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.file_inventory.length).toBeGreaterThan(0);
    }
  });

  it("cleanup removes the temp dir", () => {
    rmSync(dir, { recursive: true, force: true } as any);
    expect(existsSync(dir)).toBe(false);
  });
});
