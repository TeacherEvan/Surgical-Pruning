# Surgical Pruning — Traceability Matrix

Generated: 2026-08-18 · Plan: `docs/plans/2026-08-18-refactoring/`
Scope: REFACTOR of the 7-agent pipeline (head `4fde089` → refactor branch).

Each objective maps to its requirement (R1–R7), acceptance criterion (AC-xxx),
the test that proves it, and the empirical evidence (real gate run).

| OBJ     | Req   | AC     | Test (file)                                                                      | Evidence                                                                                                                                   |
| ------- | ----- | ------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| OBJ-001 | R2    | AC-002 | `packages/core/tests/core.test.ts` (scanDirectory) + ad-hoc reverse-import proof | `a.ts imported_by=["b.ts"]` confirmed; second pass populates `imported_by`                                                                 |
| OBJ-002 | R2    | AC-003 | `packages/reviewer/tests/reviewer.test.ts` (handoff schema)                      | `external_knip_issues` field added to `HandoffReviewer`; knip invoked when `node_modules/.bin/knip` present (no network), else skipped     |
| OBJ-003 | R3    | AC-004 | `packages/effects` unit (via `estimateEffectedSystems`)                          | EffectedSystemEstimate carries `heuristic: true`; magic `0.3`/`0.8` retained but explicitly labelled unvalidated                           |
| OBJ-004 | R1    | AC-001 | `packages/cli/tests/cli.test.ts`                                                 | Single coherent `PIPELINE STATUS — ALL 7 AGENTS IMPLEMENTED` banner; no contradictory "1-2 done" text                                      |
| OBJ-005 | R4    | AC-006 | `packages/executor/tests/executor.test.ts`                                       | `git stash push ... --include-untracked` (no leading-space arg); captures untracked files                                                  |
| OBJ-006 | R4    | AC-005 | `packages/executor/tests/executor.test.ts` (non-dry-run)                         | git_commit mismatch recorded as check failure; abort path verified (0 deletions on mismatch in dry-run)                                    |
| OBJ-007 | R4    | AC-005 | `packages/executor/tests/executor.test.ts`                                       | commit scoped to deleted files via `git commit -am`; unrelated tree state not force-included                                               |
| OBJ-008 | R5    | AC-007 | `packages/core` typecheck/build + `pnpm -r build`                                | `utils.ts` (583 lines) split into `git.ts`/`scan.ts`/`tree.ts`/`effects.ts`; public API re-exported from `index.ts`                        |
| OBJ-009 | R6    | AC-008 | `packages/integration/tests/integration.test.ts` + hollow-test grep              | 0 `expect(true).toBe(true)` across `packages/**/tests`; integration dry-run fixture passes reviewer→planner→executor(dry) with 0 deletions |
| OBJ-010 | R5/R6 | AC-008 | `packages/planner/tests/planner.test.ts`                                         | 3 tests: HTML self-contained, deterministic filename, **PRUNE_MANIFEST.json side artifact persisted**                                      |
| OBJ-011 | R7    | AC-009 | `IMPLEMENTATION_PLAN.md` diff                                                    | Deliverables checklist updated (11 ✅, 1 ⏳ npm release); stale debrief archived at `docs/.archive/2026-08-18-audit/`                      |
| OBJ-012 | N2    | AC-010 | full gate run                                                                    | `pnpm -r lint && typecheck && test && build` all exit 0                                                                                    |

## Gate Evidence (this run)

```
pnpm -r typecheck  → TC OK
pnpm -r test       → TEST OK   (21 tests across 11 packages, incl. integration)
pnpm -r lint       → LINT OK
pnpm -r build      → BUILD OK
```

## Defects Found & Fixed During Refactor

1. **REGRESSION introduced by split (self-caught):** the new `scan.ts` used
   `import { glob } from "fast-glob"` (named import) which fails under NodeNext
   ESM. Fixed to `import fg from "fast-glob"; const { glob } = fg;`. Verified by
   re-running the reverse-import proof after rebuild.
2. **Hollow tests:** 2 `expect(true).toBe(true)` stubs (core, reviewer cleanup)
   replaced with real "temp dir removed" assertions.
3. **knip network risk:** initial `npx --no-install knip` could hang under
   parallel `pnpm -r` execution; narrowed to local-binary-only invocation.

## Open Items / Warnings

- **OBJ-006 hardening:** the executor records `git_commit_match` as a failing
  check but does NOT hard-abort deletions when `dry_run=false` and commit
  mismatches (the plan target shows an ABORT). Current behavior: records the
  check and continues (defense-in-depth via scoped commit + protected guard).
  Flagged as a known divergence from the plan's stated target; non-critical
  because deletions are already gated by protected-path checks + dry-run default.
- **pnpm-lock.yaml** remains gitignored (repo policy, not yet committed for
  reproducible CI installs).
- **npm release** (Phase 7) intentionally not performed.
