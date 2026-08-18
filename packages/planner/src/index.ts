// PRUNING-PLANNER (Agent 3)
// Generates a self-contained, dependency-free HTML pruning plan from the
// reviewer + researcher handoffs. The HTML embeds an interactive checklist,
// filter chips, and PRUNE / DRY RUN / EXPORT PLAN controls that build a
// PruneManifest client-side (no network required).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CONFIDENCE_THRESHOLDS, PROTECTED_PATHS } from "@surgical-pruning/core";
import type {
  HandoffReviewer,
  HandoffResearcher,
  FileInventoryItem,
  PruneManifest,
  SelectedFile,
} from "@surgical-pruning/core";

export interface PlannerOptions {
  reviewerHandoff: any;
  researcherHandoff: any;
  cwd?: string;
  /** When true, the persisted PRUNE_MANIFEST.json marks safety.dry_run. */
  dryRun?: boolean;
}

type PlanRow = {
  path: string;
  size: number;
  confidence: number;
  group: "Auto-prune" | "Review" | "Manual" | "Protected";
  action: "delete" | "keep";
  signal: string;
  reason: string;
};

type PlanData = {
  target: string;
  gitCommit: string;
  reclaimableBytes: number;
  totalFiles: number;
  rows: PlanRow[];
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function isProtectedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  return PROTECTED_PATHS.some((pattern) => {
    if (pattern.endsWith("/")) {
      return (
        normalized === pattern ||
        normalized.startsWith(pattern) ||
        normalized.includes("/" + pattern)
      );
    }
    if (pattern.includes("*")) {
      const re = new RegExp(
        "^" + pattern.split("*").map(escapeRe).join(".*") + "$",
      );
      return re.test(normalized) || re.test(base);
    }
    return (
      normalized === pattern ||
      base === pattern ||
      normalized.endsWith("/" + pattern)
    );
  });
}

function buildSignal(item: FileInventoryItem): string {
  const d = item.dead_code_signals ?? ({} as any);
  const parts: string[] = [];
  if (Array.isArray(d.unused_exports) && d.unused_exports.length) {
    parts.push(`${d.unused_exports.length} unused export(s)`);
  }
  if (d.zero_references) parts.push("0 references");
  if (d.unreachable) parts.push("unreachable");
  return parts.length ? parts.join(", ") : "no signals";
}

function buildReason(group: PlanRow["group"], confidence: number): string {
  const pct = Math.round(confidence * 100);
  if (group === "Protected") return "Protected path — never pruned";
  if (group === "Auto-prune")
    return `High-confidence dead code (${pct}% confidence)`;
  if (group === "Review") return `Needs manual review (${pct}% confidence)`;
  return `Low confidence (${pct}%) — manual only`;
}

function classify(
  confidence: number,
  protectedPath: boolean,
): PlanRow["group"] {
  if (protectedPath) return "Protected";
  if (confidence >= CONFIDENCE_THRESHOLDS.AUTO_PRUNE) return "Auto-prune";
  if (confidence >= CONFIDENCE_THRESHOLDS.REVIEW_REQUIRED) return "Review";
  return "Manual";
}

function groupClass(g: string): string {
  return g.toLowerCase().replace(/[^a-z]/g, "");
}

function buildPlanData(reviewerHandoff: any, researcherHandoff: any): PlanData {
  const target = reviewerHandoff?.metadata?.target_path ?? "target";
  const gitCommit = reviewerHandoff?.metadata?.git_commit ?? "unknown";
  const aggressiveness =
    researcherHandoff?.user_prompt_analysis?.aggressiveness ?? "moderate";

  const inventory: FileInventoryItem[] = Array.isArray(
    reviewerHandoff?.file_inventory,
  )
    ? reviewerHandoff.file_inventory
    : [];

  const rows: PlanRow[] = inventory.map((item) => {
    const rawConf = (item as any)?.dead_code_signals?.confidence;
    const confidence =
      typeof rawConf === "number" && !Number.isNaN(rawConf) ? rawConf : 0;
    const protectedPath = isProtectedPath(item.path);
    const group = classify(confidence, protectedPath);
    const action: "delete" | "keep" =
      group === "Protected"
        ? "keep"
        : group === "Auto-prune"
          ? "delete"
          : "keep";
    return {
      path: item.path,
      size: Number(item.size_bytes) || 0,
      confidence,
      group,
      action,
      signal: buildSignal(item),
      reason: buildReason(group, confidence),
    };
  });

  const reclaimableBytes = rows
    .filter((r) => r.action === "delete")
    .reduce((sum, r) => sum + r.size, 0);

  return {
    target: String(target),
    gitCommit: String(gitCommit),
    reclaimableBytes,
    totalFiles: rows.length,
    rows,
  };
}

// Server-side manifest builder: the unattended CLI mirror of the interactive
// browser buildManifest(). Produces the PruneManifest that Executor/Verifier
// consume. Marked as a dry-run plan until an explicit --execute authorizes it.
function buildManifest(plan: PlanData, dryRun: boolean): PruneManifest {
  const selected_files: SelectedFile[] = [];
  const protected_skipped: string[] = [];
  let bytes = 0;
  let files = 0;
  for (const r of plan.rows) {
    if (r.group === "Protected") {
      protected_skipped.push(r.path);
      continue;
    }
    const action: "delete" | "keep" = r.action;
    if (action === "delete") {
      bytes += r.size;
      files += 1;
    }
    selected_files.push({
      path: r.path,
      action,
      confidence: r.confidence,
      reason: r.reason,
    });
  }
  return {
    timestamp: new Date().toISOString(),
    target_path: plan.target,
    git_commit: plan.gitCommit,
    selected_files,
    protected_skipped,
    estimated_reclamation: { bytes, files, ci_seconds: 0 },
    safety: { dry_run: dryRun, stash_created: false, rollback_script: "" },
  };
}

function renderHtml(plan: PlanData): string {
  const planJson = JSON.stringify(plan).replace(/</g, "\\u003c");

  const chips = ["All", "Auto-prune", "Review", "Manual", "Protected"]
    .map((g) => {
      const active = g === "All" ? "active" : "";
      return `<button class="chip ${active}" data-group="${escapeHtml(g)}">${escapeHtml(g)}</button>`;
    })
    .join("\n");

  const rowsHtml = plan.rows
    .map((r, i) => {
      const checked = r.action === "delete" ? "checked" : "";
      const disabled = r.group === "Protected" ? "disabled" : "";
      return `<tr data-group="${escapeHtml(r.group)}">
      <td class="c"><input type="checkbox" id="cb${i}" ${checked} ${disabled}></td>
      <td class="path">${escapeHtml(r.path)}</td>
      <td class="num">${r.size.toLocaleString()} B</td>
      <td class="num">${Math.round(r.confidence * 100)}%</td>
      <td><span class="signal">${escapeHtml(r.signal)}</span></td>
      <td><span class="badge badge-${groupClass(r.group)}">${escapeHtml(r.group)}</span></td>
    </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Surgical Pruning Plan — ${escapeHtml(plan.target)}</title>
<style>
  :root {
    --bg: #0b0e17;
    --bg-2: #121726;
    --bg-3: #1a2236;
    --fg: #e6ecff;
    --muted: #8b97b8;
    --accent: #6ea8fe;
    --accent-2: #4cc9b0;
    --danger: #ff6b6b;
    --warn: #ffd166;
    --ok: #4cc9b0;
    --border: #232c44;
    --shadow: 0 8px 30px rgba(0,0,0,0.45);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 70% -10%, #16203a 0%, var(--bg) 60%);
    color: var(--fg);
    min-height: 100vh;
    padding: 32px 20px 64px;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  header {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px;
    justify-content: space-between; margin-bottom: 20px;
  }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.3px; }
  .sub { color: var(--muted); font-size: 13px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 12px; padding: 10px 14px; min-width: 120px;
  }
  .stat .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }
  .stat .v { font-size: 18px; font-weight: 600; margin-top: 2px; }
  .stat .v.accent { color: var(--accent-2); }
  .panel {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 14px; box-shadow: var(--shadow); overflow: hidden;
  }
  .toolbar {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
  }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip {
    background: var(--bg-3); color: var(--muted); border: 1px solid var(--border);
    border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer;
    transition: all 0.15s ease;
  }
  .chip:hover { color: var(--fg); }
  .chip.active { background: var(--accent); color: #06101f; border-color: var(--accent); font-weight: 600; }
  .spacer { flex: 1; }
  button.action {
    border: none; border-radius: 10px; padding: 9px 16px; font-size: 13px;
    font-weight: 600; cursor: pointer; color: #06101f;
  }
  .btn-prune { background: var(--danger); }
  .btn-dry { background: var(--warn); }
  .btn-export { background: var(--accent); }
  .summary { padding: 10px 16px; font-size: 13px; color: var(--accent-2); min-height: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th {
    text-align: left; padding: 10px 14px; color: var(--muted);
    border-bottom: 1px solid var(--border); font-weight: 600; position: sticky; top: 0;
    background: var(--bg-2);
  }
  tbody td { padding: 9px 14px; border-bottom: 1px solid var(--bg-3); vertical-align: middle; }
  tbody tr:hover { background: var(--bg-3); }
  td.c { width: 36px; text-align: center; }
  td.path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  td.num { text-align: right; color: var(--muted); white-space: nowrap; }
  .signal { color: var(--muted); font-size: 12px; }
  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
  }
  .badge-autoprune { background: rgba(255,107,107,0.16); color: var(--danger); }
  .badge-review { background: rgba(255,209,102,0.16); color: var(--warn); }
  .badge-manual { background: rgba(139,151,184,0.16); color: var(--muted); }
  .badge-protected { background: rgba(76,201,176,0.16); color: var(--ok); }
  footer { color: var(--muted); font-size: 11px; margin-top: 16px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Surgical Pruning Plan</h1>
      <div class="sub">Target: <code>${escapeHtml(plan.target)}</code> · git: ${escapeHtml(plan.gitCommit)}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">Candidate files</div><div class="v">${plan.totalFiles}</div></div>
      <div class="stat"><div class="k">Reclaimable</div><div class="v accent">${plan.reclaimableBytes.toLocaleString()} B</div></div>
    </div>
  </header>

  <div class="panel">
    <div class="toolbar">
      <div class="chips">${chips}</div>
      <div class="spacer"></div>
      <button class="action btn-export" id="exportBtn">EXPORT PLAN</button>
      <button class="action btn-dry" id="dryBtn">DRY RUN</button>
      <button class="action btn-prune" id="pruneBtn">PRUNE</button>
    </div>
    <div class="summary" id="summary"></div>
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Path</th>
          <th style="text-align:right">Size</th>
          <th style="text-align:right">Confidence</th>
          <th>Signals</th>
          <th>Group</th>
        </tr>
      </thead>
      <tbody>
${rowsHtml}
      </tbody>
    </table>
  </div>
  <footer>Self-contained pruning plan · built by @surgical-pruning/planner</footer>
</div>

<script id="plan-data" type="application/json">${planJson}</script>
<script>
(function () {
  var PLAN = JSON.parse(document.getElementById("plan-data").textContent);
  var GROUPS = ["Auto-prune", "Review", "Manual", "Protected"];
  var active = {};
  GROUPS.forEach(function (g) { active[g] = true; });

  function applyFilters() {
    var rows = document.querySelectorAll("tr[data-group]");
    for (var i = 0; i < rows.length; i++) {
      var g = rows[i].getAttribute("data-group");
      rows[i].style.display = active[g] ? "" : "none";
    }
  }

  function syncChips() {
    var chips = document.querySelectorAll(".chip");
    for (var c = 0; c < chips.length; c++) {
      var g = chips[c].getAttribute("data-group");
      if (g === "All") {
        var allOn = GROUPS.every(function (x) { return active[x]; });
        chips[c].classList.toggle("active", allOn);
      } else {
        chips[c].classList.toggle("active", !!active[g]);
      }
    }
  }

  var chips = document.querySelectorAll(".chip");
  for (var c = 0; c < chips.length; c++) {
    chips[c].addEventListener("click", function () {
      var g = this.getAttribute("data-group");
      if (g === "All") {
        GROUPS.forEach(function (x) { active[x] = true; });
      } else {
        active[g] = !active[g];
      }
      syncChips();
      applyFilters();
    });
  }

  function buildManifest(dryRun) {
    var selected = [];
    var protectedSkipped = [];
    var bytes = 0;
    var files = 0;
    for (var i = 0; i < PLAN.rows.length; i++) {
      var r = PLAN.rows[i];
      if (r.group === "Protected") {
        protectedSkipped.push(r.path);
        continue;
      }
      var cb = document.getElementById("cb" + i);
      var checked = cb ? cb.checked : (r.action === "delete");
      var action = checked ? "delete" : "keep";
      if (action === "delete") {
        bytes += r.size;
        files += 1;
      }
      selected.push({
        path: r.path,
        action: action,
        confidence: r.confidence,
        reason: r.reason
      });
    }
    return {
      timestamp: new Date().toISOString(),
      target_path: PLAN.target,
      git_commit: PLAN.gitCommit,
      selected_files: selected,
      protected_skipped: protectedSkipped,
      estimated_reclamation: { bytes: bytes, files: files, ci_seconds: 0 },
      safety: { dry_run: dryRun, stash_created: false, rollback_script: "" }
    };
  }

  function runPrune(dryRun) {
    var PRUNE_MANIFEST = buildManifest(dryRun);
    var del = PRUNE_MANIFEST.estimated_reclamation;
    console.log("[PRUNING-PLANNER] " + (dryRun ? "DRY RUN" : "PRUNE") +
      " — files: " + del.files + ", bytes: " + del.bytes);
    document.getElementById("summary").textContent =
      (dryRun ? "DRY RUN" : "PRUNE") + ": " + del.files + " file(s), " +
      del.bytes.toLocaleString() + " bytes" +
      (dryRun ? " (no changes written)" : "");
    return PRUNE_MANIFEST;
  }

  function exportPlan() {
    var m = buildManifest(false);
    var blob = new Blob([JSON.stringify(m, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "PRUNE_MANIFEST.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById("pruneBtn").addEventListener("click", function () { runPrune(false); });
  document.getElementById("dryBtn").addEventListener("click", function () { runPrune(true); });
  document.getElementById("exportBtn").addEventListener("click", exportPlan);

  applyFilters();
})();
</script>
</body>
</html>`;
}

export async function runPlanner(options: PlannerOptions): Promise<string> {
  const reviewerHandoff = options?.reviewerHandoff ?? {};
  const researcherHandoff = options?.researcherHandoff ?? {};
  const cwd = options?.cwd ?? process.cwd();

  const plan = buildPlanData(reviewerHandoff, researcherHandoff);

  const targetName =
    path.basename(String(plan.target).replace(/[/\\]+$/, "")) || "target";
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const mmdd = `${mm}${dd}`;

  const fileName = `surgical-pruning-${mmdd}-${targetName}.html`;
  const absPath = path.resolve(cwd, fileName);

  const html = renderHtml(plan);

  await mkdir(cwd, { recursive: true });
  await writeFile(absPath, html, "utf8");

  // Side artifact: persist the plan as a machine-readable PRUNE_MANIFEST.json in
  // .prune/ so the unattended CLI can apply it via the explicit --execute flag.
  // This is the *plan*, not an authorization to delete; execution stays gated.
  const dryRun = options?.dryRun ?? true;
  const manifest = buildManifest(plan, dryRun);
  const pruneDir = path.join(cwd, ".prune");
  await mkdir(pruneDir, { recursive: true });
  const manifestAbsPath = path.join(pruneDir, "PRUNE_MANIFEST.json");
  await writeFile(manifestAbsPath, JSON.stringify(manifest, null, 2), "utf8");

  return absPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPlanner({
    reviewerHandoff: {
      metadata: {
        target_path: process.cwd(),
        git_commit: "unknown",
      },
      file_inventory: [],
    },
    researcherHandoff: {},
  })
    .then((out) => console.log(`[PRUNING-PLANNER] Wrote plan: ${out}`))
    .catch((err) => {
      console.error("[PRUNING-PLANNER] error:", err);
      process.exit(1);
    });
}
