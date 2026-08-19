# Surgical Pruning — CLI Usage Guide

The `@surgical-pruning/cli` package installs the `surgical-pruning` binary.

## Install

```bash
npm install -g @surgical-pruning/cli
# or use without installing:
npx @surgical-pruning/cli ./my-project --prompt "remove dead code"
```

## Commands

```bash
surgical-pruning <target-path> [options]
```

| Option | Description |
| --- | --- |
| `<target-path>` | Path to the repo you want to prune (required). |
| `-p, --prompt <text>` | Free-text intent, e.g. "remove dead code aggressively". |
| `--dry-run` | Plan only — no deletions. This is the **default** behavior. |
| `--execute` | Run the guardian-executor (Agent 4A) + verifier (4B) against the persisted `PRUNE_MANIFEST.json`. **OFF by default** to preserve human-in-the-loop review. |
| `--cwd <dir>` | Override the working directory used for git operations (defaults to the shell cwd). |
| `-h, --help` | Show help. |

## Examples

```bash
# Plan only (safe default): scans, writes a .prune/ PRUNE_MANIFEST.json
surgical-pruning ./my-project --prompt "Remove dead code aggressively"

# After reviewing the plan, apply deletions:
surgical-pruning ./my-project --prompt "Clean up unused exports" --execute
```

## What it does

1. **Reviewer (Agent 1)** — scans the target, builds a dependency map, writes `.prune/handoff-reviewer.json`.
2. **Researcher (Agent 2)** — gathers language-specific best practices.
3. **Planner (Agent 3)** — emits an interactive HTML plan + `.prune/PRUNE_MANIFEST.json`.
4. **Executor (Agent 4A)** *[only with `--execute`]* — applies deletions behind git stash checkpoint + auto-generated rollback script. Never deletes protected paths (`*.pem`, `.env`, `node_modules/`, …) and never auto-deletes files below the `AUTO_PRUNE` confidence threshold (0.95).
5. **Verifier (Agent 4B)** *[only with `--execute`]* — confirms the build still passes post-deletion.
6. **Debriefer / Auditor / Researcher-v2 (Agents 5–7)** — summarize, health-check, and suggest improvements.

## Safety model

- Dry-run is the default. Nothing is deleted unless you pass `--execute`.
- Every deletion run writes a `rollback-<timestamp>.sh` into `.prune/`.
- Protected paths and low-confidence files are skipped automatically.
- Deletions are gated on `git_commit` matching `HEAD` — a stale plan will not apply.
