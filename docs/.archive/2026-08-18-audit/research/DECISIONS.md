# Research Decisions

| ID      | Decision                                                                                        | Rationale                                                                                                         | Alternatives rejected                                                                           |
| ------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DEC-001 | Use knip as primary dead code detection tool for TypeScript/JavaScript                          | Actively maintained, supports entry points/aliases/ignore patterns, CI integration, JSON output schema, TS-native | ts-prune (legacy, limited), fallow (Rust-based, less TS ecosystem integration), manual analysis |
| DEC-002 | Pin depcheck to v7.16.4 (avoid v7.16.5 regression)                                              | v7.16.5 reports incorrect unused dependencies (SRC-015); v7.16.4 stable                                           | Upgrading to latest without pinning; using npm resolutions (adds complexity)                    |
| DEC-003 | Embed minified D3.js v7 locally in PRUNING-PLANNER HTML (not CDN)                               | Spec requires "self-contained, zero deps" HTML; offline capability mandatory                                      | CDN-only (fails offline), bundling via build step (adds complexity, not self-contained)         |
| DEC-004 | Use Mermaid.js via CDN ES module with localStorage cache fallback                               | Mermaid is large (~2MB minified); embedding locally bloats HTML; CDN + cache gives best of both                   | Full local embed (too large), CDN-only (no offline)                                             |
| DEC-005 | Use `git stash push -m "prune-checkpoint-<timestamp>" --include-untracked` for checkpoints      | Saves both tracked and untracked files; named stash easy to find/rollback; standard Git                           | `git stash -u` (no message), `git commit --amend` (pollutes history), branch+commit (heavier)   |
| DEC-006 | Confidence scoring: unused exports=0.95, zero refs=0.92, unreachable=0.80, dynamic imports=0.50 | Matches spec thresholds (≥95% auto, 70-94% review, <70% manual); based on tool reliability                        | Uniform scoring, only tool-based scoring, heuristic-only without tool validation                |
| DEC-007 | Protected paths hardcoded as exact patterns from spec (non-negotiable)                          | Spec explicitly lists protected patterns; safety requirement is non-negotiable                                    | Configurable protected paths (defeats safety guarantee), user-defined only                      |
| DEC-008 | PRUNE_MANIFEST.json includes SHA256 of manifest + git commit for verification                   | GUARDIAN-EXECUTOR must verify manifest integrity before execution; tamper-proof                                   | No integrity check, simple version field                                                        |
| DEC-009 | HTML planner uses CSS custom properties for theming (Nature/Deep Space/High Contrast)           | Spec requires three themes; CSS variables enable instant switching without re-render                              | Separate CSS files, inline style manipulation, class-based theming                              |
| DEC-010 | Virtualized checklist uses IntersectionObserver + requestAnimationFrame for 1000+ items         | Spec requires smooth 1000+ items; virtualization essential for performance                                        | Full render (lags), simple pagination (not smooth), React/Vue virtualization (adds deps)        |

## Key Architectural Decisions

| Area            | Decision                                                              |
| --------------- | --------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces + Turborepo (per IMPLEMENTATION_PLAN.md)              |
| Language        | TypeScript strict mode throughout                                     |
| Schemas         | Zod for runtime validation + TypeScript types                         |
| Git operations  | `execa` for shelling out to git CLI (reliable, well-tested)           |
| File scanning   | `fast-glob` + `ignore` (respects .gitignore, fast)                    |
| Testing         | Vitest (fast, native TS, good API)                                    |
| CLI framework   | Command.js or oclif (type-safe, good DX) - to be decided in Phase 1.3 |
| HTML generation | Template literals with embedded minified assets (zero deps)           |
| CI/CD           | GitHub Actions (standard, free for public repos)                      |
| Release         | npm `@surgical-pruning/cli` + GitHub Releases                         |
