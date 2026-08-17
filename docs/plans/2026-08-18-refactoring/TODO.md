# Surgical Pruning — Refactoring TODO

**Definition of Done (per objective):** implemented, non-hollow test added,
`pnpm run lint && typecheck && test && build` green for the touched package(s),
evidence block filled.

---

## OBJ-001 — Realize reverse-import second pass in core
- **Req:** R2 · **Areas:** `packages/core/src/utils.ts` (`analyzeDependencies:277`, `detectDeadCodeSignals:415`)
- **AC:** AC-002
- **Validation:** Unit test: two scanned TS files, one imports the other →
  importer's `imported_by` is non-empty; exporter is NOT flagged unused.
- **Evidence:** _(fill on implement)_

## OBJ-002 — Wire knip/depcheck into reviewer (or drop the deps)
- **Req:** R2 · **Areas:** `packages/reviewer/src/index.ts`, `packages/reviewer/package.json:27-28`
- **AC:** AC-003
- **Validation:** Grep proves `knip`/`depcheck` invoked OR removed from
  package.json; reviewer test still green.
- **Evidence:** _(fill on implement)_

## OBJ-003 — De-magic the effect estimator
- **Req:** R3 · **Areas:** `packages/core/src/utils.ts:554-583`
- **AC:** AC-004
- **Validation:** `estimateEffectedSystems` output carries `heuristic:true`
  flag when not derived from measured data; no undocumented constants in the
  reduction claim.
- **Evidence:** _(fill on implement)_

## OBJ-004 — Fix CLI status contradiction
- **Req:** R1 · **Areas:** `packages/cli/src/index.ts:270-273`
- **AC:** AC-001
- **Validation:** `grep -rn "Agents 1-2 done" packages/cli` returns nothing;
  CLI e2e prints one coherent status.
- **Evidence:** _(fill on implement)_

## OBJ-005 — Fix executor stash checkpoint arg
- **Req:** R4 · **Areas:** `packages/executor/src/index.ts:84`
- **AC:** AC-006
- **Validation:** Test: create untracked file, run executor dry or checkpoint,
  assert `git stash list`/stash contains the untracked file (no leading-space arg).
- **Evidence:** _(fill on implement)_

## OBJ-006 — Make git_commit mismatch a hard abort
- **Req:** R4 · **Areas:** `packages/executor/src/index.ts:72-76,108-158,203`
- **AC:** AC-005
- **Validation:** Test: manifest `git_commit` ≠ HEAD → 0 deletions,
  report `passed:false`, non-zero `checks` failure.
- **Evidence:** _(fill on implement)_

## OBJ-007 — Scope executor commit to manifest files
- **Req:** R4 · **Areas:** `packages/executor/src/index.ts:194`
- **AC:** AC-005 (defense-in-depth)
- **Validation:** Test: working tree has an unrelated modified file → executor
  commit does NOT include it (assert via `git show --stat` of the prune commit).
- **Evidence:** _(fill on implement)_

## OBJ-008 — Split core/utils.ts monolith
- **Req:** R5 · **Areas:** `packages/core/src/{git,scan,tree,effects}.ts` + `index.ts`
- **AC:** AC-007
- **Validation:** `pnpm --filter @surgical-pruning/core run build` green;
  no file > ~250 lines for these concerns; imports updated across packages.
- **Evidence:** _(fill on implement)_

## OBJ-009 — Purge hollow tests + add dry-run integration test
- **Req:** R6 · **Areas:** `packages/**/tests/*`, new `tests/integration`
- **AC:** AC-008
- **Validation:** `grep -rn "expect(true).toBe(true)" packages` → 0 hits;
  new fixture-repo test runs reviewer→planner→executor(dry) end-to-end and
  asserts reviewer handoff written + 0 real deletions.
- **Evidence:** _(fill on implement)_

## OBJ-010 — Planner isolation smoke test
- **Req:** R5/R6 · **Areas:** `packages/planner/src/index.ts`
- **AC:** AC-008 (adjacent)
- **Validation:** Test asserts generated HTML is non-empty, self-contained
  (no external http(s) script src), and contains the `PRUNE_MANIFEST` wiring.
- **Evidence:** _(fill on implement)_

## OBJ-011 — Archive stale debrief + sync IMPLEMENTATION_PLAN.md
- **Req:** R7 · **Areas:** `docs/.archive/2026-08-18-audit/DEBRIEF.md`, `IMPLEMENTATION_PLAN.md`
- **AC:** AC-009
- **Validation:** Stale debrief moved to `docs/.archive/<date>-audit/RESOLVED.md`
  with note "Superseded — all 7 agents implemented"; deliverables checklist
  reflects implemented state (no false "Pending").
- **Evidence:** _(fill on implement)_

## OBJ-012 — Full gate run + traceability
- **Req:** N2 · **Areas:** repo root
- **AC:** AC-010
- **Validation:** `pnpm run lint && pnpm run typecheck && pnpm run test &&
  pnpm run build` all exit 0; `TRACEABILITY.md` maps OBJ→AC→test.
- **Evidence:** _(fill on implement)_

---

## Consistency Note
All 12 objectives map to REQUIREMENTS R1–R7 / N2 and ARCHITECTURE areas.
Executor safety (OBJ-005/006/007) is HIGH-risk: implement behind fixture tests
first, then run the full gate before any real-target execution.
