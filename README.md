# BillShield application

**Current checkpoint (D-036, 2026-10-19):** the five-screen UI is implemented locally, awaiting owner review and deployment approval. Current requirements: PRD v2.1. **The progress notes below predate hosting/database work and are historical, not current status.** See [current run instructions](#current-local-ui-checkpoint--2026-10-19-d-036) at the end.

**Follow-up D-037 / PRD v2.2:** expected amount is now required before reading/comparison in the main UI; don't guess an unknown amount. Tests: 106 Python / 44 browser-module pass. Crops pass through the server to Groq without app image persistence; local responses are cached, and separate benchmark test crops already exist. No push/deployment. Full sketch/privacy audit is in parent `work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md`.

**Update 2026-10-19 (D-028):** Groq now returns one card per table row with the row's printed columns (quantity, price, discount, taxable value, taxes); Python checks each row and adds only row amounts. If the numbers do not add up, the page shows **Check these lines first** with the suspect lines marked, writes no message and calls no AI; fix the lines, or press **I re-checked: the bill really shows these numbers** to get a careful message. Round-off lines use the role **Adjustment**.

**Update 2026-10-19 (D-027):** **Calculate and explain** runs Python locally. If there is a difference, Python first looks for lines or groups that add up exactly to your expected amount or the difference, then sends the confirmed labels and amounts (no image) to Groq `openai/gpt-oss-20b` for a suggested cause. The result shows ✅ Python facts and 💡 unverified AI suggestions separately; the AI may pick which lines the message asks about and add one question without numbers. Try it from a terminal: `.\.venv\Scripts\python.exe scripts/explain_difference.py tests/fixtures/confirmed/BS-004.confirmed.json` (makes one Groq call unless cached).

**Update 2026-10-19 (D-026):** For photos, click **Read with Groq (best for photos)**: draw a box around the charge table, check the preview, send. Groq fills in labels, amounts and suggested roles; check them against the bill, fix anything wrong, then click **Confirm all ready lines**. Local OCR remains available as **Read bill locally (no upload)**; PDFs are read locally by default.

**Handoff updated 2026-10-19 (D-025):** D-024 is implemented locally. Lines can be confirmed beside exact, table-level or page-level evidence, every line has an explicit role (charge/discount/subtotal/total), and **Calculate with Python** sends the confirmed preview to local Python, which returns the verdict, checks and an editable required draft. 58 Python and 28 browser tests pass; an agent-scripted browser replay of all four masked cases reproduced the reference drafts. Owner review of the four cases is the next checkpoint. Stage 2 remains open; no database, deployment or final UI.

Application-only workspace intended to become its own GitHub repository. Stage 0/1 is complete. Stage 2 has local browser PDF/OCR and optional Groq through a limited localhost bridge. Four masked cases open/extract locally; owner accuracy/privacy acceptance and end-to-end Python integration remain pending. No Stage 3 database/persistence, cloud deployment or final UI is complete.

## Run the app (FastAPI, D-030)

From this `billshield-app` folder:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[test]"   # once, or after pulling changes
.\.venv\Scripts\python.exe app.py
```

Open `http://127.0.0.1:4173` for the review page and `http://127.0.0.1:4173/docs` for the interactive API documentation. Stop with `Ctrl+C`. The FastAPI app replaces the earlier Node helper (`frontend/local-server.mjs` is kept for comparison only). Operations: `GET /api/health`, `POST /api/analyze` (Python only), `POST /api/explain` (Python, then GPT-OSS only when there is a difference), `POST /api/groq-extract` (one approved redacted crop). Requests must come from the page's own address and be JSON; the Groq key stays on the server.

## Saving reviews (Supabase, D-033)

Run `supabase/migrations/20261019120000_reviews.sql` once in the Supabase SQL editor, switch on **Allow anonymous sign-ins**, and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the **publishable** key, never a secret key) in `.env.local` locally or in Vercel's environment variables. Each browser gets an anonymous identity; completed reviews, copy/sent events and changed-word counts are saved, and each user can read only their own rows. No bill images or OCR text are stored.

## Run the Stage 0/1 checkpoint

Requirements: Python 3.11 or newer.

From this `billshield-app` folder:

```powershell
python -m unittest discover -s tests -v
python scripts/replay_fixtures.py
```

The first command runs money, verdict, mutation, message-binding, and four-case replay tests. The second prints each case's formula, scoped verdict, source-line IDs, and required draft. Inspect a structured input directly under [`tests/fixtures/`](tests/fixtures/), starting with [`BS-001.json`](tests/fixtures/BS-001.json).

For the Python verification environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

For the browser extraction tests:

```powershell
Set-Location frontend
npm install
npm test
```

To open the local Stage 2 review page:

```powershell
Set-Location frontend
npm start
```

Then open `http://127.0.0.1:4173` in a browser. Choose one PDF or all JPEG/PNG pages for one participant, set the currency and the bill's **decimal mark**, then click **Read bill locally**. Participant A's two image pages should be selected together.

For every relevant line: check the amount against the visible page or table, type a short label, choose a **role** (charge, discount, subtotal or grand total), add a group if useful (required for a subtotal), tick **Ask about this line** if the message should name it, then tick **I checked this against the bill**. Type discounts with a minus sign. Exact boxes are optional: lines may rest on a dashed table area (Groq) or on a whole page (**Type an amount seen on page N**). Only charges and discounts are added; subtotals and the grand total are checked against them.

Enter the expected amount if any, choose a message type (or leave **Automatic**), click **Build safe preview**, inspect the JSON, then click **Calculate with Python**. Step 5 shows the verdict, what was checked, which lines the message uses, what is still unknown, and an editable message with **Copy message**. Nothing is sent to a provider. Press `Ctrl+C` in the terminal when finished.

To analyze a downloaded preview without the browser:

```powershell
.\.venv\Scripts\python.exe scripts/analyze_confirmed_review.py tests/fixtures/confirmed/BS-002.confirmed.json
```

The browser route uses PDF.js for text PDFs and Tesseract.js for images/scans. Its PDF worker, OCR worker/core, and English language data are installed locally. It sends no document bytes or full OCR text to Python. An LLM/API key is not required. The preview reaches Python only when you click **Calculate with Python**, and only over the local 127.0.0.1 route; Python runs on this computer.

## Development order

### Optional Groq vision comparison

The local browser page now supports Groq too. Start it with `npm start` from `frontend/`, select a masked bill, and click **Open bill for Groq review**. Above the desired page click **Select charge table for Groq**, draw one box around the table (labels and prices), inspect the exact preview, confirm redaction, then click **Send this area to Groq**. Suggestions appear in the existing list. If the model gives no source boxes, the lines are shown as **table-level** evidence: the selected area is outlined dashed and labelled as not an exact amount location, and you can confirm each line after checking it in that table. **Mark exact location (optional)** upgrades a line to an exact box. Choose the matching review currency before building the safe preview.

Only the previewed image goes to the local helper and Groq. The key stays in `.env.local`, outside static serving. Responses are cached under ignored `private/groq-cache/` for identical-request replay; source image files are not stored by this bridge. Rate-limit errors appear in the status banner; there are no automatic retries. Groq output is only a candidate list; calculations and the draft come from local Python after your confirmation. Keep original bills out of hosted tests.

Keep using the local browser OCR page as before. The optional benchmark is a separate command and sends the selected redacted crop to Groq. No automatic upload occurs. The selected model is `qwen/qwen3.8-27b`; final extractor choice remains pending comparison.

Put your API key after `GROQ_API_KEY=` in the app-root `.env.local` file (ignored by Git). Do not paste it in chat or frontend code. Save an already-redacted commercial-table PNG/JPEG crop under `private/masked/`, then run from `billshield-app/`:

```powershell
.\.venv\Scripts\python.exe scripts/benchmark_groq_crop.py "private/masked/charge-crop.png" --send-redacted-crop
```

Replace the example filename with your reviewed crop. This command prints unconfirmed candidates; it does not run calculations or save output. Model boxes refer to the crop, not the original page. Check every label, amount, and box before acceptance. Compare both paths on the same cases before selecting a default. A live browser smoke test read three D prices correctly; full-case acceptance remains pending.

1. Sanitized fixtures and Python calculations. **Complete locally; owner checkpoint pending.**
2. Client-side PDF/OCR extraction, confirmation, and grounded explanation/draft. **In progress; D-024 confirmation and local Python calculation/draft flow implemented (D-025); owner four-case review pending.**
3. Local API plus Supabase persistence and ownership checks.
4. Hosted Vercel backend and verifier replay.
5. Sequential web UI and observed user tests.

Review each stage with the owner before advancing. Draft generation is required. Model does not calculate money. Provider contact lookup and automatic sending are out of scope.

## Layout

```text
backend/billshield_core/ Deterministic typed contracts, calculations, and drafts
tests/fixtures/          Four sanitized structured test inputs only
tests/                   Standard-library verifier and edge-case tests
scripts/                 Fixture replay and masked-PDF inspection
supabase/migrations/     Versioned SQL schema and access policies
frontend/extraction/     Browser-only PDF/OCR/privacy modules; final UI still deferred
docs/                    Repository-facing development notes
.env.example             Variable names only; never actual credentials
.gitignore               Secrets, uploads, local data, caches excluded
```

The authoritative [PRD](docs/PRD.md) and [decision log](docs/DECISIONS.md) live in this application folder. The parent Hackathon folder retains interviews, bills, and submission evidence. Do not copy the evidence folder, real bill files, recordings, screenshots, filled personal identifiers, or credentials into this application repository. Human-reviewed sanitized fixtures may be added when implementation starts.

## Project documents

Use `docs/PRD.md` for requirements and `docs/DECISIONS.md` for existing and future material decisions. Parent PRD/log files point here. Overall hackathon status stays in `../PROJECT.md`. Parent evidence references are local provenance, not bundled files in a standalone clone.

For every material change, update the PRD when affected, append a decision with reason/status/affected files, and link implementation commits/test results when available. No fabricated stage completion.

## Future GitHub setup

The current C8 parent directory is already a Git repository. This folder has deliberately NOT been initialized as a nested repository, and no remote or GitHub write has been performed. To publish it independently later, copy/export only this folder into a separate checkout outside the parent repository, inspect staged files for secrets/personal information, then initialize/connect the chosen repository. Repository name, owner, visibility, and deployment linkage are future choices.

The tested minimum Python version is declared in `pyproject.toml`. Browser dependencies are pinned in `frontend/package.json` and `package-lock.json`. No LLM key or model configuration is required for the confirmed MVP path.
# Current local UI checkpoint — 2026-10-19 (D-036)

Five screens: **Provide → Confirm → Understand → Draft → Finish**. Minimal charcoal/yellow styling. Same backend and numeric rules. First version is local; owner acceptance and deployment pending. Older progress notes above are historical; current requirements/status are in `docs/PRD.md` v2.1.

From this application folder in PowerShell:

```powershell
.venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:4173/. If already running, refresh; don't start a second server on the same port. Use masked bills, verify amounts and types, then **Confirm and check charges**. Review results → message → Finish. Copy is not a send. The normal app uses your existing configured services; photo areas require approval before going to Groq.

Tests (106 Python and 42 browser-module tests passed):

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests
npm --prefix frontend test
```

Optional developer-only offline UI testing: `.venv\Scripts\python.exe scripts/ui_fixture_server.py` on port 4180. It simulates extraction/AI and disables saving; do not mistake it for the normal app or an OCR accuracy test. No cloud changes or new model calls were made for this UI verification. Owner usability checks remain required.
