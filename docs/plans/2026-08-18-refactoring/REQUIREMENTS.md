# Surgical Pruning — Refactoring Requirements

**Scope:** REFACTOR, not rebuild. All 7 agents are already implemented and
merged to `origin/main` (head `4fde089`). This plan fixes correctness,
safety, and maintainability defects discovered in the live tree. It does NOT
re-derive agent implementations.

**Source of truth:** live `git` tree + `IMPLEMENTATION_PLAN.md`. The prior
debrief at `docs/.archive/2026-08-18-audit/DEBRIEF.md` is STALE/WRONG and is
itself an item in this plan (OBJ-009).

## Functional Requirements

- **R1 — Honest CLI reporting.** The CLI must not print contradictory
  completion states. The "ALL 7 AGENTS IMPLEMENTED" banner (`cli/src/index.ts:222`)
  and the trailing `.then()` fallback (`:270-273`) must agree.
- **R2 — Real dead-code detection.** The reviewer's dependency graph must
  compute an actual reverse-import map (`imported_by`), and/or integrate the
  spec-mandated `knip`/`depcheck` tools (`IMPLEMENTATION_PLAN.md` Phase 2).
  The current always-empty `imported_by` (`core/src/utils.ts:343`) makes every
  export look unused.
- **R3 — Honest effect estimation.** `estimateEffectedSystems`
  (`core/src/utils.ts:554`) uses magic multipliers (`0.3`, `0.8s`). Either
  derive from real data or clearly label as unvalidated heuristic.
- **R4 — Enforcement of destructive safety gates.** The executor must ABORT
  when `git_commit` does not match HEAD, and the checkpoint stash must
  actually capture untracked files. Today both are broken (OBJ-005, OBJ-012).
- **R5 — Maintainability.** `packages/core/src/utils.ts` is a 583-line
  monolith mixing git, scan, tree, and effect concerns. Split into focused
  modules. Planner HTML (476 lines) needs an isolation smoke test.
- **R6 — Real verification.** The 10-package suite has 71 `expect()` calls;
  confirm none are hollow (`expect(true).toBe(true)`) and add at least one
  dry-run integration test through reviewer→planner→executor(dry) on a fixture.
- **R7 — Documentation accuracy.** Archive the stale debrief and update
  `IMPLEMENTATION_PLAN.md` deliverables (still show all agents "Pending").

## Non-Functional Requirements

- N1 — No change to the public `runX(options)` agent export shape (keeps CLI
  and downstream consumers intact).
- N2 — Every change gated by CI (`lint → typecheck → test → build`).
- N3 — No secrets/credentials touched; no destructive git action without an
  explicit, verified `PRUNE_MANIFEST.json`.

## Acceptance Criteria

| AC | Requirement | Criterion |
|----|-------------|-----------|
| AC-001 | R1 | `pnpm --filter @surgical-pruning/cli` run prints exactly one coherent pipeline-status line; no "1-2 done / 3-7 pending" text remains. |
| AC-002 | R2 | A file with a real `imported_by` reference is NOT reported as zero-ref/unused; `imported_by` is populated from a second pass over scanned files. |
| AC-003 | R2 | `knip` and/or `depcheck` are invoked by the reviewer OR their deps are removed from `reviewer/package.json`; no declared-but-unused dependency remains. |
| AC-004 | R3 | `estimateEffectedSystems` output is either computed from measured inputs or carries an explicit `heuristic: true` flag; no undocumented magic constants drive "reduction" claims silently. |
| AC-005 | R4 | Executor aborts (no deletion, non-zero report) when `git_commit` ≠ HEAD. Tests prove abort path. |
| AC-006 | R4 | `git stash push --include-untracked` captures untracked files (no leading-space arg bug). |
| AC-007 | R5 | `core/src/utils.ts` split into `git.ts`/`scan.ts`/`tree.ts`/`effects.ts`; all imports updated; `pnpm run build` green. |
| AC-008 | R6 | A fixture-repo dry-run integration test exists and passes; grep confirms zero `expect(true).toBe(true)` in `packages/**/tests`. |
| AC-009 | R7 | Stale debrief archived under `docs/.archive/` with a resolution note; `IMPLEMENTATION_PLAN.md` deliverables reflect implemented state. |
| AC-010 | N2 | `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` all exit 0 on the refactored tree. |
