# Surgical Pruning — Agent API

All seven agents are exported as functions from their respective packages.
Each agent runs independently and returns a typed handoff consumed by the next.

## Package map

| Package | Agent | Entry function |
| --- | --- | --- |
| `@surgical-pruning/core` | shared types, schemas, scanners | `scanDirectory`, `buildImportedBy`, `estimateEffectedSystems`, `generateTreeDiagram` |
| `@surgical-pruning/reviewer` | PRUNE-REVIEWER (Agent 1) | `runReviewer({ targetPath, userPrompt, cwd? })` |
| `@surgical-pruning/researcher` | PRUNE-RESEARCHER (Agent 2) | `runResearcher({ reviewerHandoff, userPrompt, cwd? })` |
| `@surgical-pruning/planner` | PRUNING-PLANNER (Agent 3) | `runPlanner({ reviewerHandoff, researcherHandoff, cwd? })` |
| `@surgical-pruning/executor` | GUARDIAN-EXECUTOR (Agent 4A) | `runExecutor({ manifestPath, cwd? })` |
| `@surgical-pruning/verifier` | GUARDIAN-VERIFIER (Agent 4B) | `runVerifier({ manifestPath, cwd? })` |
| `@surgical-pruning/debriefer` | DEBRIEFER (Agent 5) | `runDebriefer({ executionReport, cwd? })` |
| `@surgical-pruning/auditor` | CODEBASE-AUDITOR (Agent 6) | `runAuditor({ targetPath, cwd? })` |
| `@surgical-pruning/researcher-v2` | RESEARCHER v2 (Agent 7) | `runResearcherV2({ auditReport, cwd? })` |
| `@surgical-pruning/cli` | Unified CLI | `runCLI({ targetPath, userPrompt, dryRun, execute, cwd? })` |

## Shared types

Import from `@surgical-pruning/core`:

- `HandoffReviewer`, `HandoffResearcher` — agent output contracts.
- `ExecutionReport` — executor result (files deleted/skipped, rollback path, build verification).
- `PROTECTED_PATHS` — readonly list of paths never deleted.
- `CONFIDENCE_THRESHOLDS` — `{ AUTO_PRUNE: 0.95, REVIEW_REQUIRED: 0.7, MANUAL_ONLY: 0.7 }`.
- `PRUNE_MANIFEST` schema — the contract the planner writes and the executor consumes.

## Executor contract

```ts
interface ExecutorOptions {
  manifestPath: string;   // path to .prune/PRUNE_MANIFEST.json
  cwd?: string;           // defaults to process.cwd()
}

interface ExecutionSelectedFile {
  path: string;
  action: "delete";
  confidence: number;     // 0..1; < 0.95 requires force:true to auto-delete
  reason: string;
  force?: boolean;        // bypass the confidence gate (use with caution)
}
```

The executor will:

- skip any `path` matching `PROTECTED_PATHS`;
- skip any file with `confidence < 0.95` unless `force` is set;
- skip deletions when `manifest.git_commit !== HEAD` (non-dry runs);
- write a `rollback-<ts>.sh` into `.prune/` on every run.
