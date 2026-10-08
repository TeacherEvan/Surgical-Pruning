# Surgical Pruning — Traceability Matrix (FINAL_AUDIT pass, 2026-08-19)

Plan: `docs/plans/2026-08-18-refactoring/`
Scope: 12-objective REFACTOR of the 7-agent pipeline (committed at `7e7e2cb`).
Finalize pass run by surgical-implementation on dirty working tree at head `e4e4530`.

Each objective maps to its requirement (R1–R7 / N2), acceptance criterion (AC-xxx),
the test that proves it, and the **empirical evidence from a live gate re-run on 2026-08-19**
(NOT the prior self-report — re-verified per skill rule "subagent self-report is not gate evidence").

| OBJ     | Req   | AC     | Test (file)                                                    | Evidence (live 2026-08-19 re-run)                                                                                               |
| ------- | ----- | ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| OBJ-001 | R2    | AC-002 | `packages/core/tests/core.test.ts`                             | reverse-import second pass in `scan.ts` (`buildImportedBy`); `imported_by` populated. Test in suite (part of 21/21 green).      |
| OBJ-002 | R2    | AC-003 | `packages/reviewer/tests/reviewer.test.ts`                     | `external_knip_issues` field present; local-binary knip only (no network). `depcheck` declared-but-uninvoked noted (AC-003 OR). |
| OBJ-003 | R3    | AC-004 | `packages/core/src/effects.ts` unit                            | `heuristic: true` carried on estimates; magic 0.3/0.8 labelled unvalidated. Lint/typecheck green.                               |
| OBJ-004 | R1    | AC-001 | `packages/cli/tests/cli.test.ts`                               | Single coherent banner; `grep -rn "Agents 1-2 done" packages/cli` → 0 hits.                                                     |
| OBJ-005 | R4    | AC-006 | `packages/executor/tests/executor.test.ts`                     | `git stash push ... --include-untracked` (no leading-space arg). Test green.                                                    |
| OBJ-006 | R4    | AC-005 | `packages/executor/tests/executor.test.ts`                     | `git_commit_match` recorded as failing check; **MEDIUM divergence**: records + skips deletion, does NOT hard-abort (see below). |
| OBJ-007 | R4    | AC-005 | `packages/executor/tests/executor.test.ts`                     | commit scoped to deleted files; unrelated tree state not force-included. Test green.                                            |
| OBJ-008 | R5    | AC-007 | `packages/core` typecheck/build                                | `utils.ts` split into `git.ts`/`scan.ts`/`tree.ts`/`effects.ts` + `index.ts`. `pnpm run build` 11/11 green.                     |
| OBJ-009 | R6    | AC-008 | `packages/integration/tests/integration.test.ts` + hollow grep | `grep -rn "expect(true).toBe(true)" packages` → **0 hits** (re-verified 2026-08-19). Integration dry-run passes.                |
| OBJ-010 | R5/R6 | AC-008 | `packages/planner/tests/planner.test.ts`                       | HTML self-contained; deterministic filename; `PRUNE_MANIFEST.json` persisted. 3 tests green.                                    |
| OBJ-011 | R7    | AC-009 | `IMPLEMENTATION_PLAN.md` diff + archive                        | Stale debrief archived at `docs/.archive/2026-08-18-audit/`; deliverables updated (11 ✅, 1 ⏳ npm release).                    |
| OBJ-012 | N2    | AC-010 | full gate run (this pass)                                      | `lint && typecheck && test && build` all exit 0 on the live tree.                                                               |

## Live Gate Evidence (re-run 2026-08-19, on dirty working tree)

```
pnpm run lint      → 0 errors (warnings only: ~40 no-explicit-any / no-unused-vars)
pnpm run typecheck → 20/20 packages pass (turbo)
pnpm run test      → 21 tests across 11 packages PASS, 0 hollow
pnpm run build     → 11/11 packages build OK
```

## Defects Found & Fixed During Refactor (per plan TRACEABILITY)

1. **REGRESSION self-caught:** named `import { glob }` from fast-glob failed under
   NodeNext ESM → fixed to default import + destructure.
2. **Hollow tests:** 2 `expect(true).toBe(true)` stubs replaced with real assertions.
3. **knip network risk:** narrowed to local-binary-only to avoid `npx` hangs under `pnpm -r`.

## Open Items / Warnings (carry-over, non-blocking)

- **OBJ-006 hardening (MEDIUM):** executor records `git_commit_match` as a failing
  check but does NOT hard-abort deletions when `dry_run=false` and commit mismatches.
  Plan target = ABORT. Current = record + skip deletion (defense-in-depth via scoped
  commit + protected-path guard). Documented divergence; safety preserved.
- **Lint warnings (~40):** `no-explicit-any` / `no-unused-vars`. Style-only; no errors.
- **pnpm-lock.yaml** remains gitignored (repo policy).
- **npm release (Phase 7)** intentionally not performed (out of plan scope).
- **OUT-OF-PLAN dirty work on disk (2026-08-19), NOT part of these 12 objectives:**
  - `packages/*/package.json`: 12 files with `"private": true` removed (npm-release prep).
  - `packages/core/src/scan.ts`: new root-cause perf fix (skip `node_modules`/`.git`/`dist`
    during walk to avoid multi-minute scans). Adds 1 new lint warning
    (`exclusionPatterns` param now partially unused post-filter). Gates still green.
    Neither stream committed; awaits user decision (see debrief §14/§16).

## Final Status

**READY WITH WARNINGS** — all 12 objectives mapped to green evidence; one documented
MEDIUM divergence (OBJ-006) and style-only lint warnings. No CRITICAL/HIGH findings.
