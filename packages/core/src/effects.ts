import type { FileInventoryItem } from "./schemas.js";

export interface EffectedSystemEstimate {
  name: string;
  impact: Record<string, number>;
  heuristic: boolean;
}

/**
 * Estimates the impact of removing the scanned candidate files.
 *
 * NOTE: the numeric multipliers below are UNVALIDATED heuristics, not measured
 * build output. The `heuristic: true` flag is always set so downstream
 * consumers (planner/CLI/audit) never present these as measured facts.
 */
export function estimateEffectedSystems(
  files: FileInventoryItem[],
): EffectedSystemEstimate[] {
  let totalBytes = 0;
  let totalFiles = 0;
  let candidateFiles = 0;

  for (const file of files) {
    totalBytes += file.size_bytes;
    totalFiles++;
    if (file.dead_code_signals.confidence >= 0.95) {
      candidateFiles++;
    }
  }

  // Heuristic only — no measured data behind these coefficients.
  const bundleReductionKb = Math.round(
    (candidateFiles / Math.max(totalFiles, 1)) * (totalBytes / 1024) * 0.3,
  );
  const ciTimeSaved = Math.round(candidateFiles * 0.8); // seconds

  return [
    {
      name: "build",
      impact: { bundle_size_reduction_est_kb: bundleReductionKb },
      heuristic: true,
    },
    {
      name: "ci",
      impact: { time_saved_seconds_est: ciTimeSaved },
      heuristic: true,
    },
    {
      name: "cognitive_load",
      impact: { files_removable: candidateFiles },
      heuristic: true,
    },
  ];
}
