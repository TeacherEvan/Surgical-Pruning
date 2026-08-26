---
date: 2026-08-26
plan-file: 2026-08-26-surgical-pruning-plan.md
scope: plan + edit (user: PROCEED) — still NO --execute deletions
workspace-pin: ONLY ~/.../Surgical-Pruning; no cross-contamination
status: IMPLEMENT — Phase 3 (subagent build); Phase 2 plan complete
---
# Surgical-Pruning — Implementation Plan (3 Bugs)

Per user "all" (3 bugs) + "PROCEED" + superpowers TDD + subagent loop.

## Tasks (each: test → fail → implement → pass → commit)
1. **Graphs zoomable** — add zoom/scale control to planner HTML template (`packages/cli/src/*html*` or output builder). Subagent A.
2. **Dead-code highlight** — add visual badge/style for flagged candidates in HTML + manifest (`packages/cli/src/*plan*`, `.prune/` output). Subagent B.
3. **Agent responsiveness** — diagnose pipeline dispatch; fix message-handling / timeout in agent pipeline (`packages/cli/src/*agent*` / pipeline). Subagent C.

## Constraints
- NO `--execute` / deletions. Build/test verification only.
- TDD mandatory per superpowers; reviewer subagent per fix.
- All commits in this folder; push to GitHub after; skills report after push.
- Cross-contamination enforced (live-verified): outputs stay here; no DaggaBank drift.
- Evidence over claims — verify each with `pnpm run typecheck/test/build`.
