# Surgical-Pruning — Gap Plan vs Original Spec (v2.0)

**Scope:** `/home/ewaldt/Documents/VS/Other/SKILLS/LittleDevil-Skills/Surgical-Pruning` (local mirror of `TeacherEvan/Surgical-Pruning`).
**Method:** Read `packages/*/src/*.ts` + `core/src/schemas.ts` and diffed against `docs/SurgicalpruningConcept.txt`. Every gap below is evidenced by file:line.
**Verdict:** Pipeline is wired end-to-end, but the *visual planner*, the *live research agents*, the *deep auditor*, and several *safety artifacts* are not implemented as specified.

---

## GAP REGISTER

### A. PLANNER HTML — visual spec not implemented (highest visibility)
| ID | Spec req | Status in code | Evidence |
|----|----------|----------------|----------|
| A1 | D3 radial tree / Mermaid flowchart / D3 circle-pack diagrams | **Missing entirely** (no d3/mermaid refs in any HTML) | `packages/planner/src/index.ts:renderHtml` only emits a `<table>` |
| A2 | SVG path-morphing "performance blob" (bundle/files/CI/cognitive-load) | **Missing** | grep `performance.*blob\|path.*morph` → 0 hits in 0820.html |
| A3 | Virtualized checklist (1000+ items smooth) | **Missing** — all rows rendered to DOM | `renderHtml` maps `plan.rows` to `<tr>` directly |
| A4 | [🔍] Expand row → imports / imported-by | **Missing** | no expand UI; data exists in handoff but not passed to HTML |
| A5 | Checkbox→diagram highlight; Shift-click range; keyboard (Space/Enter//) | **Missing** (no diagrams to drive) | — |
| A6 | Theme toggle (Nature / Deep Space / High Contrast) | **Missing** | single hardcoded dark theme |
| A7 | Header: date in title + "Est. CI Time Saved (s)" stat | **Missing** | header has target+git, 2 stats only (candidates, reclaimable B) |
| A8 | WCAG 2.1 AA (role=tablist, aria-*, reduced-motion) | **Partial/none** | plain markup, no ARIA/tab semantics |
| A9 | Deliver to `.prune/` + auto-open browser | **Diverges** — writes to `cwd` root, no auto-open | `planner/src:absPath = path.resolve(cwd, fileName)`; no `open`/`xdg-open` |
| A10 | PRUNE → `postMessage` to parent + "handoff initiated" modal | **Missing** — PRUNE only builds manifest in console | `renderHtml` PRUNE handler → `console.log` + summary text |

### B. RESEARCH AGENTS — no live web research
| ID | Spec req | Status | Evidence |
|----|----------|--------|----------|
| B1 | Agent 2: `web_search` per language/framework | **Static canned data**, no web call | `researcher/src/index.ts:researchLanguagePractices` = hardcoded `switch` |
| B2 | Agent 7: web research per audit finding, ≥5 cited | **Static**, no web call | `researcher-v2/src/index.ts` builds fixed suggestions, no search |

### C. AUDITOR (Agent 6) — mostly stubbed
| ID | Spec req | Status | Evidence |
|----|----------|--------|----------|
| C1 | Circular deps via `madge --circular` | **Hardcoded `[]`** | `auditor/src/index.ts:62 circular: []` |
| C2 | Duplicate deps via `pnpm dedupe --check` | **Hardcoded `[]`** | `auditor/src/index.ts:63 duplicates: []` |
| C3 | Test coverage impact (lines removed / covered lost / pct) | **Hardcoded 0** | `auditor/src:66-70` |
| C4 | Build perf (bundle before/after, `tsc --extendedDiagnostics`) | **Hardcoded 0** | `auditor/src:71-75` |
| C5 | Security delta (`npm/cargo/pip audit`) | **Hardcoded 0** | `auditor/src:76-79` |
| C6 | God module >500 lines; feature_envy; shotgun_surgery | **Only god_module @ >800 lines**; other 2 absent | `auditor/src:48-55` |

### D. EXECUTOR / VERIFIER (Agent 4) — safety artifacts & concurrency
| ID | Spec req | Status | Evidence |
|----|----------|--------|----------|
| D1 | Dry-run log `.prune/dry-run-<ts>.log` | **Not written** (only console + rollback comments) | `executor/src` has no dry-run log file |
| D2 | Manifest SHA256 *verified* (tamper check) | **Cosmetic** — hash computed, never validated | `executor/src:69,86` pushes `manifest_checksum: passed:true` unconditionally |
| D3 | Verifier runs **concurrently**, tails log, writes `.prune/ABORT`, auto-rollback | **Post-hoc only** — no watcher, no ABORT, no rollback trigger | `verifier/src:runVerifier` is a single-pass post validator |

### E. REVIEWER (Agent 1) — inventory fidelity
| ID | Spec req | Status | Evidence |
|----|----------|--------|----------|
| E1 | Protected files (config/test/entry) scanned + flagged `Protected` | **Excluded from scan entirely** (fast-glob `ignore`) → invisible, `protected_files` always 0 | `reviewer/src:59-63` passes `PROTECTED_PATTERNS` as glob ignore; `scan.ts:31-37` |
| E2 | Real `unreachable` detection | **Always `false`** | `scan.ts:441 unreachable: false` |
| E3 | `tree_diagram` surfaced in plan | Only in handoff JSON, not in HTML | `planner/src` ignores `tree_diagram` |

### F. DEBRIEFER (Agent 5)
| ID | Spec req | Status | Evidence |
|----|----------|--------|----------|
| F1 | Before/After/Δ reclamation table (Files, LOC, Bundle, CI) | **Missing** — no pre-prune baseline captured | `debriefer/src` has no before-state |
| F2 | "Flagged for review" (70-94%) separated from skipped | **Not separated** | debrief lists raw `skipped_reasons` only |

### G. CLI consistency
| ID | Spec req | Status | Evidence |
|----|----------|--------|----------|
| G1 | Coherent "all agents" status | Entry-point `.then` still prints "Agents 3-7 pending" | `cli/src/index.ts:302` (OBJ-004 regression) |

---

## PHASED REMEDIATION PLAN

All work confined to the Surgical-Pruning repo. Each phase ends with `pnpm run lint && typecheck && test && build` green.

### Phase 1 — Planner HTML: the visible product (A1–A10)
1. Embed D3 v7 + Mermaid as **inline minified** (no CDN) in `renderHtml`.
2. Add 3-tab diagram panel: TREE (D3 collapsible radial), MERMAID (LR flowchart), CIRCLE (D3 pack; size=bytes, color=confidence).
3. Red-highlight pulse on `selected_for_pruning` nodes; checkbox↔diagram rAF sync.
4. Virtualize the checklist (windowed render) + [🔍] expand → imports/imported-by (pass `dependency_graph` into `PlanRow`).
5. SVG morph "performance blob" driven by `effected_systems` + live selection.
6. Theme toggle (Nature / Deep Space / High Contrast) via CSS vars + `localStorage`.
7. Header: `<mm/dd/yyyy>`, stat pills incl. Est. CI Time Saved.
8. WCAG: `role=tablist`/`tab`/`listbox`, `aria-*`, `prefers-reduced-motion`.
9. PRUNE → `window.parent.postMessage({type:'PRUNE_TRIGGER',payload:manifest},'*')` + modal "Handoff initiated".
10. Emit HTML into `.prune/` (spec) **and** keep a copy in `cwd` (your stated expectation); attempt `open`/`xdg-open`.
**Verify:** planner unit test asserts diagrams present + self-contained (no http script src).

### Phase 2 — Reviewer fidelity (E1–E3)
1. Stop glob-excluding protected patterns from the *scan*; instead scan everything, tag `is_test/is_config/is_entry` and bucket as `Protected` in planner + `folder_summary.protected_files`.
2. Add lightweight `unreachable` heuristic (no importers + not imported_by + not entry).
3. Pass `tree_diagram` into the HTML (render as a collapsible `<pre>` or Mermaid).

### Phase 3 — Real research (B1, B2)
1. Agent 2: `web_search` per detected language/framework, fold results into `language_specific_practices` + `general_practices` (keep static fallback if offline).
2. Agent 7: `web_search` per audit finding → cited `Suggestion` with `source` URL.

### Phase 4 — Auditor depth (C1–C6)
1. Run `madge --circular` (if available) → `circular`.
2. Run `pnpm dedupe --check` (parse) → `duplicates`.
3. Capture pre/post for coverage (read coverage report if present) + build perf (`tsc --extendedDiagnostics`, bundle compare) → fill real deltas or mark `null` when unavailable.
4. `security_delta` from `npm audit --json` / `pnpm audit` parse.
5. Fix god_module threshold to >500; add `feature_envy` (>3 sibling dir imports) + `shotgun_surgery` (>5 files per feature) heuristics.

### Phase 5 — Executor/Verifier hardening (D1–D3)
1. Write `.prune/dry-run-<ts>.log` on dry runs.
2. Store expected SHA256 in manifest at plan time; executor refuses if mismatch (real tamper gate).
3. Promote verifier to a concurrent watcher: tail execution log, on any violation write `.prune/ABORT`; executor polls ABORT and rolls back via the generated script.

### Phase 6 — Debriefer + CLI polish (F1, F2, G1)
1. Capture pre-prune baseline (files/LOC/bundle/CI) in reviewer; debrief renders Before/After/Δ.
2. Separate "Flagged for review" (70-94%) group in debrief.
3. Fix `cli/src/index.ts:302` "Agents 3-7 pending" message.

---

## PRIORITY ORDER
User already flagged A1–A10 (diagrams + HTML). Recommend **Phase 1 first** (highest visible value, self-contained), then Phase 2 (correctness), then 3/4/5 (research + auditor + safety), then 6 (polish).
