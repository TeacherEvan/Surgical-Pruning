import { execa } from "execa";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "fast-glob";
import type { FileInventoryItem, FolderSummary } from "./schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

// ============================================================================
// GIT UTILITIES
// ============================================================================

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

// ============================================================================
// FILE SCANNING & ANALYSIS
// ============================================================================

export interface ScanOptions {
  cwd: string;
  targetPath: string;
  exclusionPatterns: string[];
}

export async function scanDirectory(options: ScanOptions): Promise<{
  files: FileInventoryItem[];
  folders: FolderSummary[];
}> {
  const { cwd, targetPath, exclusionPatterns } = options;
  const absTarget = resolve(cwd, targetPath);

  // Find all files
  const pattern = "**/*";
  const allFiles = await glob(pattern, {
    cwd: absTarget,
    absolute: true,
    ignore: exclusionPatterns,
    onlyFiles: true,
    dot: true,
  });

  // Process files in parallel batches
  const files: FileInventoryItem[] = [];
  const folderMap = new Map<string, FolderSummary>();

  for (const file of allFiles) {
    try {
      const item = await analyzeFile(file, cwd, absTarget, exclusionPatterns);
      files.push(item);

      // Aggregate folder summary
      const relDir = relative(absTarget, resolve(file, ".."));
      const folderKey = relDir || ".";

      if (!folderMap.has(folderKey)) {
        folderMap.set(folderKey, {
          path: folderKey,
          file_count: 0,
          total_bytes: 0,
          languages: {},
          oldest_doc: item.last_modified,
          newest_doc: item.last_modified,
          dead_code_candidates: 0,
          protected_files: 0,
        });
      }

      const folder = folderMap.get(folderKey)!;
      folder.file_count++;
      folder.total_bytes += item.size_bytes;
      folder.languages[item.language] =
        (folder.languages[item.language] || 0) + 1;

      if (item.last_modified < folder.oldest_doc)
        folder.oldest_doc = item.last_modified;
      if (item.last_modified > folder.newest_doc)
        folder.newest_doc = item.last_modified;
      if (item.dead_code_signals.confidence >= 0.7)
        folder.dead_code_candidates++;
      if (isProtectedFile(item.path, exclusionPatterns))
        folder.protected_files++;
    } catch (err) {
      console.warn(`Failed to analyze ${file}:`, err);
    }
  }

  return { files, folders: Array.from(folderMap.values()) };
}

async function analyzeFile(
  filePath: string,
  cwd: string,
  targetRoot: string,
  exclusionPatterns: string[],
): Promise<FileInventoryItem> {
  const stats = await stat(filePath);
  const relPath = relative(targetRoot, filePath);
  const language = detectLanguage(filePath);
  const content =
    language === "binary" ? "" : await readFile(filePath, "utf-8");
  const lines = content.split("\n").length;

  const gitHistory = await getFileGitHistory(filePath, cwd);
  const dependencyGraph = await analyzeDependencies(
    filePath,
    content,
    language,
    cwd,
    targetRoot,
  );
  const deadCodeSignals = await detectDeadCodeSignals(
    filePath,
    content,
    language,
    dependencyGraph,
    cwd,
  );

  return {
    path: relPath,
    size_bytes: stats.size,
    lines,
    language,
    last_modified: stats.mtime.toISOString(),
    git_history: gitHistory,
    dependency_graph: dependencyGraph,
    dead_code_signals: deadCodeSignals,
  };
}

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath).toLowerCase();

  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".clj": "clojure",
    ".hs": "haskell",
    ".ml": "ocaml",
    ".fs": "fsharp",
    ".vue": "vue",
    ".svelte": "svelte",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
    ".conf": "ini",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".fish": "fish",
    ".ps1": "powershell",
    ".dockerfile": "dockerfile",
    ".gitignore": "gitignore",
    ".env": "env",
  };

  if (name === "dockerfile" || name === "makefile") return "dockerfile";
  if (name === "license" || name === "readme") return "markdown";

  return langMap[ext] || "unknown";
}

interface DependencyGraphPartial {
  imports: string[];
  imported_by: string[];
  entry_point_distance: number;
  is_entry_point: boolean;
  is_test: boolean;
  is_config: boolean;
}

async function analyzeDependencies(
  filePath: string,
  content: string,
  language: string,
  cwd: string,
  targetRoot: string,
): Promise<DependencyGraphPartial> {
  const imports: string[] = [];
  const relPath = relative(targetRoot, filePath);

  // Simple import extraction (can be enhanced with proper parsers)
  if (["typescript", "javascript"].includes(language)) {
    const importRegex = /^\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
    // Also catch require()
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    let requireMatch: RegExpExecArray | null;
    while ((requireMatch = requireRegex.exec(content)) !== null) {
      if (requireMatch[1]) imports.push(requireMatch[1]);
    }
  } else if (language === "python") {
    const importRegex = /^\s*(?:from\s+(\S+)\s+)?import\s+/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
  } else if (language === "rust") {
    const useRegex = /^\s*use\s+([^;]+);/gm;
    let match: RegExpExecArray | null;
    while ((match = useRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1].trim());
    }
  } else if (language === "go") {
    const importRegex = /^\s*import\s+(?:\((?:[^)]+)\)|"([^"]+)")/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
  }

  // Classify imports
  const internalImports = imports.filter(
    (i) => i.startsWith(".") || i.startsWith("/"),
  );
  const externalImports = imports.filter(
    (i) => !i.startsWith(".") && !i.startsWith("/"),
  );

  // Check if entry point
  const isEntryPoint = isEntryPointFile(filePath, language);
  const isTest = isTestFile(filePath, language);
  const isConfig = isConfigFile(filePath, language);

  // Calculate entry point distance (simplified - BFS from entry points)
  const entryPointDistance = isEntryPoint
    ? 0
    : estimateEntryPointDistance(relPath, cwd);

  return {
    imports: [
      ...internalImports.map((i) => `internal:${i}`),
      ...externalImports.map((i) => `external:${i}`),
    ],
    imported_by: [], // Will be populated in second pass
    entry_point_distance: entryPointDistance,
    is_entry_point: isEntryPoint,
    is_test: isTest,
    is_config: isConfig,
  };
}

function isEntryPointFile(filePath: string, _language: string): boolean {
  const name = basename(filePath).toLowerCase();
  const entryPoints = [
    "main.",
    "index.",
    "app.",
    "server.",
    "cli.",
    "entry.",
    "bootstrap.",
    "start.",
  ];
  return entryPoints.some((ep) => name.startsWith(ep));
}

function isTestFile(filePath: string, _language: string): boolean {
  const name = basename(filePath).toLowerCase();
  const relPath = filePath.toLowerCase();
  return (
    name.includes(".test.") ||
    name.includes(".spec.") ||
    name.endsWith("_test.py") ||
    name.endsWith("_test.go") ||
    relPath.includes("/tests/") ||
    relPath.includes("/__tests__/") ||
    relPath.includes("/cypress/") ||
    relPath.includes("/spec/")
  );
}

function isConfigFile(filePath: string, _language: string): boolean {
  const name = basename(filePath).toLowerCase();
  const configPatterns = [
    "config",
    "setup",
    ".config.",
    "docker",
    "tsconfig",
    "jsconfig",
    "vite.config",
    "webpack.config",
    "rollup.config",
    "jest.config",
    "vitest.config",
    "eslint.config",
    "prettier.config",
    "tailwind.config",
    "package.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "cargo.toml",
    "go.mod",
    "pyproject.toml",
    "setup.py",
  ];
  return configPatterns.some((p) => name.includes(p));
}

function estimateEntryPointDistance(relPath: string, _cwd: string): number {
  // Simplified: count directory depth as proxy
  const depth = relPath.split("/").filter(Boolean).length;
  return Math.min(depth, 10);
}

async function detectDeadCodeSignals(
  filePath: string,
  content: string,
  language: string,
  dependencyGraph: DependencyGraphPartial,
  _cwd: string,
): Promise<{
  unused_exports: string[];
  unreachable: boolean;
  zero_references: boolean;
  confidence: number;
}> {
  const unusedExports: string[] = [];
  let confidence = 0;

  if (["typescript", "javascript"].includes(language)) {
    // Simple unused export detection (can be replaced with knip/ts-prune)
    const exportRegex =
      /^\s*export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    const exports: string[] = [];
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }

    // Check if exported names are referenced elsewhere (simplified)
    // In practice, this would use knip or proper AST analysis
    for (const exp of exports) {
      // Placeholder - real implementation would search codebase
      if (dependencyGraph.imported_by.length === 0) {
        unusedExports.push(exp);
      }
    }

    // Confidence based on signals
    if (unusedExports.length > 0) confidence += 0.4;
    if (dependencyGraph.imported_by.length === 0) confidence += 0.3;
    if (dependencyGraph.is_test) confidence -= 0.2;
    if (dependencyGraph.is_config) confidence -= 0.3;
    if (dependencyGraph.is_entry_point) confidence -= 0.5;
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    unused_exports: unusedExports,
    unreachable: false, // Would need control flow analysis
    zero_references: dependencyGraph.imported_by.length === 0,
    confidence,
  };
}

function isProtectedFile(
  filePath: string,
  exclusionPatterns: string[],
): boolean {
  const name = basename(filePath);
  const relPath = filePath;

  for (const pattern of exclusionPatterns) {
    if (matchPattern(relPath, pattern) || matchPattern(name, pattern)) {
      return true;
    }
  }
  return false;
}

function matchPattern(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexPattern}$`).test(path);
}

// ============================================================================
// TREE DIAGRAM GENERATION
// ============================================================================

export function generateTreeDiagram(
  files: FileInventoryItem[],
  _targetRoot: string,
): string {
  // Build a simple tree structure
  interface SimpleNode {
    children: Map<string, SimpleNode>;
    file?: FileInventoryItem;
  }

  const root: SimpleNode = { children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter((p): p is string => Boolean(p));
    let node: SimpleNode = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!; // non-null assertion since we filtered
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map<string, SimpleNode>() });
      }
      const nextNode = node.children.get(part);
      if (nextNode) {
        node = nextNode;
      }
      if (i === parts.length - 1) {
        node.file = file;
      }
    }
  }

  function renderNode(node: SimpleNode, prefix: string = ""): string {
    let output = "";
    for (const [name, value] of node.children) {
      const entries = Array.from(node.children.entries());
      const index = entries.findIndex(([k]) => k === name);
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? "└── " : "├── ";
      const newPrefix = prefix + (isLastEntry ? "    " : "│   ");

      if (value.file) {
        const confidence = value.file.dead_code_signals.confidence;
        const badge =
          confidence >= 0.95 ? "🟢" : confidence >= 0.7 ? "🟡" : "🔴";
        output += `${prefix}${connector}${name} ${badge} ${(value.file.size_bytes / 1024).toFixed(1)}KB\n`;
      } else {
        output += `${prefix}${connector}${name}/\n`;
        output += renderNode(value, newPrefix);
      }
    }
    return output;
  }

  return renderNode(root);
}

// ============================================================================
// EFFECTED SYSTEMS ESTIMATION
// ============================================================================

export function estimateEffectedSystems(
  files: FileInventoryItem[],
): Array<{ name: string; impact: Record<string, number> }> {
  let totalBytes = 0;
  let totalFiles = 0;
  let candidateFiles = 0;

  for (const file of files) {
    totalBytes += file.size_bytes;
    totalFiles++;
    if (file.dead_code_signals.confidence >= 0.95) {
      candidateFiles++;
    }
  }

  // Rough estimates
  const bundleReductionKb = Math.round(
    (candidateFiles / Math.max(totalFiles, 1)) * (totalBytes / 1024) * 0.3,
  );
  const ciTimeSaved = Math.round(candidateFiles * 0.8); // seconds

  return [
    {
      name: "build",
      impact: { bundle_size_reduction_est_kb: bundleReductionKb },
    },
    { name: "ci", impact: { time_saved_seconds_est: ciTimeSaved } },
    { name: "cognitive_load", impact: { files_removable: candidateFiles } },
  ];
}
