# BillShield — handoff entry point

Updated 2026-10-20 · PRD v3.1 · D-066. The detailed repository-contained continuation guide is **[CLAUDE.md](../CLAUDE.md)**. Read it fully before continuing. Earlier handoff snapshots remain in Git history, not as current instructions.

## 1. Current checkpoint

Main 9861c5b is live (owner-approved merge of `feature/scalable-check`, D-064–D-066): maths-checked lines, the whole-bill pass with **About this bill**, notes from the bill's own text, Python-graded causes marked in The maths. 262 Python / 103 browser-module tests pass on 2026-10-20. Nobody has tested this version yet; what is left is in PRD §12 and PRD_SCALABLE §10b.

## 2. Session-start routine

From the application folder:

```powershell
git status --short --branch
git log --oneline -8
# Only when clean and appropriate:
git pull --ff-only
.venv\Scripts\python.exe -m unittest discover -s tests
npm --prefix frontend test
```

Read AGENTS.md, CLAUDE.md, PRD current status/§3–5/§10–12/§16–17, newest decisions and parent PROJECT if available. Summarize status, tests, dirty/remote/missing-context issues and up to three next actions before editing. Do not assume plans were built or that failed remote sync means application tests failed.

## 3. Next approval checkpoint

A user test of the merged version comes first; then PRD_SCALABLE W1 (any currency), the balance check, repeats on bills that add up and W6. Code owns numbers; privacy, three outcomes, re-check gate and required message remain non-negotiable. Pushes, settings, resources, workflows and migrations need the owner's approval each time. Detailed commands, gotchas, evidence limits and file map are in CLAUDE.md.
