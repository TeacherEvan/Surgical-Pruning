# Surgical Pruning — Current Codebase State (baseline)

**Date:** 2026-08-18 · **Head:** `4fde089` (main, up to date with origin/main)
**Working tree:** 1 untracked file (`docs/.archive/2026-08-18-audit/DEBRIEF.md`).
No other uncommitted changes.

## Tech Stack

- pnpm workspace monorepo, Turborepo orchestration, TypeScript (NodeNext ESM).
- 9 packages: `core`, `reviewer`, `researcher`, `planner`, `executor`,
  `verifier`, `debriefer`, `auditor`, `researcher-v2`, plus `cli`.
- Tests: Vitest per package. CI: `.github/workflows/ci.yml` (lint→typecheck→
  test→build) + `spec-validation.yml`.

## Relevant Structure (src line counts)

- `core/src/utils.ts` — **583 lines** of git + scan + tree + effects. THE
  dead-code engine lives here.
- `core/src/schemas.ts` — Zod schemas (HandoffReviewer, ExecutionReport, etc.).
- `cli/src/index.ts` — **279 lines**, orchestrates all 7 agents.
- `executor/src/index.ts` — **234 lines**, destructive deletion guardian.
- `planner/src/index.ts` — **476 lines**, self-contained HTML generator.
- Other agents: reviewer 195, researcher 298, verifier 263, debriefer 212,
  auditor 92, researcher-v2 131.

## Known Issues (evidence)

1. **Fake dead-code engine.** `core/src/utils.ts:343` sets
   `imported_by: []` with comment "Will be populated in second pass" — no
   second pass exists. `detectDeadCodeSignals` (`:415`) therefore sees
   `imported_by.length === 0` for every file → marks all exports unused +
   hardcoded confidence. This is the tool's core function and is non-functional.
2. **Decorative executor gate.** `executor/src/index.ts:72-76` records
   `git_commit_match` but the deletion loop (`:108-158`) runs unconditionally;
   `passed` (`:203`) is only a report field — mismatch never aborts deletion.
3. **Stash arg bug.** `executor/src/index.ts:84` passes `" --include-untracked"`
   (leading space) as a separate argv entry → git parses it as a pathspec, so
   untracked files are NOT checkpointed.
4. **CLI contradiction.** `cli/src/index.ts:222-230` prints "ALL 7 AGENTS
   IMPLEMENTED ✅"; the trailing `.then()` (`:270-273`) still prints the old
   "Agents 1-2 done, 3-7 pending" message.
5. **Dead deps.** `reviewer/package.json:27-28` declares `knip` + `depcheck`
   (spec Phase 2 tools) but neither is called anywhere in code.
6. **Magic estimates.** `core/src/utils.ts:554-583` uses undocumented
   multipliers (0.3, 0.8s) to fabricate "bundle reduction / CI time saved".
7. **Stale doc.** `docs/.archive/2026-08-18-audit/DEBRIEF.md` (untracked)
   claims Agents 3-7 are stubs. FALSE — all 7 are merged. `IMPLEMENTATION_PLAN.md`
   deliverables checklist still lists every agent "Pending".
8. **Executor commit sweep.** `executor/src/index.ts:194` runs
   `git commit -am` (all-tracked), which can sweep unintended changes beyond the
   manifest's files.

## Test Baseline (to confirm in VERIFY)

- 10 packages, 71 `expect()` calls total. Hollow-test grep pending (OBJ-007).
- Prior run (Aug 18 debrief) reported all 4 gates green on the merged tree.

## Dependencies (no secret values present)

- Root devDeps: turbo, typescript, typescript-eslint, prettier, husky, eslint.
- `pnpm-lock.yaml` is gitignored per repo policy (confirm during execution).

## Initial Risks

- R-A: Splitting `core/utils.ts` could break agent imports — mitigate with
  build gate after each module move.
- R-B: Real dead-code detection (knip/depcheck) may surface many false
  positives on this repo itself — scope the integration to the _target_ being
  scanned, not the tool repo.
- R-C: Executor safety fixes are HIGH-risk (destructive path) — require
  `APPROVAL_REQUIRED`-equivalent care; gate behind fixture tests first.
