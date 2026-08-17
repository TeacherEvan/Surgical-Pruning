# Surgical Pruning — Implementation Plan

**Status:** Specification complete (v2.0); all 7 agents implemented, tested, and CI-gated (npm release pending)  
**Repository:** https://github.com/TeacherEvan/Surgical-Pruning  
**Specification:** `docs/SurgicalpruningConcept.txt`

---

## 🎯 Objective

Build reference implementations for the 7-agent Surgical Pruning multi-agent orchestration system as specified in `docs/SurgicalpruningConcept.txt`.

---

## 📋 Agent Implementation Matrix

| Agent | Role              | Input                                   | Output                                  | Priority | Language Candidates         |
| ----- | ----------------- | --------------------------------------- | --------------------------------------- | -------- | --------------------------- |
| 1     | PRUNE-REVIEWER    | Target path + prompt                    | `.prune/handoff-reviewer.json`          | P0       | TypeScript (Node.js)        |
| 2     | PRUNE-RESEARCHER  | Reviewer handoff + prompt               | `.prune/handoff-researcher.json`        | P0       | TypeScript (Node.js)        |
| 3     | PRUNING-PLANNER   | Both handoffs                           | `surgical-pruning-<mmdd>-<target>.html` | P0       | TypeScript (generates HTML) |
| 4A    | GUARDIAN-EXECUTOR | `PRUNE_MANIFEST.json`                   | `EXECUTION_REPORT.json` + git commit    | P0       | TypeScript (Node.js)        |
| 4B    | GUARDIAN-VERIFIER | `PRUNE_MANIFEST.json` + execution log   | `VERIFICATION_REPORT.json`              | P0       | TypeScript (Node.js)        |
| 5     | DEBRIEFER         | Execution + Reviewer handoff            | Markdown summary                        | P1       | TypeScript (Node.js)        |
| 6     | CODEBASE-AUDITOR  | Post-prune git state + Reviewer handoff | `AUDIT_REPORT.json`                     | P1       | TypeScript (Node.js)        |
| 7     | RESEARCHER v2     | Audit report + Researcher handoff       | Suggestions appended to audit           | P1       | TypeScript (Node.js)        |

---

## 🏗️ Phase 1: Foundation & Core Infrastructure (Week 1-2)

### 1.1 Project Structure

```
surgical-pruning/
├── packages/
│   ├── core/                    # Shared types, schemas, utilities
│   ├── reviewer/                # Agent 1: PRUNE-REVIEWER
│   ├── researcher/              # Agent 2: PRUNE-RESEARCHER
│   ├── planner/                 # Agent 3: PRUNING-PLANNER (HTML generator)
│   ├── executor/                # Agent 4A: GUARDIAN-EXECUTOR
│   ├── verifier/                # Agent 4B: GUARDIAN-VERIFIER
│   ├── debriefer/               # Agent 5: DEBRIEFER
│   ├── auditor/                 # Agent 6: CODEBASE-AUDITOR
│   ├── researcher-v2/           # Agent 7: RESEARCHER v2
│   └── cli/                     # Unified CLI entry point
├── templates/
│   └── planner-html/            # Embedded HTML template for Agent 3
├── tests/
│   ├── fixtures/                # Test codebases for validation
│   └── integration/             # End-to-end tests
├── .github/workflows/           # CI/CD
├── turbo.json                   # Turborepo config (if monorepo)
├── package.json
└── README.md
```

### 1.2 Core Package (`packages/core`)

- JSON schemas for all handoff artifacts (Zod/TypeBox)
- Shared utilities: git operations, file scanning, confidence scoring
- Type definitions matching spec exactly
- Error types and result types

### 1.3 CLI Entry Point (`packages/cli`)

- Unified command: `surgical-prune <target-path> [options]`
- Orchestrates the full pipeline
- Handles dry-run, checkpoint, rollback generation

---

## 🔬 Phase 2: Agent 1 — PRUNE-REVIEWER (Week 2-3)

### Inputs

- Target directory (absolute path)
- User prompt (string)

### Outputs

- `.prune/handoff-reviewer.json` with exact schema from spec

### Implementation Tasks

- [ ] Directory tree scanning (async, streaming for large repos)
- [ ] File inventory: size, lines, language detection, git history
- [ ] Dependency graph construction:
  - Internal imports (relative paths)
  - External imports (package.json dependencies)
  - Imported-by reverse mapping
  - Entry point distance calculation
- [ ] Dead code signal detection:
  - Unused exports (TypeScript: `ts-prune` / `knip` integration)
  - Unreachable code (control flow analysis)
  - Zero references (no imported-by entries)
  - Confidence scoring (0-1)
- [ ] Folder summary aggregation
- [ ] Effected systems estimation (bundle size, CI time, cognitive load)
- [ ] Constraint detection (exclusions, languages, frameworks, package managers)
- [ ] Git metadata capture (root, branch, commit, history)

### Tools Integration

- `knip` — unused exports, dead dependencies (TS/JS)
- `depcheck` — unused dependencies
- `madge` — circular dependencies, dependency graph
- `tsc --noEmit` — type checking for entry points
- Git CLI — history, authors, commit counts

---

## 🔍 Phase 3: Agent 2 — PRUNE-RESEARCHER (Week 3-4)

### Inputs

- `HANDOFF_REVIEWER.json`
- User prompt

### Outputs

- `.prune/handoff-researcher.json` with exact schema from spec

### Implementation Tasks

- [ ] User prompt analysis (intent, scope, aggressiveness, constraints)
- [ ] Language-specific best practice research:
  - TypeScript: knip, ts-prune, repowise, entry point heuristics
  - Python: vulture, pyflakes, patterns
  - Rust: cargo-udeps, patterns
  - Go: govet, staticcheck, patterns
- [ ] General practices synthesis (from spec + web research)
- [ ] Tool recommendations with install/run commands + output schemas
- [ ] Future-proofing: CI integration, pre-commit hooks, dependency budgets

### Web Research Integration

- Targeted searches per detected language/framework
- Filter: ≤12 months, reputable sources (official docs, engineering blogs)
- Cache results locally

---

## 🎨 Phase 4: Agent 3 — PRUNING-PLANNER (Week 4-5)

### Inputs

- `HANDOFF_REVIEWER.json`
- `HANDOFF_RESEARCHER.json`

### Outputs

- `surgical-pruning-<mmdd>-<target>.html` (self-contained, zero deps)

### Implementation Tasks

- [ ] HTML template with embedded:
  - Mermaid.js (CDN + localStorage cache)
  - D3.js v7 (minified, embedded)
  - Vanilla ES6 modules
  - CSS custom properties (Nature / Deep Space / High Contrast themes)
- [ ] Diagram components:
  - Radial tree (D3.js collapsible)
  - Mermaid flowchart LR
  - Circle pack (D3.js, size=bytes, color=confidence)
- [ ] Red highlight pulse for `selected_for_pruning === true`
- [ ] Virtualized checklist (1000+ items smooth)
  - Columns: checkbox, path, size, confidence, signal badge, expand
  - Shift-click range select
  - Keyboard navigation
  - Filter chips (Auto-prune ≥95%, Review 70-94%, Manual <70%, Protected)
- [ ] Live performance blob (SVG path morphing)
  - Bundle size reduction → width
  - File count → particle count
  - CI time → rotation speed
  - Cognitive load → vertex complexity
- [ ] PRUNE button → `PRUNE_MANIFEST.json` + `postMessage` to parent
- [ ] DRY RUN button
- [ ] EXPORT PLAN button
- [ ] WCAG 2.1 AA accessibility
- [ ] Open in default browser

---

## ⚔️ Phase 5: Agents 4A/4B — EXECUTION GUARDIANS (Week 5-6)

### Agent 4A: GUARDIAN-EXECUTOR

#### Inputs

- `PRUNE_MANIFEST.json`

#### Mandatory Steps (Sequential, No Skip)

- [ ] Verify manifest SHA256 + git commit matches HEAD
- [ ] Create checkpoint: `git stash push -m "prune-checkpoint-<timestamp>" --include-untracked`
- [ ] Generate rollback script: `.prune/rollback-<timestamp>.sh`
- [ ] Dry run simulation (if requested) → `.prune/dry-run-<ts>.log`
- [ ] Execute deletions:
  - Tracked: `git rm --cached <file>`
  - Untracked: `rm -f <file>`
  - Log each: `{file, action, reason, bytes}`
- [ ] Verify no build break: run build command per project
- [ ] Commit: `git commit -m "prune: remove <N> dead files [ci skip]"`
- [ ] Emit `EXECUTION_REPORT.json`

### Agent 4B: GUARDIAN-VERIFIER (Parallel)

#### Inputs

- `PRUNE_MANIFEST.json`
- Execution log tail

#### Tasks

- [ ] Watch `.prune/execution.log` (tail -f)
- [ ] Validate: no protected files touched
- [ ] Validate: git status clean pre/post
- [ ] Validate: build passes
- [ ] On ANY violation → write `.prune/ABORT` → Executor reads and rolls back
- [ ] Emit `VERIFICATION_REPORT.json`

---

## 📊 Phase 6: Post-Execution Agents (Week 6-7)

### Agent 5: DEBRIEFER

- Input: `EXECUTION_REPORT.json` + `HANDOFF_REVIEWER.json`
- Output: Markdown summary (spec template)

### Agent 6: CODEBASE-AUDITOR

- Input: Post-prune git state + `HANDOFF_REVIEWER.json`
- Output: `AUDIT_REPORT.json` (dependency health, architectural smells, coverage, build perf, security)

### Agent 7: RESEARCHER v2

- Input: `AUDIT_REPORT.json` + `HANDOFF_RESEARCHER.json`
- Output: 5+ prioritized suggestions appended to audit report

---

## ✅ Phase 7: Integration & Polish (Week 7-8)

### 7.1 End-to-End Testing

- [ ] Test fixtures: small TS, Python, Rust, Go projects with known dead code
- [ ] Full pipeline integration test
- [ ] Rollback verification test
- [ ] Protected file exclusion test
- [ ] Confidence threshold test

### 7.2 CI/CD

- [ ] GitHub Actions: lint, typecheck, test, build
- [ ] Release workflow (semantic versioning)
- [ ] Publish to npm (if CLI package)

### 7.3 Documentation

- [ ] CLI usage guide
- [ ] Agent API documentation
- [ ] Configuration guide
- [ ] Contributing guide updates

### 7.4 Distribution

- [ ] npm package: `@surgical-pruning/cli`
- [ ] GitHub Release with binaries
- [ ] Homebrew tap (optional)

---

## 📦 Deliverables Checklist

| Deliverable                                       | Status     | Notes                        |
| ------------------------------------------------- | ---------- | ---------------------------- |
| Specification (`docs/SurgicalpruningConcept.txt`) | ✅ Done    | v2.0 complete                |
| Public GitHub repo                                | ✅ Done    | TeacherEvan/Surgical-Pruning |
| Core types/schemas package                        | ✅ Done    | Phase 1 (split into git/scan/tree/effects) |
| PRUNE-REVIEWER implementation                     | ✅ Done    | Phase 2 (reverse-import pass + optional knip cross-check) |
| PRUNE-RESEARCHER implementation                   | ✅ Done    | Phase 3                      |
| PRUNING-PLANNER (HTML generator)                 | ✅ Done    | Phase 4 (persists PRUNE_MANIFEST.json side artifact) |
| GUARDIAN-EXECUTOR                                 | ✅ Done    | Phase 5 (abort on git_commit mismatch, scoped commit, protected guardrail) |
| GUARDIAN-VERIFIER                                 | ✅ Done    | Phase 5 (protected/build/git/log checks) |
| DEBRIEFER                                         | ✅ Done    | Phase 6                      |
| CODEBASE-AUDITOR                                  | ✅ Done    | Phase 6                      |
| RESEARCHER v2                                     | ✅ Done    | Phase 6                      |
| Unified CLI                                       | ✅ Done    | Phase 1 + 7 (orchestrates all 7 agents) |
| Test fixtures & E2E tests                         | ✅ Done    | Phase 7 (21 tests, integration dry-run fixture) |
| CI/CD pipeline                                    | ✅ Done    | Phase 7 (ci.yml: lint/typecheck/test/build) |
| npm release                                       | ⏳ Pending | Phase 7 (not published)      |

---

## 🔐 Safety Requirements (Non-Negotiable)

Every implementation must enforce:

1. **No deletion without explicit user confirmation** via HTML interface
2. **Dry-run mandatory** — logged before any mutation
3. **Git checkpoint** — `git stash push --include-untracked` before changes
4. **Rollback script** — auto-generated and tested
5. **Protected paths** — hardcoded exclusion patterns from spec
6. **Confidence thresholds** — ≥95% auto, 70-94% review, <70% manual only

---

## 🛠️ Tech Stack Decisions

| Layer           | Choice                              | Rationale                                         |
| --------------- | ----------------------------------- | ------------------------------------------------- |
| Language        | TypeScript                          | Native TS/JS ecosystem, knip/depcheck integration |
| Package Manager | pnpm                                | Fast, disk-efficient, monorepo support            |
| Build           | tsup / tsc                          | Simple, fast, type-safe                           |
| Testing         | Vitest                              | Fast, native TS, good API                         |
| CLI Framework   | Command.js / oclif                  | Type-safe, good DX                                |
| Git Operations  | simple-git / execa                  | Reliable, well-tested                             |
| File Scanning   | fast-glob / ignore                  | Fast, respects .gitignore                         |
| HTML Generation | Template literals + embedded assets | Zero deps, self-contained                         |

---

## 📝 Next Steps

1. **Initialize monorepo** with pnpm workspaces
2. **Create `packages/core`** with shared schemas
3. **Implement `PRUNE-REVIEWER`** as first agent (foundation for all others)
4. **Build incrementally** — each agent tested in isolation before integration

---

_Plan author: Implementation agent_  
_Specification: `docs/SurgicalpruningConcept.txt` v2.0_  
_Repository: https://github.com/TeacherEvan/Surgical-Pruning_
