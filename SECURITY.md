# Security Policy

## Supported Versions

This is a **specification repository** — it contains documentation and design documents, not executable code. Security vulnerabilities in the specification itself are unlikely, but vulnerabilities in **reference implementations** (when they exist) will be tracked separately.

| Version            | Supported     |
| ------------------ | ------------- |
| 2.x (current spec) | ✅ Active     |
| 1.x                | ❌ Deprecated |

---

## Reporting a Vulnerability

If you discover a security vulnerability in a **reference implementation** of Surgical Pruning (agent code, CLI tools, or the Planner HTML interface), please report it responsibly:

### 📧 Private Disclosure

Email: **security@teacherevan.dev**

Include:

- Description of the vulnerability
- Steps to reproduce
- Affected component (agent name, file, version)
- Potential impact
- Suggested fix (if any)

### ⏱️ Response Timeline

| Phase              | Target                            |
| ------------------ | --------------------------------- |
| Acknowledgment     | ≤ 48 hours                        |
| Initial assessment | ≤ 5 business days                 |
| Fix development    | ≤ 30 days (depending on severity) |
| Public disclosure  | After fix is released             |

We follow [Coordinated Vulnerability Disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure) — we will not publicly disclose until a fix is available.

---

## Scope

### In Scope (when implementations exist)

- Agent execution logic (file deletion, git operations)
- Planner HTML interface (XSS, CSRF, injection)
- Handoff artifact validation (JSON schema bypass)
- Rollback script generation/integrity
- Dependency resolution in Researcher agent

### Out of Scope

- The specification document itself (`docs/SurgicalpruningConcept.txt`)
- Third-party tools referenced (Knip, Vulture, Depcheck, etc.) — report to their maintainers
- Git hosting platform vulnerabilities (GitHub, GitLab)
- User's local environment misconfiguration

---

## Security Principles in the Spec

The Surgical Pruning specification bakes in security by design:

| Principle                        | Implementation                                                |
| -------------------------------- | ------------------------------------------------------------- |
| **Principle of least privilege** | Agents receive only required handoff data                     |
| **Defense in depth**             | Executor + Verifier dual-agent validation                     |
| **Audit trail**                  | Every action logged, SHA256 manifests, git commits            |
| **Fail-safe defaults**           | Dry-run mandatory, protected paths immutable                  |
| **Rollback capability**          | Auto-generated rollback script per operation                  |
| **No secrets in handoffs**       | Exclusion patterns prevent `.env*`, `*.key`, `*.pem` exposure |

---

## Safe Usage Guidelines

When implementing or using Surgical Pruning:

1. **Review the generated HTML** — The Planner output is a local file; open it in a browser with no network access for maximum safety
2. **Verify manifests** — Check `PRUNE_MANIFEST.json` SHA256 before execution
3. **Run in isolated environments** — Use containers or VMs for untrusted codebases
4. **Audit the rollback script** — Ensure it only restores the intended stash
5. **Keep tools updated** — Knip, Depcheck, Vulture, etc. should be current versions

---

## Bug Bounty

No formal bug bounty program exists. However, meaningful security contributions are acknowledged in release notes and the project's hall of fame (when established).

---

## Contact

For security questions not related to vulnerability disclosure:

- **General**: Open a GitHub Discussion
- **Specification design**: Open a GitHub Issue with `spec:` prefix
- **Implementation help**: Open a GitHub Issue with `help wanted` label

---

_Last updated: 2026-08-16_
