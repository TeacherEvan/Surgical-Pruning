import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runExecutor } from "../src/index.js";
import { execSync } from "node:child_process";
import {
  writeFile,
  mkdir,
  rm,
  stat,
  readFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmp: string;

async function makeTempGitRepo(): Promise<string> {
  const dir = join(tmpdir(), `sp-exec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email t@t.com", { cwd: dir });
  execSync("git config user.name tester", { cwd: dir });
  return dir;
}

beforeEach(async () => {
  tmp = await makeTempGitRepo();
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("runExecutor (Agent 4A)", () => {
  it("dry-run: does NOT delete files and protects protected paths", async () => {
    await writeFile(join(tmp, "dead.ts"), "export const x = 1;", "utf-8");
    await writeFile(join(tmp, "package-lock.json"), "{}", "utf-8");
    execSync("git add -A && git commit -qm init", { cwd: tmp });

    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: tmp,
      git_commit: execSync("git rev-parse --short HEAD", { cwd: tmp })
        .toString()
        .trim(),
      selected_files: [
        { path: "dead.ts", action: "delete", confidence: 0.99, reason: "unused export" },
        { path: "package-lock.json", action: "delete", confidence: 0.5, reason: "should be protected" },
      ],
      protected_skipped: [],
      estimated_reclamation: { bytes: 0, files: 0, ci_seconds: 0 },
      safety: { dry_run: true, stash_created: false, rollback_script: "" },
    };
    const manifestPath = join(tmp, "prune-manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

    const report = await runExecutor({ manifestPath, cwd: tmp });

    expect(report.files_processed).toBe(2);
    expect(report.files_deleted).toBe(0); // dry run
    expect(report.skipped_reasons.some((r) => /protected/i.test(r))).toBe(true);
    // dead.ts must still exist on disk (dry run)
    await expect(stat(join(tmp, "dead.ts"))).resolves.toBeDefined();
    expect(report.dry_run).toBe(true);
    expect(typeof report.verification.passed).toBe("boolean");

    const execReport = JSON.parse(
      await readFile(join(tmp, ".prune", "execution-report.json"), "utf-8"),
    );
    expect(execReport).toBeDefined();
  });

  it("non-dry-run: deletes only dead.ts and commits", async () => {
    await writeFile(join(tmp, "dead.ts"), "export const x = 1;", "utf-8");
    execSync("git add -A && git commit -qm init", { cwd: tmp });
    const beforeCount = Number(
      execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim(),
    );

    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: tmp,
      git_commit: execSync("git rev-parse --short HEAD", { cwd: tmp })
        .toString()
        .trim(),
      selected_files: [
        { path: "dead.ts", action: "delete", confidence: 0.99, reason: "unused" },
      ],
      protected_skipped: [],
      estimated_reclamation: { bytes: 0, files: 0, ci_seconds: 0 },
      safety: { dry_run: false, stash_created: false, rollback_script: "" },
    };
    const manifestPath = join(tmp, "prune-manifest.json"); // path is just a filename, content is manifest
    await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

    const report = await runExecutor({ manifestPath, cwd: tmp });

    await expect(stat(join(tmp, "dead.ts"))).rejects.toThrow();
    expect(report.files_deleted).toBe(1);
    const afterCount = Number(
      execSync("git rev-list --count HEAD", { cwd: tmp }).toString().trim(),
    );
    expect(afterCount).toBe(beforeCount + 1);
  });

  it("non-dry-run with git_commit mismatch: aborts (0 deletions, passed=false)", async () => {
    await writeFile(join(tmp, "dead.ts"), "export const x = 1;", "utf-8");
    execSync("git add -A && git commit -qm init", { cwd: tmp });

    const manifest = {
      timestamp: new Date().toISOString(),
      target_path: tmp,
      git_commit: "deadbeef", // deliberately wrong vs HEAD
      selected_files: [
        { path: "dead.ts", action: "delete", confidence: 0.99, reason: "unused" },
      ],
      protected_skipped: [],
      estimated_reclamation: { bytes: 0, files: 0, ci_seconds: 0 },
      safety: { dry_run: false, stash_created: false, rollback_script: "" },
    };
    const manifestPath = join(tmp, "prune-manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

    const report = await runExecutor({ manifestPath, cwd: tmp });

    expect(report.files_deleted).toBe(0); // aborted
    expect(report.verification.passed).toBe(false);
    expect(
      report.skipped_reasons.some((r) => /commit mismatch/i.test(r)),
    ).toBe(true);
    // dead.ts must still exist (abort means no deletion)
    await expect(stat(join(tmp, "dead.ts"))).resolves.toBeDefined();
  });
});
