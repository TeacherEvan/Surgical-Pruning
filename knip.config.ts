import type { KnipConfig } from "knip";

/**
 * knip dead-code / unused-dependency detection for the Surgical-Pruning
 * pnpm monorepo (knip v5).
 *
 * pnpm workspaces are auto-detected from pnpm-workspace.yaml, so we only
 * declare overrides here. Each library package builds from `src/` to a
 * gitignored `dist/`; knip analyzes SOURCE, never emitted dist artifacts.
 *
 * The packages cross-import via the `@surgical-pruning/*` workspace alias,
 * which knip resolves from each package's own `package.json` exports — so
 * internal re-exports are NOT flagged as unused (the false-positive class the
 * bundled scanner falls into).
 *
 * `docs/**` and `.prune/**` are NOT auto-ignored by knip, so we exclude them
 * explicitly (the latter is this toolkit's own audit scratch output).
 */
const config: KnipConfig = {
  ignore: ["docs/**", ".prune/**", "**/.prune/**"],
  workspaces: {
    // `packages/integration` has no `main`/exports (test-only harness); its
    // entry is its test directory so its helpers aren't all reported orphaned.
    "packages/integration": {
      entry: ["tests/**/*.ts"],
    },
  },
};

export default config;
