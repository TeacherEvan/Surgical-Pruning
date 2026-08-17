import { execa } from "execa";
import { relative } from "node:path";

export async function getGitRoot(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"], {
    cwd,
  });
  return stdout.trim();
}

export async function getGitBranch(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["branch", "--show-current"], { cwd });
  return stdout.trim() || "detached";
}

export async function getGitCommit(cwd: string, short = true): Promise<string> {
  const { stdout } = await execa(
    "git",
    ["rev-parse", short ? "--short" : "", "HEAD"],
    { cwd },
  );
  return stdout.trim();
}

export async function getFileGitHistory(
  filePath: string,
  cwd: string,
): Promise<{
  first_commit: string;
  last_commit: string;
  commit_count: number;
  authors: string[];
}> {
  try {
    const relPath = relative(cwd, filePath);
    const { stdout } = await execa(
      "git",
      ["log", "--pretty=format:%H|%an|%ad", "--date=iso", "--", relPath],
      { cwd },
    );
    const lines = stdout.trim().split("\n").filter(Boolean);

    if (lines.length === 0) {
      return {
        first_commit: new Date().toISOString(),
        last_commit: new Date().toISOString(),
        commit_count: 0,
        authors: [],
      };
    }

    const commits = lines.map((line) => {
      const parts = line.split("|");
      const hash = parts[0] ?? "";
      const author = parts[1] ?? "";
      const date = parts[2] ?? "";
      return {
        hash,
        author,
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
      };
    });

    const lastCommit = commits[commits.length - 1];
    const firstCommit = commits[0];

    return {
      first_commit: lastCommit?.date ?? new Date().toISOString(),
      last_commit: firstCommit?.date ?? new Date().toISOString(),
      commit_count: commits.length,
      authors: [...new Set(commits.map((c) => c.author).filter(Boolean))],
    };
  } catch {
    return {
      first_commit: new Date().toISOString(),
      last_commit: new Date().toISOString(),
      commit_count: 0,
      authors: [],
    };
  }
}
