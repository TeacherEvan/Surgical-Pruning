# Surgical Pruning — Multi-Agent Codebase Hygiene System

> **Automated, auditable, and safe dead-code removal for modern codebases.**  
> A multi-agent orchestration specification that transforms codebase pruning from a risky manual task into a surgical, verifiable operation.

---

## 🎯 Overview

Surgical Pruning is a **multi-agent workflow specification** for identifying, validating, and removing dead code, unused dependencies, and architectural bloat from software projects. It replaces ad-hoc cleanup with a structured pipeline:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  REVIEWER    │──▶│  RESEARCHER  │──▶│  PLANNER     │──▶│  EXECUTORS   │
│  (Cartographer)│  │ (Investigator)│  │ (HTML Interface)│  │ (Guardians)  │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
       │               │               │               │
       ▼               ▼               ▼               ▼
  Dependency      Best practices   Interactive     Atomic deletions
  mapping &       & tooling        checklist with  with git stash
  dead-code       recommendations  live metrics    checkpoints &
  signals         per language     & confidence    rollback scripts
```

**Post-execution agents** (parallel):

- **Debriefer** — Human-readable summary
- **Codebase Auditor** — Deep health check
- **Researcher (v2)** — Improvement suggestions based on audit findings

---

## ⚡ Quick Start

```bash
# Clone and explore the specification
git clone https://github.com/TeacherEvan/Surgical-Pruning.git
cd Surgical-Pruning

# The spec is in docs/SurgicalpruningConcept.txt
# Implementation agents reference this specification
```

---

## 🛡️ Safety First (Non-Negotiable)

| Policy                               | Enforcement                                                      |
| ------------------------------------ | ---------------------------------------------------------------- |
| **No deletion without confirmation** | HTML interface requires explicit checkbox selection              |
| **Dry-run mandatory**                | Every prune plan logs simulated deletions first                  |
| **Git checkpoint**                   | `git stash push --include-untracked` before any mutation         |
| **Rollback script**                  | Auto-generated `.prune/rollback-<timestamp>.sh`                  |
| **Protected paths**                  | `.git/`, configs, tests, entry points, secrets — always excluded |
| **Confidence thresholds**            | ≥95% auto-prune, 70-94% review required, <70% manual only        |

---

## 📋 Agent Specification Summary

### Agent 1: PRUNE-REVIEWER (System Cartographer)

- **Input**: Target directory path
- **Output**: `.prune/handoff-reviewer.json` — full dependency graph, file inventory, dead-code signals
- **Tools**: `search_files`, `terminal` (git, find, wc), `read_file`

### Agent 2: PRUNE-RESEARCHER (Practice Investigator)

- **Input**: Reviewer handoff + user prompt
- **Output**: `.prune/handoff-researcher.json` — language-specific tooling, patterns, CI integration guidance
- **Tools**: `web_search` (targeted per language/framework), `read_file` (local configs)

### Agent 3: PRUNING-PLANNER (Interactive HTML Generator)

- **Input**: Both handoffs
- **Output**: `surgical-pruning-<mmdd>-<target>.html` — self-contained, zero-dependency planning interface
- **Features**: Radial tree, Mermaid flowchart, D3 circle pack, virtualized checklist, live reclamation metrics

### Agents 4A/4B: EXECUTION GUARDIANS (Executor + Verifier)

- **Input**: `PRUNE_MANIFEST.json` from Planner
- **Output**: `EXECUTION_REPORT.json` + git commit
- **Parallel execution**: Executor deletes, Verifier validates each step, abort on any violation

### Agent 5: DEBRIEFER (User Summary)

- **Input**: Execution report + Reviewer handoff
- **Output**: Markdown summary with reclamation tables, removed/flagged/protected lists, rollback instructions

### Agent 6: CODEBASE AUDITOR (Deep Review)

- **Input**: Post-prune git state + Reviewer handoff
- **Output**: `AUDIT_REPORT.json` — dependency health, architectural smells, coverage impact, build perf, security delta

### Agent 7: RESEARCHER v2 (Improvement Advisor)

- **Input**: Audit report + Researcher handoff
- **Output**: 5+ prioritized, cited suggestions appended to audit report

---

## 🎨 Planner HTML Interface Preview

The generated planning interface includes:

- **Three diagram modes**: D3 radial tree, Mermaid flowchart, D3 circle pack
- **Red highlight pulse** on selected-for-pruning nodes
- **Virtualized checklist** handling 1000+ items smoothly
- **Live performance blob** (SVG path morphing) showing bundle size, file count, CI time, cognitive load
- **Confidence filter chips**: 🟢 Auto-prune (≥95%) | 🟡 Review (70-94%) | 🔴 Manual (<70%) | 🛡️ Protected
- **WCAG 2.1 AA** accessible, reduced-motion compliant, high-contrast theme

---

## 📁 Repository Structure

```
Surgical-Pruning/
├── docs/
│   └── SurgicalpruningConcept.txt    # Complete multi-agent specification
├── .github/
│   ├── workflows/                    # CI pipelines (to be added)
│   └── ISSUE_TEMPLATE/               # Issue templates (to be added)
├── scripts/                          # Helper scripts (to be added)
├── templates/                        # HTML template for Planner (to be added)
├── LICENSE                           # MIT License
├── CONTRIBUTING.md                   # Contribution guidelines
├── CODE_OF_CONDUCT.md                # Community standards
├── SECURITY.md                       # Security policy
└── README.md                         # This file
```

---

## 🤝 Contributing

We welcome contributions that improve the specification, add language support, or implement reference agents.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md)
2. Fork the repository
3. Create a feature branch: `git checkout -b feature/amazing-improvement`
4. Commit changes: `git commit -m 'feat: add amazing improvement'`
5. Push to branch: `git push origin feature/amazing-improvement`
6. Open a Pull Request

### Areas for Contribution

- [ ] Reference implementations for each agent (TypeScript/Python/Rust)
- [ ] Additional language support in Researcher (Go, Rust, Java, etc.)
- [ ] CI/CD workflow templates for GitHub Actions, GitLab CI
- [ ] VS Code extension for the Planner HTML interface
- [ ] Unit tests for confidence scoring algorithms
- [ ] Documentation translations

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## 🙏 Acknowledgments

- **Knip** — Dead code detection for TypeScript/JavaScript
- **Vulture** / **Pyflakes** — Python dead code analysis
- **Depcheck** — Unused dependency detection
- **Repowise** — Graph-aware code intelligence
- **D3.js** / **Mermaid.js** — Visualization libraries
- **Martin Fowler** — Architectural patterns and refactoring wisdom

---

## 📊 Status

> **Specification v2.0** — Complete and ready for implementation.  
> No reference implementation exists yet; this repo contains the authoritative spec.

---

**Built with surgical precision for codebase health.** 🔬
