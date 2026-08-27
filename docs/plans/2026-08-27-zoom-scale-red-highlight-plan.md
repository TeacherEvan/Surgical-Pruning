# Diagram Zoom + Scale Control + Affected-Area Red Highlight Plan

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans` — implement this plan task-by-task.

**Goal:** Make planner diagram SVGs zoomable/scale-controlled (fix Bug 1 / user request) and highlight affected/dead-code files in red within the diagram + row view.

**Architecture:** Add interactive SVG zoom wrapper (CSS `transform: scale()` with mousewheel/pan buttons) inside the planner HTML; extend `.diagram-svg` and `.node.selected` so affected (dead) nodes are red-stroked/highlighted. Keep 100% offline, no CDN.

**Tech Stack:** TypeScript, inline SVG (`packages/planner/src/index.ts`), vitest, vanilla JS in HTML template

**Effort:** ~2-3 days | **Surfaces touched:** 1 package (`packages/planner`) — `src/index.ts` (SVG renderers + HTML template), `tests/graph-zoom.test.ts`, `tests/planner.test.ts` | **New tables:** 0 | **Feature flag:** none (always-on UI enhancement)

---

## Milestone Timeline (sliced, each reviewable)

### Milestone 1 — Zoom mechanism (Day 1 · Mon)
Interactive zoom wrapper on `.diagram-svg`: mousewheel scale, pan-drag, reset-zoom button. No external lib.
- `packages/planner/src/index.ts`: wrap each SVG output (`renderRadialTree`, `renderFlowchart`, `renderCirclePack`) inside a `.zoom-wrap` container with `transform: scale()` applied; inject zoom event handlers.
- `tests/graph-zoom.test.ts`: REAL failing assertions (not stubs) — check `.zoom-wrap` present, `transform` style applied, reset button exists.

### Milestone 2 — Scale control UI (Day 1 · Mon PM)
Visible zoom-in / zoom-out / reset buttons tied to the SVG view; `data-zoom` attrs; `.zoom-ctrl` class.
- Template: add `.zoom-ctrl` button group in `renderHtml()` (after diagram-tabs).
- CSS: `.zoom-wrap { overflow: hidden; position: relative; }` + `.zoom-wrap.zoomed { cursor: grab; }`

### Milestone 3 — Red highlight of affected/dead-code areas (Day 2 · Tue)
Highlight affected (selected/delete) diagram nodes and row badges in red; confirm `.node.selected` uses `var(--accent-decay)` (red) with stronger stroke/drop-shadow (already present at line 577 — verify/enhance).
- `packages/planner/src/index.ts`: in SVG renderers ensure `node.row?.action === "delete"` nodes use red fill/stroke (line 303, 390, 452 already partially do); extend text label to show red badge.
- HTML rows: `.badge-high` (line 601 — already red) applied to high-confidence delete rows; verify it renders.
- `tests/bug2-dead-code-highlight.test.ts`: real assertions (not orphan) that `.badge-high` and `.node.selected` exist and contain red color reference.

### Milestone 4 — Integration gate (Day 3 · Wed)
Full planner test passes; lint/typecheck/build green; `.gitignore` exclusions verified; no `git add -A`.

---

## Data Flow: Zoom interaction (client-only, no server)

```
Mouse event (wheel / drag)  ->  .zoom-wrap container
                                    |
                                    v
                        compute scale factor / translate
                                    |
                                    v
                  apply `transform: scale(s) translate(x,y)`
                                    |
                                    v
                     SVG <g> nodes (data-path) stay bound
                     by stable entity id (not array index)
```

No server mutation. The zoom is pure view-state (like the existing theme toggle at line 792). Persist scale optionally in `localStorage` item `sp-zoom-<diag>`.

---

## Mockups (layout reference — not pixel-final)

A. Zoom control bar (under diagram-tabs):
```
[+  −  ⟲  reset] — float over SVG bottom-right; small pill buttons; aria-label="Zoom in / out / reset"
```

B. Affected-area highlight:
- Diagram node: `.node.selected` = red (`var(--accent-decay)`, stroke-width 2.5, drop-shadow, pulse animation) — ALREADY at line 577; enhance text label to also show red outline.
- Row: `.badge-high` (line 601) = red background + red border — confirm applied to `auto-prune` candidates.

---

## Risk Table

| Risk | Likelihood | Impact | Mitigation |
| Migration locks diagram during deploy | Low | Low | Client-only; no server/state mutation; deploy safe |
| Zoom breaks `data-path` sync with rows | Medium | High | Confirm `.node.selected` sync logic (line 749-758) uses `data-path` (stable) not array index |
| Red highlight claims unverified (CSS memory claim) | Medium | Medium | Run `.node.selected` + `.badge-high` grep + visual assert; put color assertion in `tests/graph-zoom.test.ts` |
| `.zoom-wrap` writes under tool-owned dir (none here) | Low | Low | `.prune/` is the planner's artifact dir (not `convex/_generated`); safe |

---

## Verify Visual / Transform Claims Against Live Source (MANDATORY — per skill §Visual-claims)

Before finalizing zoom/scale CSS, verify against `packages/planner/src/index.ts`:
- `.diagram-svg` (line 575): `overflow:visible; width:100%; height:auto` — zoom wrapper must NOT override `overflow:visible` with `hidden` (else nodes clipped). Use `overflow: hidden` ONLY on `.zoom-wrap`, keep `.diagram-svg` `overflow:visible`.
- `.node.selected` (line 577): `transform` only via `animation: pulse` (opacity only, not rotation/scale); safe. Confirm no parent `transform: none !important` cancels it (none in file).
- `viewBox` present at line 285 (`viewBox="0 0 900 620"`) — scale mechanism must respect `viewBox` (use CSS `transform` on wrapper, NOT changing SVG `width/height`).
- Red highlight claim (`.badge-high`): grep `.badge-high` in file — present at line 601. Verified REAL, not memory.

---

## Verify External / Library / Package Facts (per skill §Library-contract)

- No new dependencies (offline design preserved). `pnpm-lock.yaml` unchanged unless needed.
- `vitest` (test runner) already configured — verify `packages/planner/package.json` scripts exist (`test`, `lint`, `typecheck`).
- `typescript` version: `^5.3.0` in root `package.json` — compatible with no new types needed for DOM events in HTML template.

---

## Detect Pre-Existing Draft Plans (VERIFIED — this section)

- Read `docs/plans/2026-08-26-surgical-pruning-plan.md` (exists; states 3 bugs: zoom, dead-code highlight, agent timeout).
- Read `packages/planner/src/index.ts` lines 248-484 (SVG renderers — no zoom mechanism present; `.node.selected` exists but only visual).
- Read `packages/planner/tests/graph-zoom.test.ts` (RED stub; `expect` has `true` constant — must be rewritten).
- Read `packages/planner/tests/bug2-dead-code-highlight.test.ts` (untracked orphan; rev-list=0; will delete/rewrite).
- Plan REVISION: extend `2026-08-26-surgical-pruning-plan.md` (bump date) rather than overwrite; include zoom + red-highlight milestones.

---

## Detect Live Sidecar + Output-Directory Ownership (MANDATORY)

Before any executor writes to `packages/planner/src/`:
- `ps -ef | grep -E "convex|next dev|codegen|tsc --watch" | grep -v grep` — check for live regens (none expected in planner package; planner has no `convex/_generated/`).
- Planner output: `packages/planner/src/index.ts` → writes to `cwd/` + `.prune/`. `.prune/` is NOT owned by a live process (verified: no `convex dev` in planner scope). Safe.
- Probe step (add to plan): after any write, `ls -la <new-file>` within 60s — if gone, it's sidecar ownership; reroute.

---

## Bite-Sized Task Granularity (per skill §Granularity)

Each milestone = test-first steps (2-5 min each):
1. Read `packages/planner/src/index.ts:575-580` → confirm `.zoom-wrap` class absent.
2. Add `.zoom-wrap` container + `.zoom-ctrl` buttons to `renderHtml()` → run `pnpm run build` at planner package.
3. Write REAL failing test in `tests/graph-zoom.test.ts` → `pnpm test -- --testNamePattern=zoom` must FAIL.
4. Implement zoom handler (mousewheel + drag + buttons) in client `<script>` → test passes.
5. Confirm `.badge-high` and `.node.selected` red styling with assert (grep + visual gate) → `tests/bug2-dead-code-highlight.test.ts` passes.
6. Full planner `pnpm run lint && typecheck && test` → green.
7. Commit EXPLICIT paths ONLY (no `-A`) per `.gitignore` exclusions (audit artifacts excluded); `.prune/` artifacts stay untracked per `.gitignore`.

---

## PR CI Lint Gate Note (MANDATORY — per skill §CI-gate)

This plan modifies ONLY `packages/planner/`. Lint gate should be diff-scoped to planner files (`packages/planner/src/*.ts`, `packages/planner/tests/*.ts`) — NOT full repo — since upstream carries 17 pre-existing lint warnings (verified in earlier audit). Add note in PR body.

---

## Plan Verification (before execution)

- [x] Live source read (`packages/planner/src/index.ts`) — verified SVG at 248-484, CSS `.node.selected` at 577, `.badge-high` at 601, no zoom mechanism.
- [x] Existing plan (`2026-08-26-surgical-pruning-plan.md`) read and extended (this file).
- [x] Existing RED test (`graph-zoom.test.ts`) read; will be rewritten to real assertions (not stubs).
- [x] Untracked orphan (`bug2-dead-code-highlight.test.ts`) identified; plan includes deletion/rewrite.
- [x] `.gitignore` exclusions verified (4 audit artifacts added by second pass; `.prune/` excluded).
- [x] No new external dependency (offline design preserved).
- [x] No live `convex dev` owns planner output dir (verified via `ps` in environment; `.prune/` safe).
- [ ] (Pending at execution start) `.node.selected` + `.badge-high` color assertions measured — add executable contract test before first zoom commit.
