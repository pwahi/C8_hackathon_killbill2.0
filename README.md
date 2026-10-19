# BillShield

Check a bill against the expected payment, verify amounts with Python and prepare one grounded editable message. The user sends it; the app never contacts a provider.

**Current checkpoint, 2026-10-19 (evening):** main through 431a7c9 is live on [the hosted app](https://c8-hackathon-killbill2-0.vercel.app): whole-bill reading with Claude Haiku (OpenRouter) and page choice, a Python-verified bill structure, AI messages in three tones and **Your earlier checks**. **218 Python / 92 browser-module tests pass.** One stranger test done (~80% independent, self-reported). Use the main address; per-deployment URLs are older versions.

Continue with [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [PRD](docs/PRD.md) v3.0 and [decisions](docs/DECISIONS.md) through D-049.

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

1. **Your bill:** upload PDF/image pages, enter the expected amount; currency sets the decimal mark. Earlier checks from this browser are listed below and open read-only.
2. **Read:** tick the pages to send and press **Read the whole bill** (the pages go to Claude Haiku; you confirm first). Fallbacks: draw an area, read on this device, or add a line.
3. **Check the lines:** the bill's sections, ✓ where Python verified them; open a row to fix it. **Looks right — check it** runs Python.
4. **What we found:** Python's result and maths; an AI story with a disclaimer for differences.
5. **Your message:** pick Warm / Neutral / Direct, edit, Copy, send it yourself, then **I sent it**.

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

No file storage: bill images are never saved by the app. With whole-bill reading, the ticked pages pass through the server in memory to OpenRouter/Claude Haiku (retention requested off, not verified). Only confirmed lines and results are saved, per browser. Local response cache exists on developer machines only. No zero-retention promise.

Configuration names: GROQ_API_KEY, OPEN_ROUTER_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BILLSHIELD_ACCESS_CODE (hosted). EUR/INR; ten pages maximum, 4,000,000 bytes per file. Reader mistakes still need review. No chat, contacts, automatic sending, legal judgement, delete or cross-device history. See the PRD for precise status.
