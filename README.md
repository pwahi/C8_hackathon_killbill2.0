# BillShield

Check a bill against the expected payment, verify amounts with Python and prepare one grounded editable message. The user sends it; the app never contacts a provider.

**Current checkpoint, 2026-10-19:** implementation through db71a4e pushed with owner approval (D-043). Updated UI assets/health verified on [the hosted app](https://c8-hackathon-killbill2-0.vercel.app). Fresh hosted end-to-end/owner acceptance remains pending. **114 Python / 73 browser-module tests pass.** Offline browser checks are not new model accuracy or send evidence.

Continue with [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [PRD](docs/PRD.md) and [decisions](docs/DECISIONS.md). Full structure-first hierarchy is a proposal, **not built or approved**.

## Run locally

From this application folder:

```powershell
.venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:4173/ (API docs at /docs). If 4173 is occupied, first check if the app already runs; do not start a second copy. Ctrl+C stops the existing process when appropriate. Python edits need restart; static UI changes need Ctrl+F5, which clears unsaved rows.

First setup, if needed:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[test]"
npm --prefix frontend ci
```

Local configuration is ignored .env.local; names only: GROQ_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, optional BILLSHIELD_ACCESS_CODE. Never print/commit values. Supabase uses publishable key plus user token, not secret key. Reading assets are pinned under frontend/vendor; read CLAUDE.md before regenerating.

## Use the current flow

1. Upload masked PDF/image pages and enter the real expected amount, currency and decimal format. Unknown is not invented.
2. Follow **Choose page → Select prices → Check preview → Read → Review lines**. Only approved personal-detail-free crop goes to AI; local PDF.js/Tesseract remains.
3. Check/edit rows; **I checked all ready lines against the bill** selects complete rows, not arithmetic verification. Add/remove/Undo and repeat-area recovery are available.
4. Confirm subtotal proposals with **Yes / Change**. Summary/detail matching is limited, not general bill understanding.
5. **Looks right — check it** runs Python. Bad arithmetic gives re-check; matching expectation gives no issue; remembered-price differences stay unexplained, not proof of error.
6. Review/edit required message, Copy and send yourself. Only report I sent it after sending. Completed data can be saved, but history loading/continuation after reload and deletion are not built.

## Verify without live model/database writes

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests
npm --prefix frontend test
node --check frontend/review-app.mjs
git diff --check
```

Optional offline UI helper:

```powershell
.venv\Scripts\python.exe scripts/ui_fixture_server.py
```

Open http://127.0.0.1:4180/. Model/storage stubbed; Python real. Not production, fresh OCR accuracy or real-user evidence. Normal app is app.py, not legacy frontend npm start.

## Privacy and limits

No full bill images/OCR text in analysis/storage. Approved crop passes through server to Groq in memory; app does not save request images. Local response cache/separate masked benchmark crops exist; provider retention and OneDrive sync unverified. No zero-retention promise.

EUR/INR; ten pages maximum, 4,000,000 bytes per file. Wrong digits/columns/groups, partial periods and repeated summaries still need review. Exact same-area retries suppressed; overlapping/different crops may duplicate. No full hierarchy, chat, contacts, automatic sending, legal judgement, history retrieval/deletion or cross-device continuity. See PRD for precise current/proposed status.
