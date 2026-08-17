# Contributing to Surgical Pruning

Thank you for your interest in contributing! This specification benefits from diverse perspectives — whether you're a compiler engineer, a build systems expert, or someone who's felt the pain of dead code accumulation.

---

## 🎯 Ways to Contribute

### 1. Specification Improvements

- Clarify ambiguous sections
- Add missing edge cases (dynamic imports, reflection, plugin systems)
- Improve confidence scoring algorithms
- Add new language/framework entries to Researcher agent

### 2. Reference Implementations

The spec is language-agnostic. Implementations welcome in:

- **TypeScript/Node.js** — Native ecosystem fit
- **Python** — Great for AST analysis
- **Rust** — Performance-critical graph operations
- **Go** — Excellent tooling integration

### 3. Tooling & Templates

- CI/CD workflow templates (GitHub Actions, GitLab CI, Azure Pipelines)
- VS Code / JetBrains extensions for the Planner HTML
- Pre-commit hook templates (Husky, lefthook)
- Knip/Depcheck/Vulture config templates per framework

### 4. Documentation

- Translations
- Tutorials / walkthroughs
- Architecture decision records (ADRs)
- Case studies from real codebases

---

## 🚀 Getting Started

```bash
# 1. Fork & clone
git clone https://github.com/YOUR-USERNAME/Surgical-Pruning.git
cd Surgical-Pruning

# 2. Create a branch
git checkout -b feat/your-contribution

# 3. Make changes
# Edit docs/SurgicalpruningConcept.txt for spec changes
# Add implementations in agents/ (to be created)
# Add templates in templates/ (to be created)

# 4. Validate
# - Spec changes: ensure JSON schemas are valid
# - Code: run tests, lint, type-check
# - Docs: check links, markdown rendering

# 5. Commit with conventional commits
git commit -m "feat(researcher): add Go dead-code detection with govet"

# 6. Push & open PR
git push origin feat/your-contribution
```

---

## 📝 Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix      | Meaning                                     |
| ----------- | ------------------------------------------- |
| `feat:`     | New feature (agent, tool support, language) |
| `fix:`      | Bug fix in spec or implementation           |
| `docs:`     | Documentation only                          |
| `refactor:` | Code restructuring, no behavior change      |
| `test:`     | Adding tests                                |
| `chore:`    | Maintenance, deps, CI                       |
| `spec:`     | Specification document changes              |

**Examples:**

```
feat(planner): add circle-pack diagram mode with D3.js
fix(reviewer): handle symlinks in dependency graph
docs: translate README to Spanish
spec: clarify confidence threshold for dynamic imports
```

---

## ✅ Pull Request Checklist

Before submitting, ensure:

- [ ] **Single logical change** — one feature/fix per PR
- [ ] **Spec alignment** — implementation matches the specification in `docs/SurgicalpruningConcept.txt`
- [ ] **Tests pass** — `pnpm test` / `pytest` / `cargo test` as applicable
- [ ] **Lint clean** — `pnpm lint` / `ruff check` / `clippy`
- [ ] **Types clean** — `tsc --noEmit` / `mypy` / `cargo check`
- [ ] **Documentation updated** — README, inline comments, or spec if behavior changed
- [ ] **No breaking changes** — or clearly marked with `BREAKING CHANGE:` in commit footer

---

## 🧪 Testing the Specification

The spec includes JSON schemas for all handoff artifacts. Validate your implementation produces compliant output:

```bash
# Example: Validate Reviewer handoff
cat .prune/handoff-reviewer.json | jq -e '.metadata.target_path' > /dev/null
# Should exit 0 for valid schema
```

---

## 🏷️ Versioning

This project follows [SemVer](https://semver.org/) for the **specification version** (currently `2.0.0`).

- **MAJOR** — Incompatible schema changes, agent interface changes
- **MINOR** — New agents, new language support, new diagram modes (backward compatible)
- **PATCH** — Clarifications, bug fixes, typo corrections

Implementation packages should version independently.

---

## 💬 Communication

- **Issues** — Bug reports, feature requests, spec clarifications
- **Discussions** — Design debates, implementation approaches, questions
- **PR reviews** — Technical feedback, alignment with spec

Be respectful, constructive, and assume good intent. We're all here to make codebase hygiene surgical, not traumatic.

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
