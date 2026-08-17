import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDirectory } from "../src/index.js";
import { FileInventoryItem, PruneManifest } from "../src/schemas.js";

describe("core/schemas", () => {
  it("accepts a valid PruneManifest", () => {
    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: "/tmp/x",
      git_commit: "abc1234",
      selected_files: [
        { path: "a.ts", action: "delete", confidence: 0.98, reason: "unused" },
      ],
      protected_skipped: [],
      estimated_reclamation: { bytes: 10, files: 1, ci_seconds: 0 },
      safety: {
        dry_run: true,
        stash_created: true,
        rollback_script: "/tmp/r.sh",
      },
    };
    expect(PruneManifest.safeParse(manifest).success).toBe(true);
  });

  it("rejects a manifest with confidence out of range", () => {
    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: "/tmp/x",
      git_commit: "abc1234",
      selected_files: [
        { path: "a.ts", action: "delete", confidence: 5, reason: "unused" },
      ],
      protected_skipped: [],
      estimated_reclamation: { bytes: 0, files: 0, ci_seconds: 0 },
      safety: { dry_run: true, stash_created: true, rollback_script: "/t" },
    };
    expect(PruneManifest.safeParse(manifest).success).toBe(false);
  });
});

describe("core/scanDirectory", () => {
  const dir = mkdtempSync(join(tmpdir(), "sp-core-"));
  writeFileSync(join(dir, "sample.ts"), "export const foo = 1;\n");
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "sub", "bar.ts"), "export const bar = 2;\n");

  it("inventories files and conforms to FileInventoryItem schema", async () => {
    const { files } = await scanDirectory({
      cwd: dir,
      targetPath: dir,
      exclusionPatterns: [],
    });
    expect(files.length).toBe(2);
    const sample = files.find((f) => f.path.endsWith("sample.ts"));
    expect(sample).toBeTruthy();
    expect(FileInventoryItem.safeParse(sample).success).toBe(true);
    expect(sample!.language).toBe("typescript");
  });

  it("cleanup removes the temp dir", () => {
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);
  });
});
