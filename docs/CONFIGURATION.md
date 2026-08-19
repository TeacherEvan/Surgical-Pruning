# Surgical Pruning — Configuration Guide

Surgical Pruning is configuration-light by design. Most behavior is driven by
the `PRUNE_MANIFEST.json` produced by the Planner, plus two baked-in constants
in `@surgical-pruning/core`.

## Confidence thresholds

Defined in `packages/core/src/schemas.ts`:

```ts
export const CONFIDENCE_THRESHOLDS = {
  AUTO_PRUNE: 0.95, // >= this: executor may delete (with --execute)
  REVIEW_REQUIRED: 0.7, // below this: flagged for manual review
  MANUAL_ONLY: 0.7, // below this: never auto-deleted
};
```

To change these, edit `CONFIDENCE_THRESHOLDS` in core and re-run the gate.

## Protected paths

`PROTECTED_PATHS` (also in core) lists globs the executor will **never**
delete — secrets, lockfiles, VCS metadata, dependency trees, build output:

```
.git/ .github/ .gitlab/ .husky/
package-lock.json yarn.lock pnpm-lock.yaml Cargo.lock
.env *.pem *.key *.cert secrets/ .aws/ .ssh/
node_modules/ .venv/ venv/ dist/ build/
```

## The manifest

`PRUNE_MANIFEST.json` (written to `.prune/`) is the single source of truth for
an execution run:

```jsonc
{
  "target_path": ".",
  "git_commit": "<short HEAD at plan time>",
  "safety": { "dry_run": true },
  "selected_files": [
    {
      "path": "src/old.ts",
      "action": "delete",
      "confidence": 0.99,
      "reason": "unused",
    },
  ],
}
```

- `safety.dry_run: true` → plan only, no deletions.
- `git_commit` must equal the current `HEAD` short hash or the executor
  refuses to delete (stale-plan guard).
- A file with `confidence < 0.95` is skipped unless `force: true`.

## CLI flags

See [CLI-USAGE.md](./CLI-USAGE.md) for `-p/--prompt`, `--dry-run`,
`--execute`, and `--cwd`.
