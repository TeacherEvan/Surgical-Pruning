import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDirectory } from "../src/index.js";
import { FileInventoryItem, PruneManifest, isProtectedPath } from "../src/schemas.js";

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
  // A protected-style file: must be SCANNED (present in inventory) and tagged
  // is_protected, NOT excluded from the walk.
  writeFileSync(
    join(dir, "config.json"),
    '{ "foo": "bar" }\n',
  );

  it("inventories files and conforms to FileInventoryItem schema", async () => {
    const { files } = await scanDirectory({
      cwd: dir,
      targetPath: dir,
      walkSkip: [],
    });
    expect(files.length).toBe(3);
    const sample = files.find((f) => f.path.endsWith("sample.ts"));
    expect(sample).toBeTruthy();
    expect(FileInventoryItem.safeParse(sample).success).toBe(true);
    expect(sample!.language).toBe("typescript");
  });

  it("scans PROTECTED_PATHS files (does NOT skip them) and tags is_protected", async () => {
    const { files } = await scanDirectory({
      cwd: dir,
      targetPath: dir,
      walkSkip: [],
    });
    const cfg = files.find((f) => f.path.endsWith("config.json"));
    expect(cfg).toBeTruthy();
    expect(cfg!.is_protected).toBe(true);
  });

  it("cleanup removes the temp dir", () => {
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);
  });
});

describe("core/isProtectedPath (deletion safety boundary)", () => {
  // Regression for C1/H3: directory-prefix PROTECTED_PATHS must block NESTED
  // files, not just exact directory names. Before the fix the executor/scan
  // used an anchored regex that let these through.
  it("blocks files nested under directory-prefix protected paths", () => {
    expect(isProtectedPath("secrets/creds.json")).toBe(true);
    expect(isProtectedPath("tests/unit/foo.ts")).toBe(true);
    expect(isProtectedPath(".ssh/id_rsa")).toBe(true);
    expect(isProtectedPath("src/.venv/lib/x.py")).toBe(true);
    expect(isProtectedPath("__tests__/a.ts")).toBe(true);
  });

  // Regression for H2: secret-extension files with suffixes must be protected,
  // matching .gitignore's `.env.*` coverage.
  it("blocks .env.* secret-suffix files", () => {
    expect(isProtectedPath(".env")).toBe(true);
    expect(isProtectedPath(".env.local")).toBe(true);
    expect(isProtectedPath(".env.production")).toBe(true);
    expect(isProtectedPath(".env.secret")).toBe(true);
  });

  it("blocks known exact/glob protected patterns", () => {
    expect(isProtectedPath("key.pem")).toBe(true);
    expect(isProtectedPath("src/app.ts")).toBe(true);
    expect(isProtectedPath("node_modules/left-pad/index.js")).toBe(true);
  });

  it("does NOT block ordinary source files", () => {
    expect(isProtectedPath("src/component.tsx")).toBe(false);
    expect(isProtectedPath("lib/orphan.ts")).toBe(false);
  });
});
