# Kill Bill 2.0

**Paid more than you expected?** Upload a bill, say what you expected to pay, and the app shows where the difference comes from and drafts one clear message to the company. You send it yourself; the app never contacts anyone.

Live: https://c8-hackathon-killbill2-0.vercel.app

## How it works

1. **Your bill** — upload a PDF or photos and enter what you expected to pay.
2. **Read** — an AI (Claude Haiku) reads the pages and makes sense of the whole bill.
3. **Check the lines** — lines that add up to a printed total are checked by maths; you only look at the rest.
4. **What we found** — the difference, the maths, and the likely causes, each checked by Python.
5. **Your message** — a short message in a warm, neutral or direct tone, ready to copy.

**The rule behind it:** the AI reads and explains; Python owns every number. Every amount you see or send is calculated and checked by code.

## Run it locally

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[test]"
npm --prefix frontend ci
.venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:4173/. Keys go in an ignored `.env.local` (names only): `OPEN_ROUTER_KEY`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.

Tests: `.venv\Scripts\python.exe -m unittest discover -s tests` and `npm --prefix frontend test`.

## Privacy and limits

- Bill images are never stored. The pages you choose are sent to the AI to be read; only the checked lines and results are saved, per browser.
- Euro and Indian rupee bills only for now; up to ten pages.
- The AI can misread a bill; that is why Python checks the totals and you can correct any line.

More detail: [docs/PRD.md](docs/PRD.md) (requirements), [docs/DECISIONS.md](docs/DECISIONS.md) (why things are the way they are), [CLAUDE.md](CLAUDE.md) (developer guide).
