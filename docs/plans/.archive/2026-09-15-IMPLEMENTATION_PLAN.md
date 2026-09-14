# Implementation Plan — Surgical-Pruning

> Canonical planning lives under [`docs/plans/`](docs/plans/) and the gap
> analysis under [`docs/GAP_PLAN.md`](docs/GAP_PLAN.md). This root-level file
> is the index that the `spec-validation` guard requires; it is kept in sync
> with those sources.

## Product

Surgical-Pruning is a multi-agent CLI toolkit that scans a codebase, proposes
safe dead-code / over-engineering removals, and produces a reviewable handoff
manifest. Seven specialized agents (Reviewer, Planner, Researcher ×2, Debriefer,
Executor, Verifier, Auditor) are orchestrated through a Turbo/pnpm monorepo
(`packages/*`).

## Current State (summary)

- The pipeline is wired end-to-end: the executor emits a manifest plus a
  rollback script.
- Known gaps versus the original concept spec are tracked **with file:line
  evidence** in `docs/GAP_PLAN.md` (planner visuals, live research, auditor
  depth, executor safety artifacts, reviewer fidelity, debrief deltas, CLI
  consistency).

## Phased Remediation (detail + evidence in `docs/GAP_PLAN.md`)

- **Phase 1 — Planner HTML (highest visible value):** embed D3 v7 + Mermaid
  (inline, no CDN), add a 3-tab diagram panel (TREE / MERMAID / CIRCLE),
  virtualize the checklist, add the performance-blob, theme toggle (Nature /
  Deep Space / High Contrast), WCAG 2.1 AA semantics, PRUNE →
  `window.parent.postMessage`, and emit HTML into `.prune/`.
- **Phase 2 — Reviewer fidelity:** stop glob-excluding protected files from the
  scan; add a lightweight `unreachable` heuristic; surface `tree_diagram`.
- **Phase 3 — Real web research:** Agents 2 & 7 perform live `web_search`
  (with a cached/static fallback when offline).
- **Phase 4 — Auditor depth:** real `madge --circular` / `pnpm dedupe --check`
  / coverage / build-perf / `npm audit` deltas; fix the god-module threshold
  and add feature-envy + shotgun-surgery heuristics.
- **Phase 5 — Executor/Verifier hardening:** write a `.prune/dry-run-<ts>.log`,
  store and verify a SHA256 tamper gate, and promote the verifier to a
  concurrent watcher that writes `.prune/ABORT` and triggers rollback.
- **Phase 6 — Debriefer + CLI polish:** capture a pre-prune baseline and render
  a Before/After/Δ table, separate the "Flagged for review" (70–94%) group,
  and fix the `cli/src/index.ts` "Agents 3-7 pending" message.

## Workflow Gate

Each phase ends green on:

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
```

All work is confined to the Surgical-Pruning repository.
