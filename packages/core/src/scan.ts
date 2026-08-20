import { readFile, stat } from "node:fs/promises";
import { relative, resolve, extname, basename } from "node:path";
import fg from "fast-glob";
const { glob } = fg;
import type { FileInventoryItem, FolderSummary } from "./schemas.js";
import { getFileGitHistory } from "./git.js";
import { PROTECTED_PATHS, SCAN_WALK_SKIP } from "./schemas.js";

export interface ScanOptions {
  cwd: string;
  targetPath: string;
  /** Directory trees to skip walking into (heavy/generated deps). */
  walkSkip?: readonly string[];
  /** Deletion-guard path patterns; matched files are still scanned & tagged. */
  protectedPatterns?: readonly string[];
}

export interface DependencyGraphPartial {
  imports: string[];
  imported_by: string[];
  entry_point_distance: number;
  is_entry_point: boolean;
  is_test: boolean;
  is_config: boolean;
}

export async function scanDirectory(options: ScanOptions): Promise<{
  files: FileInventoryItem[];
  folders: FolderSummary[];
}> {
  const {
    cwd,
    targetPath,
    walkSkip = SCAN_WALK_SKIP,
    protectedPatterns = PROTECTED_PATHS,
  } = options;
  const absTarget = resolve(cwd, targetPath);

  const pattern = "**/*";
  const rawFiles = await glob(pattern, {
    cwd: absTarget,
    absolute: true,
    ignore: [...walkSkip, "**/node_modules/**", "**/.git/**"],
    onlyFiles: true,
    dot: true,
  });

  // ROOT-CAUSE FIX (2026-08-19, refined 2026-08-20): SCAN_WALK_SKIP entries
  // (node_modules, dist, .next, ...) must be excluded from the *walk* so a
  // multi-minute spin on huge dep trees is avoided. PROTECTED_PATHS (config/
  // test/entry/secrets) are intentionally NOT excluded from the walk — those
  // files are still scanned and tagged `is_protected: true` so the planner can
  // surface them as "Protected". The executor/verifier deletion guards remain
  // the single source of truth for what may never be deleted.
  const WALK_SKIP_SEGMENTS = new Set<string>(walkSkip);
  const allFiles = rawFiles.filter(
    (f) => !f.split(/[\\/]/).some((seg) => WALK_SKIP_SEGMENTS.has(seg)),
  );

  const files: FileInventoryItem[] = [];
  const folderMap = new Map<string, FolderSummary>();

  for (const file of allFiles) {
    try {
      const item = await analyzeFile(file, cwd, absTarget);
      if (isProtectedFile(item.path, [...protectedPatterns])) {
        item.is_protected = true;
      }
      files.push(item);

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
      if (item.is_protected) folder.protected_files++;
    } catch (err) {
      console.warn(`Failed to analyze ${file}:`, err);
    }
  }

  // Second pass: populate imported_by from the collected imports.
  buildImportedBy(files);

  // Third pass: mark unreachable files. A file is unreachable when it is not
  // an entry point, not a test, not a config, and nothing imports it
  // (imported_by is empty). Entry points / tests / configs are always
  // considered reachable even if nothing references them directly.
  for (const f of files) {
    const dg = f.dependency_graph;
    const isReachableAnchor =
      dg.is_entry_point || dg.is_test || dg.is_config;
    if (!isReachableAnchor && dg.imported_by.length === 0) {
      f.dead_code_signals.unreachable = true;
    }
  }

  return { files, folders: Array.from(folderMap.values()) };
}

async function analyzeFile(
  filePath: string,
  cwd: string,
  targetRoot: string,
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
    is_protected: false,
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

async function analyzeDependencies(
  filePath: string,
  content: string,
  language: string,
  cwd: string,
  targetRoot: string,
): Promise<DependencyGraphPartial> {
  const imports: string[] = [];
  const relPath = relative(targetRoot, filePath);

  if (["typescript", "javascript"].includes(language)) {
    const importRegex = /^\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    let requireMatch: RegExpExecArray | null;
    while ((requireMatch = requireRegex.exec(content)) !== null) {
      if (requireMatch[1]) imports.push(requireMatch[1]);
    }
  } else if (language === "python") {
    const importRegex = /^(\s*(?:from\s+(\S+)\s+)?import\s+)/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[2]) imports.push(match[2].trim());
    }
    void match;
  } else if (language === "rust") {
    const useRegex = /^\s*use\s+([^;]+);/gm;
    let match: RegExpExecArray | null;
    while ((match = useRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1].trim());
    }
  } else if (language === "go") {
    const importRegex = /^(\s*import\s+(?:\([^)]+\)|"([^"]+)"))/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[2]) imports.push(match[2]);
    }
  }

  const internalImports = imports.filter(
    (i) => i.startsWith(".") || i.startsWith("/"),
  );
  const externalImports = imports.filter(
    (i) => !i.startsWith(".") && !i.startsWith("/"),
  );

  const isEntryPoint = isEntryPointFile(filePath, language);
  const isTest = isTestFile(filePath, language);
  const isConfig = isConfigFile(filePath, language);

  const entryPointDistance = isEntryPoint
    ? 0
    : estimateEntryPointDistance(relPath, cwd);

  return {
    imports: [
      ...internalImports.map((i) => `internal:${i}`),
      ...externalImports.map((i) => `external:${i}`),
    ],
    imported_by: [], // populated in buildImportedBy second pass
    entry_point_distance: entryPointDistance,
    is_entry_point: isEntryPoint,
    is_test: isTest,
    is_config: isConfig,
  };
}

/**
 * Second-pass reverse-import map. For every file, any file whose `imports`
 * (internal relative specifier, resolved against the target root) points at it
 * is recorded in its `imported_by`. Resolves relative specifiers "./x", "../y"
 * and extensionless/bare module names by basename match.
 */
function buildImportedBy(files: FileInventoryItem[]): void {
  const byResolved = new Map<string, FileInventoryItem>();
  for (const f of files) {
    byResolved.set(normalizeModuleName(f.path), f);
  }

  for (const f of files) {
    const dir = f.path.includes("/")
      ? f.path.slice(0, f.path.lastIndexOf("/"))
      : "";
    for (const raw of f.dependency_graph.imports) {
      if (!raw.startsWith("internal:")) continue;
      const spec = raw.slice("internal:".length);
      const resolved = resolveImportSpec(spec, dir);
      const target = byResolved.get(resolved);
      if (
        target &&
        target.path !== f.path &&
        target.path !== f.path + "/index"
      ) {
        if (!target.dependency_graph.imported_by.includes(f.path)) {
          target.dependency_graph.imported_by.push(f.path);
        }
      }
    }
  }
}

function normalizeModuleName(p: string): string {
  return p.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i, "");
}

function resolveImportSpec(spec: string, fromDir: string): string {
  const cleaned = spec.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i, "");
  if (cleaned.startsWith(".")) {
    const parts = (fromDir ? fromDir.split("/") : []).concat(
      cleaned.split("/"),
    );
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    return stack.join("/");
  }
  return cleaned; // bare/external — matched by basename only
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
  const depth = relPath.split("/").filter(Boolean).length;
  return Math.min(depth, 10);
}

export async function detectDeadCodeSignals(
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
    const exportRegex =
      /^\s*export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    const exports: string[] = [];
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }

    // Real signal: a non-test/non-config export is "unused" only if nothing
    // imports it (imported_by is empty AND it is not an entry point).
    const referenced = dependencyGraph.imported_by.length > 0;
    if (!referenced && !dependencyGraph.is_entry_point) {
      for (const exp of exports) unusedExports.push(exp);
    }

    if (unusedExports.length > 0) confidence += 0.4;
    if (referenced) confidence -= 0.3;
    if (dependencyGraph.is_test) confidence -= 0.2;
    if (dependencyGraph.is_config) confidence -= 0.3;
    if (dependencyGraph.is_entry_point) confidence -= 0.5;
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    unused_exports: unusedExports,
    unreachable: false,
    zero_references: dependencyGraph.imported_by.length === 0,
    confidence,
  };
}

export function isProtectedFile(
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
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexPattern}$`).test(path);
}
