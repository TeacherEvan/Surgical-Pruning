# Code-Review Follow-Up — Surgical-Pruning

**Trigger:** `surgical-implementation` dispatcher — all plans complete → `code-review` → feed findings back as orchestration jobs.
**Date:** 2026-09-15. **Gates at time of review:** lint 0 errors, typecheck 20/20, test 11 suites, build 11/11, knip exit 1, `pnpm audit` 8 vulns.

---

## Review Axes

### 1. Correctness
All four canonical gates green on the live tree. GAP_PLAN A1–G1 verified implemented (D3/Mermaid/blob diagrams, virtualized checklist, theme toggle, PRUNE postMessage, real `madge --circular`, SHA256 tamper gate, concurrent verifier watcher + ABORT, Before/After/Δ debrief, protected-file tagging, `tree_diagram` in HTML). No regression found.

### 2. Dead Code / Unused Dependencies (knip, exit 1)

| Package | Dependency | Verdict | Evidence |
|---------|-----------|---------|----------|
| auditor | `execa` | **Genuinely unused** | `execa` imported only in `packages/core/src/git.ts`; auditor/src never imports it |
| auditor | `fast-glob` | **Genuinely unused** | `fast-glob` imported only in `packages/core/src/scan.ts`; auditor uses its own walk |
| cli | `execa` | **Genuinely unused** | same as above — cli has no execa import |
| executor | `execa` | **Genuinely unused** | same |
| integration | `execa` | **Genuinely unused** | same |
| debriefer | `@surgical-pruning/core` | **Genuinely unused** | no import in debriefer/src |
| integration | `@surgical-pruning/core` | **Genuinely unused** | no import in integration/src |
| reviewer | `depcheck` (devDep) | **Genuinely unused** | only referenced as a tool string in `researcher/src/index.ts:120-122`, never imported |
| reviewer | `zod` (devDep) | **Misclassified** | `packages/reviewer/src/index.ts:22` imports `z`; must be a `dependencies` entry, not devDependency |

**Also flagged (knip config hints, not errors):** `docs/**`, `.prune/**`, `**/.prune/**` in `knip.config.ts` ignore list — knip suggests removing; these are intentional (audit scratch + pruning artifacts).

### 3. Security (npm audit)
8 vulnerabilities in `turbo@1.13.4` (transitive, root devDependency): **1 critical, 2 high, 4 moderate, 1 low**. Patched in `>=2.9.14`. Turbo is the build orchestrator; upgrading is a behavior change (requires changelog review + green suite before/after, lockfile diff review). Not a code defect — an environment/dependency finding.

### 4. Tests
No hollow tests (`expect(true).toBe(true)` / `placeholder` grep = 0 hits). 16 test files, real assertions on function outputs and file artifacts. `packages/planner/tests/` includes targeted tests for A1/A8 features (graph-zoom, a8-aria-landmarks).

### 5. Architecture / Performance
No N+1, no unbounded loops, no new coupling. Module boundaries intact; no circular deps (madge confirms).

---

## New Orchestration Jobs (OBJ-REM-001 ...)

These are the findings fed back into `surgical-orchestration` as JobCards. **Executed 2026-09-15 (surgical-implementation run, commit 4c1cfa8).**
OBJ-REM-001..005 done; OBJ-REM-006 (turbo upgrade, MEDIUM) and OBJ-REM-007 (knip ignore re-eval) deferred pending user sign-off. — the repo is verified-complete and all gates green; this is the remediation backlog.

| ID | Objective | Scope | Risk | Acceptance |
|----|-----------|-------|------|------------|
| OBJ-REM-001 ✅ | Remove unused `execa` dep from auditor, cli, executor, integration | 4 `package.json` | LOW | `pnpm install` clean; knip `Unused dependencies` no longer lists execa for those packages |
| OBJ-REM-002 ✅ | Remove unused `fast-glob` dep from auditor | `packages/auditor/package.json` | LOW | knip clean for fast-glob |
| OBJ-REM-003 ✅ | Remove unused `@surgical-pruning/core` dep from debriefer, integration | 2 `package.json` | LOW | knip clean |
| OBJ-REM-004 ✅ | Remove unused `depcheck` devDep from reviewer | `packages/reviewer/package.json` | LOW | knip clean |
| OBJ-REM-005 ✅ | Move `zod` from devDependencies → dependencies in reviewer | `packages/reviewer/package.json` | LOW | knip no longer flags zod; build still green |
| OBJ-REM-006 | Upgrade `turbo` 1.13.4 → latest (>=2.9.14) to close audit vulns | root `package.json` + lockfile | MEDIUM | Changelog reviewed; `pnpm run lint && typecheck && test && build` green before/after; lockfile diff reviewed |
| OBJ-REM-007 | Re-evaluate knip `ignore` list (docs/**, .prune/**) — remove if no longer needed | `knip.config.ts` | LOW | knip exit 0 without those ignores, or documented rationale retained |

**Definition of Done for the batch:** `pnpm run knip` exits 0 (or documented exceptions), `pnpm audit` shows 0 high/critical, all four gates green, single scoped commit per logical change.
