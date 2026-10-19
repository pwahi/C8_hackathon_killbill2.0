# Instructions for coding agents (Codex and others)

Start every session with `docs/HANDOFF.md` §2 ("Session-start routine"): check git status, run both test suites, read `docs/PRD.md` (v2.0: status, §4 requirement status, §11 stages, §12 next additions) and the newest entries of `docs/DECISIONS.md`, then summarize where things stand before doing anything else.

Essentials (details in `docs/HANDOFF.md`):

- The owner is learning: explain simply before coding, work in small stages, give exact test instructions after each stage.
- Ask before pushing, changing Vercel/Supabase settings, deleting data, or anything outward-facing.
- Code owns every number; models only extract candidates or write validated, number-free prose. Keep the verdicts `verified_mismatch`, `unexplained`, `checks_passed`; every message references confirmed line IDs.
- Never print, commit or request secrets (`.env.local`); never store or send bill images/OCR text beyond an approved Groq area; use only the publishable Supabase key.
- Never invent results; separate implemented, verified and owner-reported.
- **N-1 first UI version is implemented locally (D-036, PRD v2.1).** Owner review and deployment approval are next. Do not restart the build or assume it is deployed; N-2/N-3 remain unbuilt.
- D-037 / PRD v2.2 follow-up: expected amount required in main UI; 106 Python / 44 browser-module tests pass. See parent work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md for confirmed code-versus-sketch gaps and crop-storage boundary. No push/deployment yet.
- Latest D-038 / PRD v2.3: UI now follows owner's desktop HTML mock-up, with Your bill → Read → Check the lines → What we found → Your message (Finish in sidebar). 107 Python / 47 browser-module tests pass. See docs/DESIGN.md and parent work/13_DESKTOP_MOCKUP_IMPLEMENTATION.md. Local only; owner review/deployment pending.
- Hackathon check-in 4 is next (see docs/HANDOFF.md §8): help draft only when asked; ask for the actual prompt first.
- After material changes update `docs/DECISIONS.md`, `docs/PRD.md` and the parent `../PROJECT.md`.
