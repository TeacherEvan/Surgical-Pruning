# Implementation TODO

## Objective

Implement the complete 7-agent Surgical Pruning multi-agent orchestration system as specified in SurgicalpruningConcept.txt v2.0, delivered as a pnpm/Turborepo monorepo with unified CLI, full test coverage, CI/CD, and npm release.

## Constraints

- Must not break existing git history or working tree without explicit user action
- Must stay within TypeScript/Node.js >=20, pnpm, Turborepo stack
- All safety requirements (dry-run, confirm, checkpoint, rollback, protected paths, confidence thresholds) enforced in code
- HTML planner must be single file, zero dependencies, self-contained
- WCAG 2.1 AA accessibility for HTML planner

## Objectives

- [ ] OBJ-001. Initialize monorepo structure with pnpm workspaces + Turborepo; create all 9 package directories (core, reviewer, researcher, planner, executor, verifier, debriefer, auditor, researcher-v2, cli)
- [ ] OBJ-002. Implement @surgical-pruning/core with Zod schemas for all 7 handoff artifacts + PRUNE_MANIFEST + reports, shared utilities (git ops, file scanning, confidence scoring, SHA256)
- [ ] OBJ-003. Implement @surgical-pruning/reviewer (Agent 1): directory scanning, file inventory, dependency graph (knip + depcheck), dead code signals, folder summaries, effected systems, constraints → handoff-reviewer.json
- [ ] OBJ-004. Implement @surgical-pruning/researcher (Agent 2): user prompt analysis, language-specific best practices (TS/JS/Python/Rust/Go), tool recommendations, future-proofing → handoff-researcher.json
- [ ] OBJ-005. Implement @surgical-pruning/planner (Agent 3): self-contained HTML generator with embedded D3.js v7 + Mermaid CDN, 5 UI components (header, diagram toggle, virtualized checklist, performance blob, PRUNE buttons), WCAG 2.1 AA
- [ ] OBJ-006. Implement @surgical-pruning/executor (Agent 4A): manifest SHA256/git commit verification, git stash checkpoint, rollback script generation, dry-run simulation, file deletions (git rm/rm), build verification, commit, EXECUTION_REPORT.json
- [ ] OBJ-007. Implement @surgical-pruning/verifier (Agent 4B): concurrent execution.log tail, validates no protected files touched, git status clean pre/post, build passes, ABORT file on violation, VERIFICATION_REPORT.json
- [ ] OBJ-008. Implement @surgical-pruning/debriefer (Agent 5): markdown summary from EXECUTION_REPORT + handoff-reviewer per template
- [ ] OBJ-009. Implement @surgical-pruning/auditor (Agent 6): post-prune dependency health, architectural smells, coverage impact, build performance, security posture → AUDIT_REPORT.json
- [ ] OBJ-010. Implement @surgical-pruning/researcher-v2 (Agent 7): web research on audit findings, 5+ prioritized suggestions appended to audit report
- [ ] OBJ-011. Implement @surgical-pruning/cli: unified entry point `surgical-prune <target-path> [options]`, orchestrates full pipeline with proper error handling and user feedback
- [ ] OBJ-012. Create test fixtures (TS, Python, Rust, Go projects with known dead code) + integration tests for full pipeline
- [ ] OBJ-013. Implement GitHub Actions CI/CD: lint, typecheck, test, build, release workflow with semantic versioning
- [ ] OBJ-014. Write documentation: CLI usage guide, agent API docs, configuration guide, contributing guide updates
- [ ] OBJ-015. Publish npm package `@surgical-pruning/cli` + GitHub Release with binaries; verify install works

## Objective evidence

### OBJ-001

- Requirement: REQ-001
- Files/modules: pnpm-workspace.yaml, turbo.json, package.json, packages/*/package.json
- Acceptance: AC-001 (monorepo builds)
- Validation: `pnpm run build` exit code 0
- Evidence: Terminal output showing successful build of all packages

### OBJ-002

- Requirement: REQ-002
- Files/modules: packages/core/src/schemas.ts, packages/core/src/utils.ts
- Acceptance: AC-002 (core exports all artifact schemas)
- Validation: TypeScript compilation + schema validation tests
- Evidence: `pnpm --filter @surgical-pruning/core run typecheck` passes; Zod parse tests pass

### OBJ-003

- Requirement: REQ-004
- Files/modules: packages/reviewer/src/index.ts, packages/reviewer/src/scanner.ts, packages/reviewer/src/graph.ts
- Acceptance: AC-004 (produces valid handoff-reviewer.json)
- Validation: JSON schema validation + sample output on fixture
- Evidence: `pnpm --filter @surgical-pruning/reviewer run test` passes; handoff-reviewer.json validates against schema

### OBJ-004

- Requirement: REQ-005
- Files/modules: packages/researcher/src/index.ts, packages/researcher/src/practices.ts
- Acceptance: AC-005 (produces valid handoff-researcher.json)
- Validation: JSON schema validation + sample output
- Evidence: Test output showing valid handoff-researcher.json

### OBJ-005

- Requirement: REQ-006
- Files/modules: packages/planner/src/index.ts, packages/planner/src/template.ts, packages/planner/assets/
- Acceptance: AC-006 (generates HTML with all 5 UI components)
- Validation: File exists, opens in browser, all components present
- Evidence: Generated HTML file size >500KB (embedded assets); manual verification checklist

### OBJ-006

- Requirement: REQ-007
- Files/modules: packages/executor/src/index.ts, packages/executor/src/git.ts, packages/executor/src/rollback.ts
- Acceptance: AC-007 (creates stash + rollback script before deletion)
- Validation: Git stash list shows checkpoint; rollback script file exists and is executable
- Evidence: Integration test output showing stash + rollback creation

### OBJ-007

- Requirement: REQ-008
- Files/modules: packages/verifier/src/index.ts, packages/verifier/src/watcher.ts
- Acceptance: AC-008 (runs concurrent + can create ABORT)
- Validation: ABORT file created on protected file violation; verification report emitted
- Evidence: Integration test simulating protected file touch → ABORT created

### OBJ-008

- Requirement: REQ-009
- Files/modules: packages/debriefer/src/index.ts, packages/debriefer/src/template.ts
- Acceptance: AC-009 (markdown summary with all template sections)
- Validation: Markdown file contains all 9 sections from template
- Evidence: Generated markdown file content verification

### OBJ-009

- Requirement: REQ-010
- Files/modules: packages/auditor/src/index.ts, packages/auditor/src/health.ts, packages/auditor/src/smells.ts
- Acceptance: AC-010 (audit report with all 5 scope areas)
- Validation: JSON report has all fields populated: dependency_health, architectural_smells, coverage_delta, build_performance, security_delta
- Evidence: Test output showing complete AUDIT_REPORT.json

### OBJ-010

- Requirement: REQ-011
- Files/modules: packages/researcher-v2/src/index.ts, packages/researcher-v2/src/suggestions.ts
- Acceptance: AC-011 (appends ≥5 suggestions to audit)
- Validation: Audit report suggestions array length ≥5 with id, priority, category, title, finding, action, source, effort, impact
- Evidence: Updated AUDIT_REPORT.json with suggestions

### OBJ-011

- Requirement: REQ-003
- Files/modules: packages/cli/src/index.ts, packages/cli/src/orchestrator.ts
- Acceptance: AC-003 (CLI shows usage), full pipeline orchestration
- Validation: `surgical-prune --help` works; dry-run on fixture completes
- Evidence: CLI help output + dry-run test pass

### OBJ-012

- Requirement: REQ-012
- Files/modules: tests/fixtures/_, tests/integration/_.test.ts
- Acceptance: AC-012 (E2E test passes on fixtures)
- Validation: `pnpm run test` includes passing integration tests
- Evidence: Vitest output showing integration tests pass

### OBJ-013

- Requirement: REQ-013
- Files/modules: .github/workflows/*.yml
- Acceptance: AC-013 (CI runs all gates on PR)
- Validation: GitHub Actions workflow file exists + run logs show all jobs pass
- Evidence: Workflow YAML + successful Actions run screenshot/log

### OBJ-014

- Requirement: REQ-014
- Files/modules: docs/cli.md, docs/agents/*.md, docs/config.md, CONTRIBUTING.md
- Acceptance: Documentation complete and accurate
- Validation: All planned docs exist and render correctly
- Evidence: File listing + spot check content

### OBJ-015

- Requirement: REQ-015
- Files/modules: package.json (publishConfig), GitHub Release
- Acceptance: AC-014 (npm package publishes)
- Validation: `npm view @surgical-pruning/cli` shows package
- Evidence: npm registry listing URL + install test

## Definition of done

- [ ] Every required objective is complete or explicitly blocked
- [ ] Acceptance criteria have evidence in TRACEABILITY.md
- [ ] Security review complete in SECURITY.md
- [ ] Final audit + debrief.md complete
