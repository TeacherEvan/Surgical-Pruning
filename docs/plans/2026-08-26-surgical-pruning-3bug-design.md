---
date: 2026-08-26
workspace: /home/ewaldt/Documents/VS/Other/SKILLS/LittleDevil-Skills/Surgical-Pruning
scope: plan-only (per user clarification); edit target packages/cli/src when approved
cross-contamination: ENFORCED — outputs stay in workspace; other sessions untouched
status: DRAFT (design approved → implement → verify → push → skills report)
---
# Surgical-Pruning — 3-Bug Design (Plan Only Phase)

Per superpowers workflow: brainstorm → design (this file) → plan → subagent TDD → review → finish.
Hard gate: NO code edits until user approves this design + plan file.

## Bugs (all 3 — user confirmed "all")
1. Graphs cut off / not zoomable → UI/render layer in planner HTML (`packages/cli/src` output templates).
2. Dead code not highlighted → planner/manifests format; no visual distinction in HTML/JSON.
3. Agents unresponsive after requests → pipeline dispatch; agent-to-agent message passing failure.

## Workspace / Cross-Contamination Rules (user-mandated, live-verified)
- Edit workspace: ONLY `~/Documents/VS/Other/SKILLS/LittleDevil-Skills/Surgical-Pruning`.
- Skill outputs (.prune/, HTML/manifests): stay in workspace they run in; never into DaggaBank / other sessions.
- Sequence after approval: edit → `git commit` → push GitHub → THEN agent skills report.
- GODMODE ENABLED; direct/unfiltered; no fabricated results.
- Other running sessions: unaffected by this session's pin.

## Trade-offs (recommended first)
A. Fix graphs + highlight (UI layer) first — visible to user; agent unresponsiveness last (hardest, pipeline-level).
B. Subagent per bug (small, isolated) with TDD; reviewer subagent per fix.
C. No `--execute` deletions — plan + visual fix only; build verification only.

Need user approval before Phase 2 (plan writing) and Phase 3 (subagent build).
