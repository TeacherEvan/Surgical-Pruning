# Requirements & Acceptance Criteria

## User request

Build reference implementations for the 7-agent Surgical Pruning multi-agent orchestration system as specified in `docs/SurgicalpruningConcept.txt`. The implementation plan in IMPLEMENTATION_PLAN.md defines 7 phases across 8 weeks to deliver all 7 agents plus unified CLI, testing, CI/CD, and npm release.

## Functional requirements

- [ ] REQ-001. Initialize monorepo with pnpm workspaces and Turborepo (Phase 1.1)
- [ ] REQ-002. Create `packages/core` with shared Zod schemas for all handoff artifacts, utilities for git operations, file scanning, confidence scoring (Phase 1.2)
- [ ] REQ-003. Create unified CLI entry point `packages/cli` with command `surgical-prune <target-path> [options]` (Phase 1.3)
- [ ] REQ-004. Implement Agent 1: PRUNE-REVIEWER - directory scanning, file inventory, dependency graph, dead code signals, folder summaries, effected systems, constraints (Phase 2)
- [ ] REQ-005. Implement Agent 2: PRUNE-RESEARCHER - user prompt analysis, language-specific best practices, tool recommendations, future-proofing (Phase 3)
- [ ] REQ-006. Implement Agent 3: PRUNING-PLANNER - self-contained HTML generator with D3.js, Mermaid, virtualized checklist, performance blob, PRUNE/DRY RUN/EXPORT buttons (Phase 4)
- [ ] REQ-007. Implement Agent 4A: GUARDIAN-EXECUTOR - manifest verification, git stash checkpoint, rollback script, dry-run, deletions, build verification, commit, execution report (Phase 5)
- [ ] REQ-008. Implement Agent 4B: GUARDIAN-VERIFIER - concurrent watcher, validates no protected files touched, git status, build passes, ABORT on violation, verification report (Phase 5)
- [ ] REQ-009. Implement Agent 5: DEBRIEFER - markdown summary from execution report + reviewer handoff (Phase 6)
- [ ] REQ-010. Implement Agent 6: CODEBASE-AUDITOR - dependency health, architectural smells, coverage impact, build performance, security posture (Phase 6)
- [ ] REQ-011. Implement Agent 7: RESEARCHER v2 - web research on audit findings, 5+ prioritized suggestions appended to audit report (Phase 6)
- [ ] REQ-012. Integration testing with fixtures for TS, Python, Rust, Go projects (Phase 7.1)
- [ ] REQ-013. CI/CD pipeline with GitHub Actions: lint, typecheck, test, build, release (Phase 7.2)
- [ ] REQ-014. Documentation: CLI usage, agent APIs, configuration, contributing (Phase 7.3)
- [ ] REQ-015. npm package release `@surgical-pruning/cli` with GitHub Release binaries (Phase 7.4)

## Non-functional requirements

- [ ] NFR-001. Safety: No deletion without explicit user confirmation via HTML interface, dry-run mandatory, git checkpoint, rollback script, protected paths hardcoded, confidence thresholds enforced (≥95% auto, 70-94% review, <70% manual)
- [ ] NFR-002. HTML planner must be single file, zero dependencies, self-contained with embedded D3.js v7 and Mermaid.js
- [ ] NFR-003. WCAG 2.1 AA accessibility for HTML planner (semantic HTML, ARIA, focus visible, reduced motion, high contrast)
- [ ] NFR-004. TypeScript strict mode throughout; all packages typecheck cleanly
- [ ] NFR-005. Build completes in <60s for full monorepo
- [ ] NFR-006. Test coverage ≥80% for core logic (schemas, utilities, git operations)

## Constraints

- Hard limit: TypeScript, Node.js >=20, pnpm, Turborepo
- Must preserve backward compatibility for generated PRUNE_MANIFEST.json and handoff artifact schemas
- Must not break existing git history or working tree without explicit user action
- All external web research calls must be ≤12 months old, reputable sources only
- Protected paths from spec are non-negotiable (see Safety Requirements)

## Assumptions

- User has Node.js >=20 and pnpm installed
- Target codebases for pruning are git repositories
- Web search for Agent 2/7 will have API access (Nous subscription provides web tools)
- GitHub Actions available for CI/CD
- npm registry access for publishing

## Requirement clarification

- The IMPLEMENTATION_PLAN.md is the execution plan; the SurgicalpruningConcept.txt is the authoritative specification
- If plan and spec contradict, spec wins (per surgical-implementation skill rule: "PLAN DOC ≠ USER INTENT — user wins" and spec is the user's intent)
- Phase ordering is sequential but some agents can be developed in parallel after core is stable

## Acceptance criteria

| ID     | Criterion                                                                                              | Evidence required                                       |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| AC-001 | Monorepo builds with `pnpm run build` exit code 0                                                      | Terminal output showing successful build                |
| AC-002 | `packages/core` exports Zod schemas for all 7 handoff artifacts                                        | TypeScript compilation + schema validation tests        |
| AC-003 | CLI command `surgical-prune --help` shows usage                                                        | Terminal output                                         |
| AC-004 | PRUNE-REVIEWER produces valid `handoff-reviewer.json` matching spec schema                             | JSON schema validation + sample output                  |
| AC-005 | PRUNE-RESEARCHER produces valid `handoff-researcher.json` matching spec schema                         | JSON schema validation + sample output                  |
| AC-006 | PRUNING-PLANNER generates self-contained HTML with all required UI components                          | File exists, opens in browser, all 5 components present |
| AC-007 | GUARDIAN-EXECUTOR creates git stash checkpoint and rollback script before any deletion                 | Git stash list + rollback script file                   |
| AC-008 | GUARDIAN-VERIFIER runs concurrently and can abort on protected file violation                          | ABORT file created + verification report                |
| AC-009 | DEBRIEFER produces markdown summary matching template                                                  | Markdown file with all sections                         |
| AC-010 | CODEBASE-AUDITOR produces audit report with all 5 scope areas                                          | JSON report with all fields populated                   |
| AC-011 | RESEARCHER v2 appends 5+ prioritized suggestions to audit report                                       | Audit report with suggestions array length ≥5           |
| AC-012 | E2E test passes on fixture projects                                                                    | Test output showing pass                                |
| AC-013 | CI/CD pipeline runs lint, typecheck, test, build on PR                                                 | GitHub Actions workflow file + run logs                 |
| AC-014 | npm package publishes successfully                                                                     | npm registry listing                                    |
| AC-015 | All safety requirements enforced (dry-run, confirm, checkpoint, rollback, protected paths, confidence) | Code review + integration test verification             |
