# Instructions for coding agents (Codex and others)

Start every session with `docs/HANDOFF.md` §2 ("Session-start routine"): check git status, run both test suites, read `docs/PRD.md` (v2.0: status, §4 requirement status, §11 stages, §12 next additions) and the newest entries of `docs/DECISIONS.md`, then summarize where things stand before doing anything else.

Essentials (details in `docs/HANDOFF.md`):

- The owner is learning: explain simply before coding, work in small stages, give exact test instructions after each stage.
- Ask before pushing, changing Vercel/Supabase settings, deleting data, or anything outward-facing.
- Code owns every number; models only extract candidates or write validated, number-free prose. Keep the verdicts `verified_mismatch`, `unexplained`, `checks_passed`; every message references confirmed line IDs.
- Never print, commit or request secrets (`.env.local`); never store or send bill images/OCR text beyond an approved Groq area; use only the publishable Supabase key.
- Never invent results; separate implemented, verified and owner-reported.
- **N-1 first UI version is implemented locally (D-036, PRD v2.1).** Owner review and deployment approval are next. Do not restart the build or assume it is deployed; N-2/N-3 remain unbuilt.
- Hackathon check-in 4 is next (see docs/HANDOFF.md §8): help draft only when asked; ask for the actual prompt first.
- After material changes update `docs/DECISIONS.md`, `docs/PRD.md` and the parent `../PROJECT.md`.
