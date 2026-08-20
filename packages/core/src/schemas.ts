import { z } from "zod";

// ============================================================================
// COMMON TYPES
// ============================================================================

export const ISO8601 = z.string().datetime();

export const FilePath = z.string().min(1);

export const ConfidenceScore = z.number().min(0).max(1);

export type ConfidenceScore = z.infer<typeof ConfidenceScore>;

export const GitCommit = z.string().regex(/^[a-f0-9]{7,40}$/);

// ============================================================================
// AGENT 1: PRUNE-REVIEWER — HANDOFF_REVIEWER.json
// ============================================================================

export const GitHistory = z.object({
  first_commit: ISO8601,
  last_commit: ISO8601,
  commit_count: z.number().int().nonnegative(),
  authors: z.array(z.string()),
});

export const DependencyGraph = z.object({
  imports: z.array(z.string()), // internal:./utils, external:lodash
  imported_by: z.array(z.string()), // internal:./index.ts
  entry_point_distance: z.number().int().nonnegative(),
  is_entry_point: z.boolean(),
  is_test: z.boolean(),
  is_config: z.boolean(),
});

export const DeadCodeSignals = z.object({
  unused_exports: z.array(z.string()),
  unreachable: z.boolean(),
  zero_references: z.boolean(),
  confidence: ConfidenceScore,
});

export const FileInventoryItem = z.object({
  path: FilePath,
  size_bytes: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
  language: z.string(),
  last_modified: ISO8601,
  git_history: GitHistory,
  dependency_graph: DependencyGraph,
  dead_code_signals: DeadCodeSignals,
  // True when the path matches PROTECTED_PATHS. Such files are still SCANNED
  // (unlike SCAN_WALK_SKIP trees) so they appear in the inventory and can be
  // grouped as "Protected" by the planner, but the executor must never delete
  // them.
  is_protected: z.boolean().default(false),
});

export const FolderSummary = z.object({
  path: FilePath,
  file_count: z.number().int().nonnegative(),
  total_bytes: z.number().int().nonnegative(),
  languages: z.record(z.string(), z.number().int().nonnegative()),
  oldest_doc: ISO8601,
  newest_doc: ISO8601,
  dead_code_candidates: z.number().int().nonnegative(),
  protected_files: z.number().int().nonnegative(),
});

export const EffectedSystem = z.object({
  name: z.string(),
  impact: z.record(z.string(), z.number()),
});

export const Constraints = z.object({
  exclusion_patterns_applied: z.array(z.string()),
  languages_detected: z.array(z.string()),
  frameworks_detected: z.array(z.string()),
  package_managers: z.array(z.string()),
  monorepo: z.boolean(),
});

export const ReviewerMetadata = z.object({
  target_path: FilePath,
  scan_timestamp: ISO8601,
  scan_duration_ms: z.number().int().nonnegative(),
  git_root: FilePath,
  git_branch: z.string(),
  git_commit: GitCommit,
});

export const HandoffReviewer = z.object({
  metadata: ReviewerMetadata,
  tree_diagram: z.string(), // ASCII/mermaid representation
  file_inventory: z.array(FileInventoryItem),
  folder_summary: z.array(FolderSummary),
  effected_systems: z.array(EffectedSystem),
  constraints: Constraints,
  external_knip_issues: z.array(z.string()).optional(),
});

export type HandoffReviewer = z.infer<typeof HandoffReviewer>;
export type FileInventoryItem = z.infer<typeof FileInventoryItem>;
export type FolderSummary = z.infer<typeof FolderSummary>;
export type DeadCodeSignals = z.infer<typeof DeadCodeSignals>;
export type DependencyGraph = z.infer<typeof DependencyGraph>;
export type GitHistory = z.infer<typeof GitHistory>;

// ============================================================================
// AGENT 2: PRUNE-RESEARCHER — HANDOFF_RESEARCHER.json
// ============================================================================

export const UserPromptAnalysis = z.object({
  intent: z.enum([
    "prune",
    "cleanup",
    "dead-code-removal",
    "bundle-optimization",
  ]),
  scope: z.enum(["folder", "file", "pattern", "monorepo"]),
  aggressiveness: z.enum(["conservative", "moderate", "aggressive"]),
  constraints_from_user: z.array(z.string()),
});

export const LanguageTool = z.object({
  name: z.string(),
  version: z.string().optional(),
  confidence: ConfidenceScore,
  config_example: z.string().optional(),
  note: z.string().optional(),
});

export const LanguagePractices = z.object({
  tools: z.array(LanguageTool),
  patterns: z.array(z.string()),
  entry_point_heuristics: z.array(z.string()),
});

export const GeneralPractice = z.object({
  practice: z.string(),
  source: z.string(),
  priority: z.number().int().nonnegative(),
});

export const ToolRecommendation = z.object({
  tool: z.string(),
  install: z.string(),
  run: z.string(),
  output_schema: z.string().optional(),
  note: z.string().optional(),
});

export const FutureProofing = z.object({
  ci_integration: z.string(),
  precommit_hook: z.string(),
  dependency_budget: z.string(),
});

export const HandoffResearcher = z.object({
  user_prompt_analysis: UserPromptAnalysis,
  language_specific_practices: z.record(z.string(), LanguagePractices),
  general_practices: z.array(GeneralPractice),
  tool_recommendations: z.array(ToolRecommendation),
  future_proofing: FutureProofing,
});

export type HandoffResearcher = z.infer<typeof HandoffResearcher>;
export type UserPromptAnalysis = z.infer<typeof UserPromptAnalysis>;
export type LanguagePractices = z.infer<typeof LanguagePractices>;

// ============================================================================
// AGENT 3: PRUNING-PLANNER — PRUNE_MANIFEST.json
// ============================================================================

export const SelectedFile = z.object({
  path: FilePath,
  action: z.enum(["delete", "keep"]),
  confidence: ConfidenceScore,
  reason: z.string(),
});

export const EstimatedReclamation = z.object({
  bytes: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  ci_seconds: z.number().int().nonnegative(),
});

export const SafetyFlags = z.object({
  dry_run: z.boolean(),
  stash_created: z.boolean(),
  rollback_script: FilePath,
});

export const PruneManifest = z.object({
  timestamp: ISO8601,
  target_path: FilePath,
  git_commit: GitCommit,
  selected_files: z.array(SelectedFile),
  protected_skipped: z.array(z.string()),
  estimated_reclamation: EstimatedReclamation,
  safety: SafetyFlags,
});

export type PruneManifest = z.infer<typeof PruneManifest>;
export type SelectedFile = z.infer<typeof SelectedFile>;

// ============================================================================
// AGENTS 4A/4B: EXECUTION GUARDIANS
// ============================================================================

export const ExecutionFileResult = z.object({
  file: FilePath,
  action: z.enum(["deleted", "skipped"]),
  reason: z.string(),
  bytes: z.number().int().nonnegative(),
});

export const BuildVerification = z.object({
  command: z.string(),
  exit_code: z.number().int(),
  duration_ms: z.number().int().nonnegative(),
});

export const VerificationCheck = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string().optional(),
});

export const ExecutionReport = z.object({
  manifest_sha256: z.string().length(64),
  delete_set_sha256: z.string().length(64),
  checkpoint_stash: z.string(),
  rollback_script: FilePath,
  dry_run: z.boolean(),
  aborted: z.boolean(),
  files_processed: z.number().int().nonnegative(),
  files_deleted: z.number().int().nonnegative(),
  files_skipped: z.number().int().nonnegative(),
  skipped_reasons: z.array(z.string()),
  bytes_reclaimed: z.number().int().nonnegative(),
  build_verification: BuildVerification,
  git_commit: GitCommit,
  execution_duration_ms: z.number().int().nonnegative(),
  verification: z.object({
    passed: z.boolean(),
    checks: z.array(VerificationCheck),
  }),
});

export type ExecutionReport = z.infer<typeof ExecutionReport>;
export type ExecutionFileResult = z.infer<typeof ExecutionFileResult>;
export type BuildVerification = z.infer<typeof BuildVerification>;

// ============================================================================
// AGENT 5: DEBRIEFER — Markdown summary (no schema, template-based)
// ============================================================================

// ============================================================================
// AGENT 6: CODEBASE-AUDITOR — AUDIT_REPORT.json
// ============================================================================

export const DependencyHealth = z.object({
  orphans: z.array(z.string()),
  circular: z.array(z.string()),
  duplicates: z.array(z.string()),
});

export const ArchitecturalSmell = z.object({
  file: FilePath,
  type: z.enum(["god_module", "feature_envy", "shotgun_surgery"]),
  severity: z.enum(["low", "medium", "high"]),
  metric: z.number(),
});

export const CoverageDelta = z.object({
  lines_removed: z.number().int(),
  covered_lines_lost: z.number().int(),
  pct_change: z.number(),
});

export const BuildPerformance = z.object({
  bundle_size_kb_before: z.number().int().nonnegative(),
  bundle_size_kb_after: z.number().int().nonnegative(),
  tsc_time_ms_delta: z.number().int(),
});

export const SecurityDelta = z.object({
  vulnerabilities_removed: z.number().int().nonnegative(),
  packages_removed: z.number().int().nonnegative(),
});

export const AuditReport = z.object({
  timestamp: ISO8601,
  git_commit: GitCommit,
  dependency_health: DependencyHealth,
  architectural_smells: z.array(ArchitecturalSmell),
  coverage_delta: CoverageDelta,
  build_performance: BuildPerformance,
  security_delta: SecurityDelta,
  recommendations: z.array(z.string()), // Filled by Researcher v2
});

export type AuditReport = z.infer<typeof AuditReport>;
export type ArchitecturalSmell = z.infer<typeof ArchitecturalSmell>;

// ============================================================================
// AGENT 7: RESEARCHER v2 — SUGGESTIONS
// ============================================================================

export const Suggestion = z.object({
  id: z.string(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  category: z.string(),
  title: z.string(),
  finding: z.string(),
  action: z.string(),
  config: z.string().optional(),
  source: z.string().url(),
  effort: z.string(),
  impact: z.string(),
});

export const ResearcherV2Output = z.object({
  suggestions: z.array(Suggestion),
});

export type Suggestion = z.infer<typeof Suggestion>;
export type ResearcherV2Output = z.infer<typeof ResearcherV2Output>;

// ============================================================================
// SAFETY POLICIES (from spec)
// ============================================================================

export const PROTECTED_PATHS = [
  ".git/",
  ".github/",
  ".gitlab/",
  ".husky/",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  ".env",
  "*.pem",
  "*.key",
  "*.cert",
  "secrets/",
  ".aws/",
  ".ssh/",
  "node_modules/",
  ".venv/",
  "venv/",
  "dist/",
  "build/",
  ".next/",
  ".vercel/",
  "*config*",
  "*setup*",
  "*.config.*",
  "docker*",
  "main.*",
  "index.*",
  "app.*",
  "server.*",
  "cli.*",
  "*.test.*",
  "*.spec.*",
  "__tests__/",
  "tests/",
  "cypress/",
] as const;

export type ProtectedPaths = typeof PROTECTED_PATHS;

/**
 * SCAN_WALK_SKIP — directory trees the scanner must NOT descend into.
 * These are heavy, generated, or dependency trees that would otherwise
 * explode scan time (e.g. node_modules). They are distinct from
 * PROTECTED_PATHS: protected *files* (config/test/entry) are still SCANNED
 * and tagged `is_protected: true` so the planner can group them as
 * "Protected" and the executor can refuse to delete them. Only these
 * directory trees are excluded from the walk entirely.
 */
export const SCAN_WALK_SKIP = [
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".vercel",
  ".turbo",
  "build",
  ".husky",
  ".github",
] as const;

export type ScanWalkSkip = typeof SCAN_WALK_SKIP;

export const CONFIDENCE_THRESHOLDS = {
  AUTO_PRUNE: 0.95,
  REVIEW_REQUIRED: 0.7,
  MANUAL_ONLY: 0.7,
} as const;

export type ConfidenceThresholds = typeof CONFIDENCE_THRESHOLDS;
