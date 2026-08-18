# Surgical Pruning — Refactor Architecture (current → target)

This is a refactor, not a rewrite. Agent boundaries, the `runX(options)`
export shape, and the handoff JSON schemas stay stable. Changes are localized
to correctness/safety/maintainability.

## Areas Being Edited

| Area             | File(s)                                          | Change                                                                              | Risk |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | ---- |
| Dead-code engine | `packages/core/src/utils.ts`                     | Add reverse-import second pass; populate `imported_by`; optional knip/depcheck hook | Med  |
| Core structure   | `packages/core/src/{git,scan,tree,effects}.ts`   | Split 583-line monolith; re-export from `index.ts`                                  | Med  |
| Effect estimate  | `packages/core/src/effects.ts`                   | Replace magic multipliers with measured/flagged output                              | Low  |
| Reviewer tools   | `packages/reviewer/src/index.ts`, `package.json` | Invoke knip/depcheck OR drop deps                                                   | Low  |
| Executor safety  | `packages/executor/src/index.ts`                 | Abort on git_commit mismatch; fix stash arg; scope commit to manifest files         | High |
| CLI honesty      | `packages/cli/src/index.ts`                      | Remove contradictory trailing status message                                        | Low  |
| Tests            | `packages/**/tests/*`, new `tests/integration`   | Hollow-test purge + dry-run fixture test                                            | Low  |
| Docs             | `IMPLEMENTATION_PLAN.md`, `docs/.archive/*`      | Archive stale debrief; update deliverables                                          | Low  |

## Current → Target Data Flow

```
BEFORE (broken):
  scanDirectory ──▶ analyzeFile ──▶ analyzeDependencies (imported_by=[])
                                    │
                                    ▼ (no second pass)
                          detectDeadCodeSignals ──▶ EVERY export "unused",
                                                    hardcoded confidence

AFTER (real):
  scanDirectory ──▶ [pass 1] analyzeFile ──▶ analyzeDependencies (imports only)
                  ──▶ [pass 2] buildImportedBy(allFiles) ──▶ fill imported_by
                  ──▶ detectDeadCodeSignals (uses real imported_by)
                  ──▶ (optional) knip/depcheck cross-check for TS/JS targets
```

## Executor Safety (target)

```
BEFORE:  load manifest → record git_commit_match (decorative) → DELETE regardless
AFTER:   load manifest → verify sha256 + git_commit == HEAD
         ├─ mismatch ──▶ ABORT, write report{passed:false}, 0 deletions
         └─ match ───▶ stash push -m <msg> --include-untracked (fixed argv)
                       └─ delete only manifest paths (protected-checked)
                          └─ git add <specific files> && git commit <files>
```

## Security Boundaries (preserved)

- No deletion without a verified `PRUNE_MANIFEST.json`.
- Protected paths (`PROTECTED_PATHS` from `core`) never touched.
- Dry-run remains default-safe; executor only mutates when manifest present +
  git_commit matches + not dry-run.

## AC Mapping

- AC-002/AC-003 ← dead-code engine + reviewer tools.
- AC-004 ← effects module.
- AC-005/AC-006 ← executor safety.
- AC-001 ← CLI.
- AC-007 ← core split.
- AC-008 ← tests.
- AC-009 ← docs.
- AC-010 ← full gate run.
