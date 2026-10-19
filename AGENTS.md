# BillShield coding-agent instructions

## Current checkpoint — 2026-10-19 (evening)

- Authoritative requirements: docs/PRD.md v3.0; append-only decisions through D-049 in docs/DECISIONS.md.
- Detailed receiving-agent context: **read CLAUDE.md fully**. It applies to any coding agent.
- Live on Vercel (main through 431a7c9): whole-bill reading with Claude Haiku via OpenRouter, Python-verified structure, AI messages in three tones, Your earlier checks. One stranger test recorded; known-user send evidence pending.
- Baseline: 218 Python / 92 browser-module tests. Rerun; do not assume this count proves a new run.
- Owner waived the crop-only privacy rule for whole-bill reading (D-046); no image storage is still a hard rule.

## Session start

Follow docs/HANDOFF.md §2: status/log, safe fast-forward sync only when clean, both test suites; read current PRD/newest decisions/parent PROJECT when present and CLAUDE.md. Summarize status, failures/missing context and up to three next actions before changing code.

## Non-negotiable rules

- Owner is learning: explain simply before editing; take small stages; give exact commands/clicks, test evidence and limitations afterwards. Be a critical peer, not an automatic yes.
- Ask before future pushes/deployments/settings changes, migrations, external resources, new model workflows/live testing outside approval, or destructive data operations. Previous push permission is not blanket future authority.
- Code owns arithmetic, comparisons, verdicts and message numbers. AI extracts candidates and writes validated prose only. Keep verified_mismatch / unexplained / checks_passed; needs_recheck blocks a draft until corrected or explicitly rechecked. Completed reviews require a grounded draft.
- Never invent decimal marks/signs/source positions, drop a leading 2 as a guessed rupee symbol, merge charges merely because amounts match, or force missing detail to add up.
- Preserve the minimal UI/five reading substeps. Ready-line acceptance is not arithmetic or section acceptance. Edits invalidate output and relevant confirmations. Do not re-enable silent group mutation.
- No unmasked bills/secrets in code, logs, screenshots or commits. Only explicitly approved redacted crop may pass through server to Groq; no full-image/OCR upload to analysis/storage or app image persistence. Supabase publishable key + user token only. No unverified zero-retention/OneDrive promises.
- Do not fabricate interviews, sends, edits, evidence, acceptance or test results. Distinguish implemented, verified, historical/owner-reported and proposed. Contact lookup, automatic sending and legal judgements are out of scope.
- This is a nested Git repo; work from this application folder. Preserve unrelated edits. No force push/hard reset or killing the owner's server to free a port.
- Update detailed work first, then append decisions, update PRD and parent PROJECT when present, then handoff if needed. Preserve older decisions as dated history.
- Parent evidence may be absent in a fresh clone: report that, never copy private sources into the public repo. Participant-made architecture/schema photos remain a submission obligation.
