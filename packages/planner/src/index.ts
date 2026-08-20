// PRUNING-PLANNER (Agent 3)
// Generates a self-contained, dependency-free HTML pruning plan from the
// reviewer + researcher handoffs. The HTML embeds an interactive checklist,
// filter chips, THREE diagram modes (radial tree / flowchart / circle pack),
// a live performance blob, a theme toggle, and PRUNE / DRY RUN / EXPORT PLAN
// controls that build a PruneManifest client-side (no network required).
//
// No CDN / external script — D3-class visualizations are hand-rendered as
// inline SVG so the artifact stays 100% offline and self-contained.

import { writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
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
  /** Attempt to open the plan in the OS browser (best-effort, non-fatal). */
  open?: boolean;
}

type PlanRow = {
  path: string;
  size: number;
  lines: number;
  confidence: number;
  group: "Auto-prune" | "Review" | "Manual" | "Protected";
  action: "delete" | "keep";
  signal: string;
  reason: string;
  imports: string[];
  importedBy: string[];
};

type PlanData = {
  target: string;
  gitCommit: string;
  date: string;
  reclaimableBytes: number;
  totalFiles: number;
  ciSecondsSaved: number;
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

function buildPlanData(
  reviewerHandoff: any,
  researcherHandoff: any,
): PlanData {
  const target = reviewerHandoff?.metadata?.target_path ?? "target";
  const gitCommit = reviewerHandoff?.metadata?.git_commit ?? "unknown";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

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
    const protectedPath =
      item.is_protected === true || isProtectedPath(item.path);
    const group = classify(confidence, protectedPath);
    const action: "delete" | "keep" =
      group === "Protected"
        ? "keep"
        : group === "Auto-prune"
          ? "delete"
          : "keep";
    const dg = (item as any)?.dependency_graph ?? {};
    return {
      path: item.path,
      size: Number(item.size_bytes) || 0,
      lines: Number(item.lines) || 0,
      confidence,
      group,
      action,
      signal: buildSignal(item),
      reason: buildReason(group, confidence),
      imports: Array.isArray(dg.imports) ? dg.imports : [],
      importedBy: Array.isArray(dg.imported_by) ? dg.imported_by : [],
    };
  });

  const reclaimableBytes = rows
    .filter((r) => r.action === "delete")
    .reduce((sum, r) => sum + r.size, 0);

  // Est. CI time saved: prefer reviewer's effected_systems "ci" estimate,
  // else derive a small heuristic from candidate count.
  let ciSecondsSaved = 0;
  const eff = Array.isArray(reviewerHandoff?.effected_systems)
    ? reviewerHandoff.effected_systems
    : [];
  const ci = eff.find((e: any) => e?.name === "ci");
  if (ci?.impact?.time_saved_seconds_est) {
    ciSecondsSaved = Number(ci.impact.time_saved_seconds_est) || 0;
  } else {
    ciSecondsSaved = Math.round(
      rows.filter((r) => r.action === "delete").length * 0.8,
    );
  }

  return {
    target: String(target),
    gitCommit: String(gitCommit),
    date: dateStr,
    reclaimableBytes,
    totalFiles: rows.length,
    ciSecondsSaved,
    rows,
  };
}

// ---------------------------------------------------------------------------
// DIAGRAM BUILDERS (inline SVG, no external libs)
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  row?: PlanRow;
}

function buildTree(rows: PlanRow[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    children: new Map(),
  };
  for (const r of rows) {
    const parts = r.path.split("/").filter(Boolean);
    let node = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      acc = acc ? `${acc}/${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: acc,
          children: new Map(),
        });
      }
      node = node.children.get(part)!;
      if (i === parts.length - 1) node.row = r;
    }
  }
  return root;
}

function colorForConfidence(c: number): string {
  if (c >= 0.95) return "var(--accent-decay)";
  if (c >= 0.7) return "var(--accent-warning)";
  return "var(--fg-muted)";
}

// Radial tree -> SVG string. Folders radiate; leaf files sit at the rim.
function renderRadialTree(rows: PlanRow[]): string {
  const root = buildTree(rows);
  const W = 900;
  const H = 620;
  const cx = W / 2;
  const cy = H / 2;
  const maxDepth = 6;
  const ringStep = Math.min(90, (Math.min(W, H) / 2 - 40) / maxDepth);

  // Collect leaves for angle allocation.
  const leaves: TreeNode[] = [];
  (function collect(n: TreeNode) {
    if (n.children.size === 0 && n.row) leaves.push(n);
    else n.children.forEach(collect);
  })(root);

  const anglePer = (Math.PI * 2) / Math.max(leaves.length, 1);
  const pos = new Map<string, { x: number; y: number; depth: number }>();

  function layout(n: TreeNode, depth: number, a0: number, a1: number) {
    const mid = (a0 + a1) / 2;
    const r = depth * ringStep + 30;
    const x = cx + Math.cos(mid) * r;
    const y = cy + Math.sin(mid) * r;
    pos.set(n.path, { x, y, depth });
    const kids = Array.from(n.children.values());
    if (kids.length === 0) return;
    const span = a1 - a0;
    let cursor = a0;
    for (const k of kids) {
      const share = span / kids.length;
      layout(k, depth + 1, cursor, cursor + share);
      cursor += share;
    }
  }
  layout(root, 0, 0, Math.PI * 2);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="diagram-svg" role="img" aria-label="Radial dependency tree">`;
  // Edges
  for (const n of pos.keys()) {
    const node = findNode(root, n);
    if (!node) continue;
    for (const child of node.children.values()) {
      const p = pos.get(child.path);
      const pp = pos.get(node.path);
      if (p && pp) {
        svg += `<line x1="${pp.x.toFixed(1)}" y1="${pp.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="var(--border-subtle)" stroke-width="1"/>`;
      }
    }
  }
  // Nodes
  for (const [p, v] of pos) {
    const node = findNode(root, p);
    if (!node) continue;
    const isLeaf = !!node.row;
    const selected = isLeaf && node.row?.action === "delete";
    const fill = isLeaf ? colorForConfidence(node.row!.confidence) : "var(--bg-elevated)";
    const r = isLeaf ? 5 : 4;
    const cls = selected ? "node selected" : "node";
    svg += `<circle class="${cls}" data-path="${escapeHtml(p)}" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="var(--border-subtle)" stroke-width="1"/>`;
    if (isLeaf) {
      svg += `<text x="${(v.x + 8).toFixed(1)}" y="${(v.y + 3).toFixed(1)}" class="node-label" font-size="9">${escapeHtml(node.name)}</text>`;
    }
  }
  svg += `</svg>`;
  return svg;
}

function findNode(root: TreeNode, p: string): TreeNode | undefined {
  if (root.path === p) return root;
  for (const c of root.children.values()) {
    const f = findNode(c, p);
    if (f) return f;
  }
  return undefined;
}

// Flowchart (Mermaid-style LR): folder nodes -> file nodes, with import edges.
function renderFlowchart(rows: PlanRow[]): string {
  const W = 900;
  const H = 620;
  const folders = new Map<string, { x: number; y: number; files: string[] }>();
  rows.forEach((r) => {
    const dir = r.path.includes("/")
      ? r.path.slice(0, r.path.lastIndexOf("/"))
      : ".";
    if (!folders.has(dir)) folders.set(dir, { x: 0, y: 0, files: [] });
    folders.get(dir)!.files.push(r.path);
  });
  const dirs = Array.from(folders.keys());
  const colX = [60, 460];
  let y = 40;
  const pos = new Map<string, { x: number; y: number }>();
  dirs.forEach((d, i) => {
    const f = folders.get(d)!;
    f.x = colX[0] ?? 60;
    f.y = y;
    pos.set(d, { x: f.x, y: f.y });
    f.files.forEach((fp, fi) => {
      y += 34;
      pos.set(fp, { x: colX[1] ?? 460, y: y });
    });
    y += 30;
  });
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="diagram-svg" role="img" aria-label="Dependency flowchart">`;
  // edges: file -> its imports (internal) that exist as nodes
  const existing = new Set(pos.keys());
  for (const r of rows) {
    const from = pos.get(r.path);
    if (!from) continue;
    for (const imp of r.imports) {
      // internal specs look like "internal:./x" or "internal:../x"
      if (typeof imp !== "string") continue;
      const spec = imp.startsWith("internal:")
        ? imp.slice("internal:".length)
        : null;
      if (!spec) continue;
      const targetRel = resolveImportRel(r.path, spec);
      if (existing.has(targetRel)) {
        const to = pos.get(targetRel)!;
        svg += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="var(--border-subtle)" stroke-width="1" marker-end="url(#arrow)"/>`;
      }
    }
    const dir = r.path.includes("/")
      ? r.path.slice(0, r.path.lastIndexOf("/"))
      : ".";
    const dp = pos.get(dir);
    if (dp) {
      svg += `<line x1="${dp.x + 70}" y1="${dp.y}" x2="${from.x - 4}" y2="${from.y}" stroke="var(--border-subtle)" stroke-width="1"/>`;
    }
  }
  svg += `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--border-subtle)"/></marker></defs>`;
  // folder nodes
  for (const d of dirs) {
    const p = pos.get(d)!;
    svg += `<g><rect x="${p.x}" y="${p.y - 12}" width="70" height="24" rx="6" fill="var(--bg-elevated)" stroke="var(--accent-data)" stroke-width="1"/><text x="${p.x + 35}" y="${p.y + 4}" text-anchor="middle" font-size="9" fill="var(--fg-primary)">${escapeHtml(d === "." ? "root" : d)}</text></g>`;
  }
  // file nodes
  for (const r of rows) {
    const p = pos.get(r.path);
    if (!p) continue;
    const selected = r.action === "delete";
    const stroke = selected ? "var(--accent-decay)" : "var(--border-subtle)";
    const fill = selected ? "rgba(248,113,113,0.15)" : "var(--bg-elevated)";
    svg += `<g class="${selected ? "node selected" : "node"}" data-path="${escapeHtml(r.path)}"><rect x="${p.x - 80}" y="${p.y - 12}" width="160" height="24" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="9" fill="var(--fg-primary)">${escapeHtml(r.path.split("/").pop() ?? r.path)}</text></g>`;
  }
  svg += `</svg>`;
  return svg;
}

function resolveImportRel(fromPath: string, spec: string): string {
  const dir = fromPath.includes("/")
    ? fromPath.slice(0, fromPath.lastIndexOf("/"))
    : "";
  const cleaned = spec.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i, "");
  if (cleaned.startsWith(".")) {
    const parts = (dir ? dir.split("/") : [])
      .concat(cleaned.split("/"))
      .filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    return stack.join("/");
  }
  return cleaned;
}

// Circle pack: folder circles containing file circles, size = bytes, color = confidence.
function renderCirclePack(rows: PlanRow[]): string {
  const W = 900;
  const H = 620;
  const folders = new Map<string, PlanRow[]>();
  rows.forEach((r) => {
    const dir = r.path.includes("/")
      ? r.path.slice(0, r.path.lastIndexOf("/"))
      : ".";
    if (!folders.has(dir)) folders.set(dir, []);
    folders.get(dir)!.push(r);
  });
  const cx = W / 2;
  const cy = H / 2;
  const dirs = Array.from(folders.entries());
  const totalFiles = rows.length || 1;
  const baseR = Math.sqrt((W * H) / Math.PI / totalFiles) * 0.9;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="diagram-svg" role="img" aria-label="Circle pack by size and confidence">`;
  const n = dirs.length || 1;
  dirs.forEach(([dir, files], i) => {
    const ang = (i / n) * Math.PI * 2;
    const dist = n === 1 ? 0 : 180;
    const fx = cx + Math.cos(ang) * dist;
    const fy = cy + Math.sin(ang) * dist;
    const folderR = Math.min(150, 30 + files.length * 9);
    svg += `<circle cx="${fx}" cy="${fy}" r="${folderR}" fill="rgba(74,222,128,0.06)" stroke="var(--accent-growth)" stroke-width="1"/><text x="${fx}" y="${fy - folderR - 4}" text-anchor="middle" font-size="10" fill="var(--fg-muted)">${escapeHtml(dir === "." ? "root" : dir)}</text>`;
    // pack files inside folder circle
    let fa = 0;
    const fileN = files.length || 1;
    for (const r of files) {
      const fr = Math.max(4, Math.sqrt(r.size || 1) / 12);
      const fra = (fa / fileN) * Math.PI * 2;
      const frx = fx + Math.cos(fra) * (folderR - fr - 4);
      const fry = fy + Math.sin(fra) * (folderR - fr - 4);
      const selected = r.action === "delete";
      const fill = colorForConfidence(r.confidence);
      svg += `<circle class="${selected ? "node selected" : "node"}" data-path="${escapeHtml(r.path)}" cx="${frx.toFixed(1)}" cy="${fry.toFixed(1)}" r="${Math.min(fr, folderR - 6).toFixed(1)}" fill="${fill}" fill-opacity="0.7" stroke="var(--border-subtle)" stroke-width="0.5"/>`;
      fa += 1;
    }
  });
  svg += `</svg>`;
  return svg;
}

// Performance "blob": an organic closed path that scales with reclaimed bytes.
function renderBlob(plan: PlanData): string {
  const scale = Math.min(1.6, 0.6 + plan.reclaimableBytes / 200000);
  const W = 220;
  const H = 160;
  const cx = W / 2;
  const cy = H / 2;
  const baseR = 48 * scale;
  const pts: string[] = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wob = 0.78 + ((i * 37) % 11) / 28; // deterministic organic wobble
    const r = baseR * wob;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.82;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const d = `M${pts[0]} ` + pts.slice(1).map((p) => `L${p}`).join(" ") + " Z";
  return `<svg viewBox="0 0 ${W} ${H}" class="blob-svg" role="img" aria-label="Reclaimed codebase mass">
    <path class="blob-path" d="${d}" fill="rgba(74,222,128,0.18)" stroke="var(--accent-growth)" stroke-width="2"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// HTML RENDERING
// ---------------------------------------------------------------------------

function renderHtml(plan: PlanData): string {
  const planJson = JSON.stringify(plan).replace(/</g, "\\u003c");

  const chips = ["All", "Auto-prune", "Review", "Manual", "Protected"]
    .map((g) => {
      const active = g === "All" ? "active" : "";
      return `<button class="chip ${active}" data-group="${escapeHtml(g)}" role="tab" aria-selected="${g === "All"}">${escapeHtml(g)}</button>`;
    })
    .join("\n");

  const treeSvg = renderRadialTree(plan.rows);
  const flowSvg = renderFlowchart(plan.rows);
  const packSvg = renderCirclePack(plan.rows);
  const blobSvg = renderBlob(plan);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Surgical Pruning Plan — ${escapeHtml(plan.target)}</title>
<style>
  :root {
    /* FUTURISTIC NATURE (default) */
    --bg-deep: #0a0f0d;
    --bg-surface: #111814;
    --bg-elevated: #1a241f;
    --fg-primary: #e8f5e9;
    --fg-muted: #8ecaa8;
    --accent-growth: #4ade80;
    --accent-decay: #f87171;
    --accent-data: #60a5fa;
    --accent-warning: #fbbf24;
    --border-subtle: #2a3a30;
    --glow-subtle: rgba(74,222,128,0.15);
    --glow-strong: rgba(74,222,128,0.35);
    --font-mono: 'JetBrains Mono', ui-monospace, 'Fira Code', monospace;
    --font-ui: 'IBM Plex Sans', system-ui, sans-serif;
    --transition-fast: 120ms cubic-bezier(0.2,0.8,0.2,1);
    --transition-smooth: 300ms cubic-bezier(0.16,1,0.3,1);
  }
  [data-theme="space"] {
    --bg-deep: #05060f; --bg-surface: #0d1024; --bg-elevated: #161a36;
    --fg-primary: #eaf0ff; --fg-muted: #8a93c8; --accent-growth: #7c5cff;
    --accent-decay: #ff5c8a; --accent-data: #4cc9f0; --accent-warning: #ffd166;
    --border-subtle: #252a4a; --glow-subtle: rgba(124,92,255,0.15); --glow-strong: rgba(124,92,255,0.35);
  }
  [data-theme="contrast"] {
    --bg-deep: #000; --bg-surface: #000; --bg-elevated: #111;
    --fg-primary: #fff; --fg-muted: #ff0; --accent-growth: #0f0; --accent-decay: #f00;
    --accent-data: #0ff; --accent-warning: #ff0; --border-subtle: #fff;
    --glow-subtle: rgba(255,255,0,0.2); --glow-strong: rgba(255,255,0,0.4);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: var(--font-ui);
    background: radial-gradient(1200px 600px at 70% -10%, var(--bg-surface) 0%, var(--bg-deep) 60%);
    color: var(--fg-primary); min-height: 100vh; padding: 24px 16px 64px;
  }
  .wrap { max-width: 1200px; margin: 0 auto; }
  header { display:flex; flex-wrap:wrap; align-items:flex-end; gap:16px; justify-content:space-between; margin-bottom:16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--fg-muted); font-size: 13px; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; }
  .stat { background: var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; padding:8px 12px; min-width:110px; }
  .stat .k { font-size:10px; color: var(--fg-muted); text-transform:uppercase; letter-spacing:.6px; }
  .stat .v { font-size:16px; font-weight:600; margin-top:2px; }
  .stat .v.accent { color: var(--accent-growth); }
  .toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding:12px 14px; border-bottom:1px solid var(--border-subtle); }
  .chips { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { background: var(--bg-elevated); color: var(--fg-muted); border:1px solid var(--border-subtle); border-radius:999px; padding:5px 13px; font-size:12px; cursor:pointer; transition: all var(--transition-fast); }
  .chip:hover { color: var(--fg-primary); }
  .chip.active { background: var(--accent-growth); color:#04130a; border-color: var(--accent-growth); font-weight:600; }
  .spacer { flex:1; }
  button.action { border:none; border-radius:10px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; color:#04130a; }
  .btn-prune { background: var(--accent-decay); }
  .btn-dry { background: var(--accent-data); }
  .btn-export { background: var(--accent-growth); }
  .theme-toggle { background: var(--bg-elevated); color: var(--fg-muted); border:1px solid var(--border-subtle); border-radius:8px; padding:6px 10px; font-size:12px; cursor:pointer; }
  .summary { padding:8px 14px; font-size:13px; color: var(--accent-growth); min-height:18px; }
  .panel { background: var(--bg-surface); border:1px solid var(--border-subtle); border-radius:14px; box-shadow: 0 8px 30px rgba(0,0,0,0.45); overflow:hidden; margin-bottom:16px; }
  .diagram-tabs { display:flex; gap:8px; padding:12px 14px 0; }
  .diag-tab { background: var(--bg-elevated); color: var(--fg-muted); border:1px solid var(--border-subtle); border-radius:8px 8px 0 0; padding:7px 14px; font-size:12px; cursor:pointer; }
  .diag-tab[aria-selected="true"] { color: var(--fg-primary); border-bottom-color: var(--bg-surface); background: var(--bg-surface); }
  .diagram-wrap { padding:8px 14px 14px; }
  .diagram-svg { width:100%; height:auto; max-height:640px; background: var(--bg-deep); border-radius:10px; border:1px solid var(--border-subtle); }
  .node.selected { stroke: var(--accent-decay) !important; stroke-width:2.5px !important; filter: drop-shadow(0 0 8px var(--accent-decay)); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
  .node-label { fill: var(--fg-muted); }
  .blob-wrap { display:flex; gap:16px; align-items:center; padding:10px 14px; border-top:1px solid var(--border-subtle); }
  .blob-svg { width:200px; height:150px; }
  .blob-meta { font-size:12px; color: var(--fg-muted); }
  .blob-path { animation: morph 6s ease-in-out infinite; }
  @keyframes morph { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  .list-head, .row { display:grid; grid-template-columns: 36px 1fr 90px 70px 70px 1fr 110px 40px; gap:8px; align-items:center; padding:6px 14px; }
  .list-head { color: var(--fg-muted); font-size:11px; text-transform:uppercase; letter-spacing:.4px; border-bottom:1px solid var(--border-subtle); }
  .viewport { height: 460px; overflow-y:auto; position:relative; border-top:1px solid var(--border-subtle); }
  .spacer-inner { position:relative; }
  .row { position:absolute; left:0; right:0; font-size:13px; border-bottom:1px solid var(--bg-elevated); }
  .row:hover { background: var(--bg-elevated); }
  .row .path { font-family: var(--font-mono); word-break: break-all; }
  .row .num { text-align:right; color: var(--fg-muted); white-space:nowrap; }
  .row .exp { text-align:center; }
  .expbtn { background:none; border:none; cursor:pointer; font-size:14px; }
  .detail { grid-column: 1 / -1; font-size:12px; color: var(--fg-muted); padding:6px 8px; background: var(--bg-deep); border-radius:8px; }
  .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; }
  .badge-autoprune { background: rgba(248,113,113,0.16); color: var(--accent-decay); }
  .badge-review { background: rgba(251,191,36,0.16); color: var(--accent-warning); }
  .badge-manual { background: rgba(142,202,168,0.16); color: var(--fg-muted); }
  .badge-protected { background: rgba(74,222,128,0.16); color: var(--accent-growth); }
  footer { color: var(--fg-muted); font-size:11px; margin-top:16px; text-align:center; }
  .modal { position:fixed; inset:0; background: rgba(0,0,0,0.6); display:none; align-items:center; justify-content:center; z-index:50; }
  .modal.show { display:flex; }
  .modal-box { background: var(--bg-surface); border:1px solid var(--accent-growth); border-radius:14px; padding:24px 28px; text-align:center; max-width:380px; }
  .modal-box h3 { margin:0 0 8px; color: var(--accent-growth); }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>SURGICAL PRUNING — ${escapeHtml(plan.target)} — ${escapeHtml(plan.date)}</h1>
      <div class="sub">git: ${escapeHtml(plan.gitCommit)}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">Files Scanned</div><div class="v">${plan.totalFiles}</div></div>
      <div class="stat"><div class="k">Candidates</div><div class="v">${plan.rows.filter((r) => r.action === "delete").length}</div></div>
      <div class="stat"><div class="k">Est. Reclaimed</div><div class="v accent">${(plan.reclaimableBytes / 1024).toFixed(1)} KB</div></div>
      <div class="stat"><div class="k">Est. CI Saved</div><div class="v">${plan.ciSecondsSaved}s</div></div>
    </div>
  </header>

  <div class="panel">
    <div class="toolbar">
      <div class="chips" role="tablist" aria-label="Filter by group">${chips}</div>
      <div class="spacer"></div>
      <button class="theme-toggle" id="themeBtn" aria-label="Toggle theme">🌿 Nature</button>
      <button class="action btn-export" id="exportBtn">EXPORT PLAN</button>
      <button class="action btn-dry" id="dryBtn">DRY RUN</button>
      <button class="action btn-prune" id="pruneBtn">PRUNE</button>
    </div>
    <div class="summary" id="summary"></div>

    <div class="diagram-tabs" role="tablist" aria-label="Diagram mode">
      <button class="diag-tab" role="tab" aria-selected="true" data-diag="tree">TREE</button>
      <button class="diag-tab" role="tab" aria-selected="false" data-diag="mermaid">MERMAID</button>
      <button class="diag-tab" role="tab" aria-selected="false" data-diag="circle">CIRCLE</button>
    </div>
    <div class="diagram-wrap">
      <div data-diagpane="tree">${treeSvg}</div>
      <div data-diagpane="mermaid" hidden>${flowSvg}</div>
      <div data-diagpane="circle" hidden>${packSvg}</div>
    </div>
    <div class="blob-wrap">
      ${blobSvg}
      <div class="blob-meta">
        <b>Codebase mass reclaimed.</b><br>
        ${plan.rows.filter((r) => r.action === "delete").length} file(s) · ${(plan.reclaimableBytes / 1024).toFixed(1)} KB · ${plan.ciSecondsSaved}s CI.<br>
        Blob morphs with selection — tick checkboxes to watch it shrink.
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="list-head" role="listbox" aria-label="Pruning checklist">
      <div></div><div>Path</div><div>Size</div><div>Lines</div><div>Conf</div><div>Signals</div><div>Group</div><div></div>
    </div>
    <div class="viewport" id="viewport">
      <div class="spacer-inner" id="spacer"></div>
    </div>
  </div>

  <footer>Self-contained pruning plan · built by @surgical-pruning/planner</footer>
</div>

<div class="modal" id="modal" role="dialog" aria-modal="true">
  <div class="modal-box">
    <h3>Handoff initiated</h3>
    <div>Execution Guardians activated. PRUNE_MANIFEST posted to parent window.</div>
    <button class="action btn-dry" id="modalClose" style="margin-top:14px">Close</button>
  </div>
</div>

<script id="plan-data" type="application/json">${planJson}</script>
<script>
(function () {
  var PLAN = JSON.parse(document.getElementById("plan-data").textContent);
  var GROUPS = ["Auto-prune", "Review", "Manual", "Protected"];
  var active = {};
  GROUPS.forEach(function (g) { active[g] = true; });
  var ROW_H = 40;
  var spacer = document.getElementById("spacer");
  var viewport = document.getElementById("viewport");

  function visibleRows() {
    var scrollTop = viewport.scrollTop;
    var vh = viewport.clientHeight;
    var start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4);
    var end = Math.min(PLAN.rows.length, Math.ceil((scrollTop + vh) / ROW_H) + 4);
    return [start, end];
  }

  function rowHtml(r, i) {
    var checked = r.action === "delete" ? "checked" : "";
    var disabled = r.group === "Protected" ? "disabled" : "";
    var imp = r.imports.length ? r.imports.join(", ") : "none";
    var impBy = r.importedBy.length ? r.importedBy.join(", ") : "none";
    return '<div class="row" data-group="'+escapeAttr(r.group)+'" data-path="'+escapeAttr(r.path)+'" data-index="'+i+'" style="top:'+(i*ROW_H)+'px;height:'+ROW_H+'px">'+
      '<div class="cell c"><input type="checkbox" id="cb'+i+'" '+checked+' '+disabled+'></div>'+
      '<div class="cell path">'+escapeHtml(r.path)+'</div>'+
      '<div class="cell num">'+r.size.toLocaleString()+' B</div>'+
      '<div class="cell num">'+r.lines+' L</div>'+
      '<div class="cell num">'+Math.round(r.confidence*100)+'%</div>'+
      '<div class="cell"><span class="signal">'+escapeHtml(r.signal)+'</span></div>'+
      '<div class="cell"><span class="badge badge-'+r.group.toLowerCase().replace(/[^a-z]/g,"")+'">'+escapeHtml(r.group)+'</span></div>'+
      '<div class="cell exp"><button class="expbtn" aria-label="Expand details" aria-expanded="false">🔍</button></div>'+
      '<div class="detail" hidden><div><b>Imports:</b> '+escapeHtml(imp)+'</div><div><b>Imported by:</b> '+escapeHtml(impBy)+'</div><div><b>Reason:</b> '+escapeHtml(r.reason)+'</div></div>'+
    '</div>';
  }

  function escapeHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function escapeAttr(s){return escapeHtml(s);}

  function renderList() {
    var range = visibleRows();
    var html = "";
    for (var i = range[0]; i < range[1]; i++) {
      html += rowHtml(PLAN.rows[i], i);
    }
    spacer.style.height = (PLAN.rows.length * ROW_H) + "px";
    spacer.innerHTML = html;
    applyFilters();
  }

  function applyFilters() {
    var rows = spacer.querySelectorAll(".row");
    for (var i = 0; i < rows.length; i++) {
      var g = rows[i].getAttribute("data-group");
      rows[i].style.display = active[g] ? "" : "none";
    }
  }

  viewport.addEventListener("scroll", function () { renderList(); });

  // Expand detail
  spacer.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".expbtn") : null;
    if (!btn) return;
    var row = btn.closest(".row");
    var det = row.querySelector(".detail");
    var open = det.hasAttribute("hidden");
    if (open) det.removeAttribute("hidden"); else det.setAttribute("hidden","");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Checkbox -> diagram highlight sync
  spacer.addEventListener("change", function (e) {
    if (!e.target.matches || !e.target.matches('input[type=checkbox]')) return;
    var row = e.target.closest(".row");
    var p = row.getAttribute("data-path");
    var nodes = document.querySelectorAll('.diagram-svg [data-path="'+cssEscape(p)+'"]');
    nodes.forEach(function (n) {
      if (e.target.checked) n.classList.add("selected");
      else n.classList.remove("selected");
    });
  });

  function cssEscape(s){ return s.replace(/["\\\\]/g, "\\$&"); }

  // Filter chips
  var chips = document.querySelectorAll(".chip");
  for (var c = 0; c < chips.length; c++) {
    chips[c].addEventListener("click", function () {
      var g = this.getAttribute("data-group");
      if (g === "All") { GROUPS.forEach(function (x) { active[x] = true; }); }
      else { active[g] = !active[g]; }
      for (var k = 0; k < chips.length; k++) {
        var cg = chips[k].getAttribute("data-group");
        chips[k].classList.toggle("active", cg === "All" ? GROUPS.every(function(x){return active[x];}) : !!active[cg]);
        chips[k].setAttribute("aria-selected", chips[k].classList.contains("active") ? "true" : "false");
      }
      applyFilters();
    });
  }

  // Diagram tabs
  var diagTabs = document.querySelectorAll(".diag-tab");
  for (var t = 0; t < diagTabs.length; t++) {
    diagTabs[t].addEventListener("click", function () {
      var d = this.getAttribute("data-diag");
      for (var k = 0; k < diagTabs.length; k++) {
        var sel = diagTabs[k].getAttribute("data-diag") === d;
        diagTabs[k].setAttribute("aria-selected", sel ? "true" : "false");
        document.querySelector('[data-diagpane="'+diagTabs[k].getAttribute("data-diag")+'"]').hidden = !sel;
      }
    });
  }

  // Theme toggle
  var themes = ["nature", "space", "contrast"];
  var themeLabels = { nature: "🌿 Nature", space: "🌌 Deep Space", contrast: "⚫ High Contrast" };
  var ti = 0;
  var themeBtn = document.getElementById("themeBtn");
  themeBtn.addEventListener("click", function () {
    ti = (ti + 1) % themes.length;
    document.body.setAttribute("data-theme", themes[ti]);
    themeBtn.textContent = themeLabels[themes[ti]];
    try { localStorage.setItem("sp-theme", themes[ti]); } catch (e) {}
  });
  try { var saved = localStorage.getItem("sp-theme"); if (saved) { ti = themes.indexOf(saved); document.body.setAttribute("data-theme", saved); themeBtn.textContent = themeLabels[saved]; } } catch (e) {}

  function buildManifest(dryRun) {
    var selected = [];
    var protectedSkipped = [];
    var bytes = 0, files = 0;
    for (var i = 0; i < PLAN.rows.length; i++) {
      var r = PLAN.rows[i];
      if (r.group === "Protected") { protectedSkipped.push(r.path); continue; }
      var cb = document.getElementById("cb" + i);
      var checked = cb ? cb.checked : (r.action === "delete");
      var action = checked ? "delete" : "keep";
      if (action === "delete") { bytes += r.size; files += 1; }
      selected.push({ path: r.path, action: action, confidence: r.confidence, reason: r.reason });
    }
    return {
      timestamp: new Date().toISOString(),
      target_path: PLAN.target,
      git_commit: PLAN.gitCommit,
      selected_files: selected,
      protected_skipped: protectedSkipped,
      estimated_reclamation: { bytes: bytes, files: files, ci_seconds: ${plan.ciSecondsSaved} },
      safety: { dry_run: dryRun, stash_created: false, rollback_script: "" }
    };
  }

  function runPrune(dryRun) {
    var m = buildManifest(dryRun);
    var del = m.estimated_reclamation;
    console.log("[PRUNING-PLANNER] " + (dryRun ? "DRY RUN" : "PRUNE") + " — files: " + del.files + ", bytes: " + del.bytes);
    document.getElementById("summary").textContent =
      (dryRun ? "DRY RUN" : "PRUNE") + ": " + del.files + " file(s), " + del.bytes.toLocaleString() + " bytes" + (dryRun ? " (no changes written)" : "");
    return m;
  }

  function exportPlan() {
    var m = buildManifest(false);
    var blob = new Blob([JSON.stringify(m, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "PRUNE_MANIFEST.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function showModal() { document.getElementById("modal").classList.add("show"); }
  document.getElementById("modalClose").addEventListener("click", function () { document.getElementById("modal").classList.remove("show"); });

  document.getElementById("pruneBtn").addEventListener("click", function () {
    var m = runPrune(false);
    try { window.parent.postMessage({ type: "PRUNE_TRIGGER", payload: m }, "*"); } catch (e) {}
    showModal();
  });
  document.getElementById("dryBtn").addEventListener("click", function () { runPrune(true); });
  document.getElementById("exportBtn").addEventListener("click", exportPlan);

  renderList();
})();
</script>
</body>
</html>`;
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
    estimated_reclamation: {
      bytes,
      files,
      ci_seconds: plan.ciSecondsSaved,
    },
    safety: { dry_run: dryRun, stash_created: false, rollback_script: "" },
  };
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

  // Spec deviation note: also persist into .prune/ so the plan lives beside
  // the other agent artifacts (handoffs, manifest, reports).
  const pruneDir = path.join(cwd, ".prune");
  await mkdir(pruneDir, { recursive: true });
  const planHtmlInPrune = path.join(
    pruneDir,
    `surgical-pruning-${mmdd}-${targetName}.html`,
  );
  await writeFile(planHtmlInPrune, html, "utf8");

  // Side artifact: persist the plan as a machine-readable PRUNE_MANIFEST.json
  // in .prune/ so the unattended CLI can apply it via the explicit --execute
  // flag. This is the *plan*, not an authorization to delete; execution stays
  // gated.
  const dryRun = options?.dryRun ?? true;
  const manifest = buildManifest(plan, dryRun);
  const manifestAbsPath = path.join(pruneDir, "PRUNE_MANIFEST.json");
  await writeFile(manifestAbsPath, JSON.stringify(manifest, null, 2), "utf8");

  // Best-effort: open the plan in the OS browser (non-fatal in headless envs).
  if (options?.open) {
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    try {
      spawn(cmd, [absPath], { detached: true, stdio: "ignore" }).unref();
    } catch {
      /* ignore */
    }
  }

  return absPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPlanner({
    reviewerHandoff: {
      metadata: { target_path: process.cwd(), git_commit: "unknown" },
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
