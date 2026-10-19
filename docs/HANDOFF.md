# BillShield — handoff entry point

Updated 2026-10-19 · PRD v2.8 · D-043. The detailed repository-contained continuation guide is **[CLAUDE.md](../CLAUDE.md)**. Read it fully before continuing. Earlier handoff snapshots remain in Git history, not as current instructions.

## 1. Current checkpoint

Implementation through db71a4e is pushed with owner approval. Public Vercel health/updated UI assets verified; fresh hosted extraction/save/user acceptance has not been run for these UI changes. 114 Python / 73 browser-module tests pass on 2026-10-19. Recent browser UX checks used simulated model replies and real Python, not fresh accuracy or actual sends.

Built: five chapters/five reading substeps; local/approved-crop reading; page append/reselection; add/remove/Undo; ready-line checkbox; Yes/Change sections; limited summary references; deterministic checks/required draft; smaller saving implementation. Not built: full hierarchy/cross-page semantics, chat, history loading/deletion, full expectation versioning or alternate OCR host.

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

Latest owner request was push + documentation + Claude handoff, not implementation of the proposed structure-first model workflow. Recommend owner regression on current hosted masked bills and discuss PRD §16 schema/verifiers before new structural/model/API/storage work. Preserve time for known-user/stranger tests; no observed product sends recorded.

Code owns numbers; privacy, three outcomes, re-check gate and required message remain non-negotiable. Future pushes/settings/resources/workflows/migrations need appropriate approval. Detailed commands, gotchas, evidence limits and file map are in CLAUDE.md.
