# BillShield — handoff for the next coding agent (Codex)

Written 2026-10-19 by the previous coding agent. Audience: an AI coding agent continuing this repository for the project owner. Read this file fully at the start of your first session; afterwards follow the session-start routine in §2 every time.

Your two jobs right now:

1. **Get up to date and stay up to date** (§2). Do not build anything new yet.
2. **Be ready for the next stage, N-1 (user interface), and start it only when the owner says so** (§7). The owner decides when; when asked, begin with the plan in §7, not with code.

---

## 1. Working with the owner (read first)

- The owner is **learning** and wants to **understand and control** development. Use **simple language**. Before coding, explain in a few lines *what* you will change and *why*. Work in **small stages**. After each stage give: changed files, exact commands to run, test results, limitations, and what the owner should click/check.
- **Ask before** anything outward-facing or hard to undo: pushing to GitHub, changing Vercel/Supabase settings, creating cloud resources, deleting data, sending anything to a model provider beyond what the app already does. Code and local tests do not need permission.
- **Never invent results.** Do not claim tests, user sessions, sends or outcomes that did not happen. Distinguish *confirmed requirement*, *implemented*, *verified* (with the check that verified it), and *owner-reported*.
- The owner writes quickly with typos; read for intent. Answer questions directly before continuing work.
- Times: hackathon deadlines are in **Asia/Kolkata (IST)**; the owner works in **Europe/Amsterdam** (IST − 3h30). Final deadline: **Tue 2026-10-20 22:17 Europe/Amsterdam**.

## 2. Session-start routine ("update yourself")

Run these at the start of every session and summarize the result in ≤ 10 lines before doing anything else.

```powershell
# from billshield-app/
git status --short                 # uncommitted work? never discard it
git log --oneline -5               # what changed since you last looked
git pull --ff-only                 # only if the working tree is clean; ask if not
.\.venv\Scripts\python.exe -m unittest discover -s tests      # expect: all pass (106 on 2026-10-19)
Set-Location frontend; npm test; Set-Location ..              # expect: all pass (40 on 2026-10-19)
```

Then read, in this order (skim what you already know, read what changed — use `git log -p -- docs/`):

1. `docs/PRD.md` — sections **Current state** and **Next development additions** (v1.12 or later). Authoritative requirements.
2. `docs/DECISIONS.md` — newest entries first (D-034 at the time of writing). Every material decision, with status and verification.
3. `../PROJECT.md` (parent workspace, outside this repo) — overall status, action table (A-0xx), progress history. May have newer owner news than the repo.
4. `../work/09_STAGE_2_EXTRACTION.md` — detailed work log of extraction/confirmation work.
5. This file.

Optional live check (no secrets printed): `curl https://c8-hackathon-killbill2-0.vercel.app/api/health` → expect `status: ok`, `groqKeyConfigured: true`, `accessCodeRequired: true`, `databaseConfigured: true`.

Report: current stage, open actions, failing checks (if any), anything in the docs that contradicts the code (the code wins for "what exists", the PRD wins for "what is required"; tell the owner about the contradiction).

## 3. What exists (2026-10-19)

**Product:** a person uploads a bill (photo or PDF) and what they expected to pay; BillShield reads the lines, the person confirms them, Python checks every number, explains differences, and drafts an editable message they may send to the provider themselves. Optimized for *one accurate complaint or clarification message*, not a bill summary.

**Flow:** read (Groq vision `qwen/qwen3.8-27b` on a table area the person draws and approves as free of personal details — recommended for photos; local PDF.js for PDFs; local Tesseract OCR fallback) → Groq pre-fills label, amount, role, row columns → person checks beside the visible page/table → **Confirm all ready lines** → **Build safe preview** → **Calculate and explain** → outcome:

- **A re-check** — rows/subtotals/printed total do not add up → no verdict, no message, no AI; suspects marked (e.g. discount counted twice); continue after fixing or after "I re-checked".
- **B no issue** — `checks_passed` summary; nothing sent to an AI.
- **C difference** — Python exact matches (groups/lines equal to expected amount or difference), then Groq `openai/gpt-oss-20b` suggests likely causes from confirmed labels/amounts only; validated; verdict stays `unexplained`.

Then: editable draft (Python numbers + confirmed line IDs; AI may pre-tick lines and add one number-free question), **Copy**, **I sent it** (paste sent text → server counts changed words), saved to Supabase.

**Layout:**

```text
app.py                         FastAPI app (entrypoint locally and on Vercel)
backend/billshield_core/
  review.py                    confirmed payload (schema 2) → validation, roles, row checks, outcome A/B/C, result JSON
  engine.py, drafting.py       deterministic calculation core and controlled message templates
  gap.py, gap_llm.py           exact-match search; GPT-OSS explanation + strict validation
  groq_vision.py, groq_http.py Groq vision extraction; single guarded Groq call + private local cache
  service.py                   explain flow shared by API and CLI
  store.py, edits.py           Supabase REST as the user; word-change count; private-detail blanking
  money.py, models.py, ...     strict money parsing, dataclasses
frontend/                      index.html, review-app.mjs (page logic), extraction/*.mjs (contracts, privacy, bulk confirm), styles.css
frontend/vendor/               pinned PDF.js / Tesseract.js files served at /vendor (see §6 gotchas)
supabase/migrations/           SQL run by the owner in the Supabase SQL editor
tests/                         Python unittest suites + fixtures (four reference cases, confirmed payloads)
frontend/test/                 node:test browser-module tests
scripts/                       CLI helpers (analyze/explain a confirmed JSON, vendor_assets.py, benchmarks)
docs/PRD.md, docs/DECISIONS.md authoritative requirements and decision log
```

**Hosting:** GitHub `pwahi/C8_hackathon_killbill2.0` (public; owner has permission for names in docs). Vercel project auto-deploys `main`: https://c8-hackathon-killbill2-0.vercel.app. Supabase project (EU) with the migration applied and anonymous sign-ins on.

## 4. How to run, test, deploy

```powershell
# from billshield-app/
.\.venv\Scripts\python.exe -m pip install -e ".[test]"   # once
.\.venv\Scripts\python.exe app.py                          # http://127.0.0.1:4173 (page) and /docs (API)
.\.venv\Scripts\python.exe scripts\analyze_confirmed_review.py tests\fixtures\confirmed\BS-002.confirmed.json
```

- Local secrets live in the **ignored** `.env.local` (names: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, optional `BILLSHIELD_ACCESS_CODE`). Never print, log, commit or ask for values; check presence by name only.
- Locally no access code is needed; on Vercel it is required.
- **Deploy** = commit + `git push origin main` (ask the owner first). Vercel rebuilds automatically (~1 min). Environment variable changes in Vercel need a **Redeploy** by the owner.
- Before any push: `git diff --cached --name-only` must not contain `.env*` (except `.env.example`), `private/`, `.venv/`, `node_modules/`; scan staged text for keys/e-mails/phone numbers.
- The local server runs until stopped; after changing `app.py` or Python modules, restart it (static files reload on refresh).
- Browser checks: the previous agent drove the real page with headless Edge over the Chrome DevTools Protocol (scripts kept outside the repo). Any equivalent works; never print bill text from private files.

## 5. Rules that must not break

- **Code owns every number.** Models may extract candidates and write prose; they never calculate, compare, decide verdicts or introduce amounts. AI text that contains digits (outside verbatim confirmed labels), accuses the provider, or judges prices is rejected.
- **Three verdicts only:** `verified_mismatch`, `unexplained`, `checks_passed`. A remembered/typed expectation is never proof → differences stay `unexplained`. Outcome A (`needs_recheck`) has no verdict and no message.
- **Every sendable message references confirmed `line_item` IDs**; Python refuses drafts without them.
- **Amounts:** never silently insert decimal marks; never drop a leading "2" as a misread ₹; never flip signs; ambiguous values are rejected or flagged, not repaired.
- **Roles:** only charge/discount/adjustment are summed; subtotal/total are checked; row columns are checked; a discount inside a row must not be counted again.
- **Evidence precision:** `exact` (box around the amount), `table` (region), `page`. Never fabricate coordinates; never present a table area as an exact location.
- **Privacy:** no bill images or OCR text stored or sent to Python routes; Groq receives only an area the person previewed and approved; database stores confirmed structured lines and results; sent texts are blanked (e-mails, IBANs, ≥7-digit numbers); the server uses only the **publishable** Supabase key and each user's token (secret keys are refused by code); row level security is the access control.
- **Scope out:** provider contact lookup, automatic sending, payment actions, legal judgements.

## 6. Gotchas learned the hard way

- Vercel **omits folders named `build/` or `dist/`** and does not serve `node_modules`. Reading tools therefore live in `frontend/vendor/{pdfjs,tesseract,tesseract-core,tesseract-eng}`; regenerate with `scripts/vendor_assets.py` after changing `frontend/package-lock.json`. A test forbids build/dist folders under vendor.
- Vercel finds the FastAPI app as root `app.py`; do not add a root `api/` folder (legacy meaning on Vercel). Function time limit set to 60 s in `vercel.json`; request bodies ≤ 4.5 MB (crop limit 4.4 MB in code).
- Groq answers can be cut off on dense tables (`finish_reason: length`) → `IncompleteOutput` with a "select a smaller area" message. Changing a prompt changes the cache key (new paid calls). No automatic retries; surface rate limits.
- The page converts Groq amounts to the chosen decimal mark only when unambiguous; choose the mark **before** reading.
- Windows/OneDrive: deleting folders under OneDrive can fail with "access denied" while syncing — retry; files show harmless LF→CRLF warnings.
- This repo is nested inside the owner's parent `C8` Git repository; run git commands from `billshield-app/`.
- Supabase: anonymous sign-ins must be enabled; health shows `databaseConfigured: false` if the configured key is a secret key.

## 7. Next stage: N-1 user interface — be ready, start only when asked

Requirement: PRD v1.12 → "Next development additions" → **N-1**. Summary: turn the working Stage 2 review page into the owner's **step-by-step design**: Provide → Confirm → Understand → Draft → Finish, one primary action per step, plain-language result first, privacy notes where data leaves the device, mobile-friendly. Reuse the existing API/modules; numeric rules unchanged.

When the owner says to start:

1. Look at the owner's paper UI sequence and flow (parent workspace: `../evidence/E-109_CHECKIN3_PAPER_DESIGN.md` links the photos under `../evidence/originals/2026-10-18_move2/`; never copy evidence into this repo). Describe the screens you will build in ≤ 10 lines and get the owner's OK.
2. Prefer plain HTML/JS in `frontend/` (no build step — Vercel and the vendor setup depend on that) unless the owner approves otherwise.
3. Build in small steps; after each, run all tests and drive the four reference cases (A–D) through the new screens. Acceptance: same verdicts and drafts as today; existing tests pass; a first-time user does not need terms like "role" or "precision" explained.
4. Keep real-user tests possible: the owner plans classmate (A-006) and stranger (A-007) tests on 2026-10-20. If time runs short, cut UI scope, not the tests.
5. Afterwards (only when asked): N-3 chat + `chat_turns`/`finding_lines`/`message_lines` migration, N-2 LightOnOCR-3 comparison (needs a GPU host; evaluate before adopting). See PRD.

## 8. Keeping the records up to date

After each material change, in this order: detailed work record (`../work/...` when relevant) → append a decision to `docs/DECISIONS.md` (date, status, reason, affected files, verification, superseded choices; never rewrite old entries — add a new one or a dated follow-up) → update `docs/PRD.md` when requirements change (bump version, add a change-history row) → update `../PROJECT.md` (status line, action table, progress row). Record owner statements as owner-reported. Commit with a clear message; push only with the owner's OK.
