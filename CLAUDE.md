# BillShield — detailed Claude Code handoff

Updated 2026-10-20 · PRD v3.1 (+ PRD_SCALABLE for what is left) · decisions through D-066. Read this before proposing or changing code. This is continuation context, not permission to implement every proposal.

## 1. Start here: outcome and current checkpoint

BillShield helps a person check a real bill against what they expected and prepare one accurate complaint or clarification message. It is not a generic bill summarizer. A message is required after every completed review, including a truthful no-issue message. The app never finds provider contacts or sends messages automatically.

**Newest (2026-10-20, main 9861c5b, live; D-064–D-066):** after the failed participant test, branch `feature/scalable-check` was built and merged with the owner's approval: maths-checked lines (`autoVerified` in `whole_bill.plan`; PDF text-layer match `text_match` set by the server); context notes from the reader (`ExtractionOutput.notes`, verified against the text layer, privacy-filtered, sent beside the review as `contextNotes`, never saved); Python-graded AI causes (`gap_llm.grade_cause`: full/part/over/text, unsupported hidden with the story); the whole-bill pass (`bill_map.py`, `/api/link-pages` `mode: "map"`) that names the amount due, the counted lines and what every other line is, used only when Python finds the counted lines equal the amount due, plus **About this bill** for every bill; cause lines marked in The maths with a colour key; labels may contain plain numbers; reader payment/balance/history roles become `other`; currency adopted before linking. Details and measurements in D-064–D-066 and docs/PRD_SCALABLE.md §10b.

**Built and live before that (main through 431a7c9, Vercel):** deterministic Python checks/drafts; **Read the whole bill** with Claude Haiku via OpenRouter (Groq Qwen fallback) and page checkboxes; Python-verified bill structure (invoices → sections → rows, summary links) with a cross-page linking pass; hierarchical "Check the lines"; AI explanation as a story with a disclaimer (gpt-oss-120b); AI-written message in Warm/Neutral/Direct with Python-filled placeholders; Supabase saving; **Your earlier checks** (list + read-only view per browser). Area drawing, local PDF.js/Tesseract, manual lines, Yes/Change and the ready-line checkbox remain as fallbacks/corrections.

**Verification:** 262 Python / 103 browser-module tests pass (2026-10-20). Earlier: Owner live runs (Vodafone two pages, IndiGo, Anthropic invoice). Claude's live save → list → open → second-browser isolation test on the real database. Owner saved and reopened a check after a browser restart on Vercel (parent evidence E-111). One stranger test (E-210): self-reported ~80% independent; barriers: goal unclear at first, UI overwhelming in parts, next step unclear.

**Not built:** chat; delete; cross-device history; persisting the hierarchy; provider name in saved list; finding_lines/message_lines tables; alternate OCR.

**Next checkpoint:** a user test of the merged version (nobody has tried it yet); then PRD_SCALABLE W1 (any currency: today EUR/INR only and 2 decimals), the Python balance check, repeats on bills that already add up, and W6 (never stuck, e.g. Flipkart C). The hackathon deadline was 2026-10-20 22:17 Europe/Amsterdam.

## 2. Working agreement with the owner

- Owner is learning and wants control. Use plain language; explain files/actions before coding, take small stages, then give exact run/click instructions, test results and limits.
- Be a critical peer: separate facts, interpretations, proposals, confirmed decisions, implemented code, verified results and owner-reported observations. Do not agree blindly or invent evidence.
- Keep the white/off-white/charcoal/yellow desktop design minimal; main actions should not require internal model/provider terminology. The owner repeatedly found manual grouping and long instructions confusing.
- Ask before future pushes, hosting/settings changes, migrations, external resources, new model workflows/live calls beyond approved testing, destructive data operations or significant scope expansion. The completed push request is not blanket future deployment authority.
- Do not start multiple servers or kill an existing owner process. Preserve unrelated edits and dirty worktrees. No force push, hard reset or deleting source/evidence to obtain a clean result.
- No interviews, sends, edited-word counts, findings, screenshots, consent or user acceptance may be fabricated. Unknown stays unknown/TBD. Copy is not send; a self-reported event is not independent observation.

## 3. Sources of truth and workspace layout

1. Applicable `AGENTS.md` files, including parent if available.
2. `docs/PRD.md` — authoritative current requirements and status, v2.8 or later.
3. `docs/DECISIONS.md` — append-only decision history; newest effective override wins. Do not rewrite historical decisions as if the later state existed then.
4. Parent `../PROJECT.md` — overall milestones/actions/status when working in the original workspace.
5. This file — implementation handoff; `docs/DESIGN.md` — visual reference. If code and a plan disagree on what exists, inspect code/tests; record the discrepancy rather than assuming a plan was built.

Application is its **own nested Git repository**. Run app Git commands inside `billshield-app`, not the parent C8/Hackathon repo. Remote: https://github.com/pwahi/C8_hackathon_killbill2.0. Main auto-deploys to https://c8-hackathon-killbill2-0.vercel.app.

Original workspace: `C:/Users/PWAH/OneDrive - DGMR/Documents/17. GEN AI Cohert/C8/Hackathon/billshield-app`. Parent discovery/evidence/work files are outside the app repo and may be absent in a fresh clone. Do not copy raw bills/evidence into the public repo to repair links. Missing context must be reported honestly; this guide and sanitized in-repo fixtures cover the core continuation facts.

Relevant parent records, if available:

- `../evidence/E-001_BILLSHIELD_BRIEF.md`, `../work/01_HYPOTHESIS.md`, `../work/02_72_HOUR_PLAN.md` — outcome, evidence bar, deadlines.
- `../deliverables/GOLDEN_PAIRS_CONCISE.md`, `../deliverables/BILLSHIELD_GOLDEN_DATASET.md` — four discovery reference cases, not unassisted tests.
- `../evidence/E-109_CHECKIN3_PAPER_DESIGN.md`, `../work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md` — owner's paper sketches and implementation gaps.
- `../work/14_MULTI_PAGE_AND_REVIEW_RECOVERY.md`, `15_SECTION_LINKS_AND_SUMMARY_COUNTING.md`, `16_SIMPLE_READING_AND_SECTION_CONFIRMATION.md` — recent recovery/grouping/UX evidence.
- `../work/17_ACCEPT_ALL_AND_STRUCTURE_FIRST_PROPOSAL.md`, `18_PUSH_AND_CLAUDE_HANDOFF.md` — current checkbox/proposal/delivery record.

## 4. Session-start routine

From the application directory:

```powershell
git status --short --branch
git log --oneline -8
# Only when clean and network/remote access is appropriate:
git pull --ff-only
.venv\Scripts\python.exe -m unittest discover -s tests
npm --prefix frontend test
```

Read PRD current status, §3–5, §10–12, §16–17; newest decisions; parent PROJECT if present; this guide. Report stage/status, tests, dirty work, missing context, delivery versus acceptance and up to three next actions before starting changes. If remote sync fails, say so; do not reset/rebase/overwrite to conceal it. A failed network command is not a failed application test.

Expected baseline 262 Python / 103 browser-module tests; rerun, do not copy this count as evidence. Do not run benchmark scripts that call Groq or write the real database as a routine startup action.

## 5. What the person sees now

Five chapters: **Your bill → Read → Check the lines → What we found → Your message**. Finish/self-reported send stays beside the message, not an extra hidden stage.

**Since D-064–D-066:** Check the lines starts with **About this bill** (AI summary, three lines, labelled) above Check all lines / Add a line; lines Python checked by maths say "✓ Checked by maths" and start confirmed; discounts, minus signs and unsure readings stay for the person; repeats, details, earlier bills, payments and empty tables are folded under "Shown on the bill — not counted" with Python's reason. What we found shows each AI cause with Python's grade (green full, blue part, grey offset/bill text only), the bill note behind it, a "Show on page N" link, and its lines marked "· likely cause" in The maths.

**Current main route (D-044–D-049), above the older detail below:** Chapter 1 has upload, expected amount, currency (sets the decimal mark) and **Your earlier checks**. Read shows one page at a time with Previous/Next, page checkboxes and **Read the whole bill** (confirmation names the pages). Check the lines shows the verified hierarchy with ✓ sections, indented breakdowns, one explanation under a section that does not add up, and reference lines folded away. What we found adds the AI story with a disclaimer. Your message has a Warm/Neutral/Direct picker. The subsections below describe the area-drawing fallback and correction tools, which still exist.

### Your bill

- One PDF or JPEG/PNG pages, maximum ten pages, 4,000,000 bytes per file.
- Required expected payment, currency EUR/INR and decimal mark. Explicit zero is allowed; blank/unknown is not silently changed to zero or the bill total.
- Main photo route opens the AI area selector; PDF can read embedded text locally. Local Tesseract is a fallback. Do not guess an expectation just to replay case C through the main UI.

### Read

- Five visible substeps: Choose page → Select prices → Check preview → Read → Review lines. Current node highlighted; one short instruction.
- Only selected page/source controls are shown. Page N buttons display candidate counts, not verified counts. Choose another page without clearing previous edits.
- Main controls: Select area to read, Use last selection, Read this area, Choose a different area. Provider identity/privacy still disclosed, not hidden by renaming buttons.
- User draws an area and explicitly checks that the exact preview contains no personal identifiers before transmission. Replacing/escaping the preview does not send it.
- Successful reading stays in Read and enables Review N lines. Person chooses whether to read another area/page or continue. Do not restore the old automatic jump to checking.
- One in-flight crop request; no automatic provider retries. Truncation/rate-limit errors are actionable and must not look like successful extraction.

### Check the lines

- Compact expandable rows show label, type, source page and raw amount. Add a line, remove × and Undo are available. Manual line evidence is page-level, not fake exact coordinates.
- Printed total/subtotal required; ask for the exact printed figure when missing. A subtotal checks only its section, not the whole bill.
- **I checked all ready lines against the bill** checkbox selects structurally ready rows only. Skipped count/reasons explicit; partial state supported. Unticking clears acceptance without deleting rows. Ready does not mean numerically correct.
- Edits to amount/label/type/group/printed row columns/currency clear that row's acceptance and old result. Bulk acceptance revalidates previous selections too.
- For subtotals, Do these lines belong together? shows suggested rows; Yes accepts membership, Change opens the advanced group name/full picker. Acceptance key changes after relevant edits/removal/reassignment. It is grouping-only, not arithmetic verification.
- Main Looks right — check it requires section acceptance, explicitly confirms ready lines and calls Python. The older advanced payload controls are not the primary owner flow; Python must validate regardless of UI path.

### What we found and Your message

- Results/maths come from Python, not JS recomputation. Source preview on re-check is actual source, not an invented error highlight.
- Failed printed arithmetic → needs_recheck: no verdict/draft/AI until corrected or the person explicitly re-checks the printed figures. Re-check confirmation is not proof of provider wrongdoing.
- Arithmetic fine + expectation matches → checks_passed, truthful required draft, no text-model call.
- Arithmetic fine + user expectation differs → unexplained, Python exact matches and optional validated number-free AI cause/question. Remembered expectation is never contractual proof.
- Draft is editable and references confirmed line IDs. Copy and I sent it are distinct. Only the user chooses recipient/channel and actually sends.

## 6. Critical implementation details

### Two limited duplicate mechanisms — neither is a bill hierarchy

1. Browser repeated-area suppression: same page + selected area key (normalised bounds rounded to four decimals) + original extraction signature. Multiset matching preserves identical legitimate rows within an initial read. Original corrections/confirmation survive a repeat. Other/overlapping crops or changed outputs may still need manual removal. Equal amounts are not a duplicate rule.
2. Python summary references (`review.summary_links`): exactly one charge on another page with normalised description matching exactly one subtotal's group, compatible existing group, no row breakdown, exact parsed summary/subtotal amount agreement and detail members present. Exclude summary from summation but retain it in result. Ambiguity is not silently discarded; disagreeing linked figures require review; missing detail still fails reconciliation.

Results expose `summaryOf` and `countedInTotal`; maths respects them and gap-model package excludes references. Existing database rows save role/group/raw/parsed values and derived calculation, **not a full persisted hierarchy/reference graph**. Do not assume a future history UI can round-trip new semantics without design/migration work.

### Section proposals

`suggestSection` uses same-page/read-area contiguous rows ending at a subtotal. If consistent existing member names are present, it prefers those and does not absorb an ungrouped/other-section neighbour. Otherwise row order is only a suggestion for explicit Yes/Change. It stops at prior subtotal/total or crop/page boundary. Cannot reliably infer unseen headings, renamed summaries or period compatibility.

`linkUnassignedSections` remains as a tested legacy utility but is **not called by the main app** after D-041. Do not re-enable silent group mutation as a shortcut. Duplicate model group names across distinct sections can still require correction; there is no stable multi-level section-ID graph yet.

### Numeric and evidence boundaries

- Python integer minor units/Decimal own parsing, all sums/differences, checks, verdicts and message numbers. JS may count UI rows and format unambiguous printed strings but must not derive financial facts.
- Roles: charge/discount/adjustment summed; subtotal/total checked. Discounts must already be negative; no automatic minus insertion, decimal invention or dropping a leading 2 because ₹ was read as 2.
- Row columns are checked if printed: quantity × price − discount, taxable value/tax totals. Discount inside one row must not also be summed separately. Included tax versus extra tax still depends on correct reading/roles; do not claim universal semantic understanding.
- Source precision exact/table/page is distinct. Exact needs genuine bounds; table region is never an exact amount box. Manual page evidence has no fabricated locator.
- Three verdicts only: verified_mismatch, unexplained, checks_passed. needs_recheck is a pre-verdict state. AI cannot choose a financial verdict or invent a billing error.

## 7. File map — change the owning layer

| File/module | Responsibility |
|---|---|
| app.py | FastAPI entrypoint, origin/access/size guards, routes, static files; same app locally/Vercel |
| backend/billshield_core/review.py | Schema-2 confirmed review validation; money roles/groups/summary links/row checks; results and message orchestration |
| engine.py, money.py, models.py, drafting.py | Exact core, typed cases and controlled drafts |
| gap.py, gap_llm.py, service.py | Python exact matches; validated text-model explanation; conditional model flow |
| extraction.py, groq_vision.py, groq_http.py | Candidate/source contracts; vision prompt/validation; guarded provider HTTP and local-only response cache |
| store.py, edits.py | Supabase operations as user, transactional saves, event blanking and word-diff count |
| frontend/index.html | Base controls/dialogs and script entry |
| frontend/ui-flow.mjs, read-flow.mjs | Chapters, reading sequence/state and main page composition |
| frontend/review-app.mjs | Page/crop/whole-bill/confirmation/recovery/API orchestration; not the financial engine |
| backend/billshield_core/structure.py, structure_flat.py, structure_proposal.py, whole_bill.py | Bill structure model, Python verification, single-crop plan, cross-page linking (D-044) |
| backend/billshield_core/bill_map.py | Whole-bill pass: prompt, parsing, Python checks of counted lines/copies/details/empty claims (D-065) |
| scripts/eval_confirmation_load.py, eval_synthetic_causes.py, eval_bill_map.py | W0-lite measurements; the last two call a model (cached in private/) |
| backend/billshield_core/message_ai.py, tone.py | AI messages in three tones with placeholders; template tone fallback (D-048) |
| frontend/line-tree.mjs, saved-checks.mjs, tone.mjs, extraction/locate.mjs | Hierarchical line rows; earlier checks list/dialog; tone display; PDF-text amount positions |
| frontend/extraction/page-review.mjs | Candidate append/repeat rules, manual fields, remove/Undo metadata, section proposal/acceptance bookkeeping |
| frontend/extraction/bulk-confirm.mjs | Readiness, accept-all state, raw-format tidying; not money verification |
| frontend/extraction/contracts.mjs, privacy.mjs | Confirmed contract and allowlisted least-data payload; excludes image/OCR/internal UI state |
| frontend/result-display.mjs | Presentation of Python result values, including counted/reference rows |
| frontend/styles.css, desktop.css, assets/fonts | Owner's minimal desktop/mobile design; local Anton font/licence |
| frontend/vendor | Pinned local reading assets; not user files |
| tests/, frontend/test/ | Python and Node test suites; sanitized fixtures |
| scripts/ui_fixture_server.py | Offline-only port 4180, models/storage stubbed; never production routes or live accuracy proof |
| supabase/migrations/20261019120000_reviews.sql | Existing smaller saving schema; do not reapply/change casually |

## 8. Models, privacy and API

Configured models: vision `anthropic/claude-haiku-5.5` via OpenRouter when `OPEN_ROUTER_KEY` is set (request includes `provider: {data_collection: "deny"}`, medium reasoning), otherwise Groq `qwen/qwen3.8-27b`; `VISION_PROVIDER` can force one. Text: Groq `openai/gpt-oss-120b` for the explanation and the three-tone message. Health reports `visionReader`. Do not silently change model/provider.

- Owner decision D-046: whole pages the person ticks go browser → Python (memory only) → OpenRouter after a confirmation that names the pages and says personal details on them are sent. The crop-only rule is waived for now; area drawing remains the least-data route. No file storage anywhere; images are never written to disk or Supabase.
- Confirmed structured lines → Python; relevant labels/amounts/results → text model. Python fills every amount in messages; explanation text is shown with a disclaimer (D-047).
- Local cache (`private/groq-cache`, developer machine only) stores provider responses, not images; hosted cache disabled. Provider retention and OneDrive sync are not verified. Never promise zero retention.
- Ignored `.env.local` holds credentials; never print/request/commit them. Names only: GROQ_API_KEY, OPEN_ROUTER_KEY, BILLSHIELD_ACCESS_CODE (Vercel only), SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, optional BILLSHIELD_ALLOWED_ORIGINS, VISION_PROVIDER.
- Supabase: publishable key plus the person's token; secret keys refused. One anonymous user per browser, stored as a signed pass in localStorage (`billshield-session`). `/api/session` returns 410 only when the refresh token is rejected; other failures keep the pass (D-049).
- Saved: confirmed rows (role/group, not the hierarchy), expectation, finding, message, events. Saved checks are read-only; no delete.

`/api/link-pages` with `mode: "map"` runs the whole-bill pass in its own request (returns `plan: null` when it does not add up). `/api/explain` accepts `contextNotes` beside the review; they are checked again in `gap_llm.clean_notes` and never saved.

Routes: GET /api/health; POST /api/read-page, /api/link-pages, /api/groq-extract, /api/analyze, /api/explain, /api/draft-message, /api/session, /api/messages/{id}/events, /api/reviews, /api/reviews/open; /docs. Access/origin/JSON/size guards apply to every POST.

Vercel entrypoint is root app.py, maxDuration 60 per request (each page and the link pass are separate requests). Do not create root api/ or serve node_modules. Crop/page HTTP body guard 4.4 MB; decoded image ≤ 4,000,000 bytes. Use the main address https://c8-hackathon-killbill2-0.vercel.app — per-deployment URLs are older versions with separate browser storage.

## 9. Exact local commands and common recovery

From billshield-app:

```powershell
# Only for first setup / dependency change:
.venv\Scripts\python.exe -m pip install -e ".[test]"

# Normal application:
.venv\Scripts\python.exe app.py
# Open http://127.0.0.1:4173/ ; API docs http://127.0.0.1:4173/docs

# Offline, no-model/no-database browser acceptance (separate process):
.venv\Scripts\python.exe scripts/ui_fixture_server.py
# Open http://127.0.0.1:4180/

# Verification:
.venv\Scripts\python.exe -m unittest discover -s tests
npm --prefix frontend test
node --check frontend/review-app.mjs
node --check frontend/ui-flow.mjs
git diff --check
```

On a new clone create a Python virtual environment and install frontend dependencies before testing if absent; preserve lockfile and pinned versions. `npm --prefix frontend start` launches a legacy comparison helper, **not** the normal FastAPI app. An old app.py docstring mentioning api/index.py is stale; actual entrypoint is app.py.

Port 4173 listen error means investigate whether the app is already running and open it; do not start another server. Ask before stopping someone else's process. Python changes require restarting that existing process; static HTML/JS/CSS needs Ctrl+F5. Refresh clears unsaved review lines; don't promise restoration from the saving feature. Stop only your own test helper when done.

Offline helper routes `/_test/case/BS-001` through BS-004 select simulated extraction; optional view=charges/total splits fixture replies. They exist only in the test helper. Do not confuse the masked source carrier displayed with actual extraction of its pixels. Do not run live benchmark/explain scripts without checking whether they call a provider or save evidence.

## 10. Reference facts and regression bar

Sanitized in-repo inputs: tests/fixtures/BS-001.json through BS-004.json and tests/fixtures/confirmed/*.confirmed.json. Actual source documents are private/ignored or in parent evidence, not in GitHub.

| Case | Reference facts (code must reproduce) | Forbidden claim |
|---|---|---|
| A / Vodafone | August 14.25 + September 19.50 = EUR 33.75; expected EUR 19.50; previous payment unknown | Definite unpaid/duplicate August, verified overcharge or expected 19.55 |
| B / Canyon | 1499 − 200 = EUR 1299 in one row; packaging 19.90 + delivery 59.90 = 79.80; total 1378.80 | Wrong arithmetic, proven hidden fee/free-delivery promise/refund entitlement |
| C / Flipkart | Contextual bundle invoice totals 39 + 212 + 233 + 5587 + 15757 = INR 21828; components balance | Invented expected price or summing unrelated invoices without context |
| D / IndiGo | Total INR 22434, expectation difference 3000; development fees 2312 + 520 = 2832, not the full gap | 2312 explains 3000, illegal/incorrect fee, send observed |

These are discovery/golden reference facts, not general extraction accuracy. C's historical fixture omits expectation and the reusable API permits arithmetic-only analysis; main UI requires one. Any matching expectation introduced in offline C UI testing was synthetic, not a participant promise.

Important regressions: summary+detail counted once only under conservative rule; missing detail still needs_recheck; equal independent charges retained; subtotal with no members gives actionable correction; row discounts/taxes checked; edited lines/results invalidated; same-area retry preserves edits/multiplicity; page navigation retains lines; ready checkbox skips invalid values; grouping acceptance invalidates after edit; no numerical claims from model prose.

## 11. Known gaps — do not mark them built

- Haiku boxes are row-accurate but horizontally offset; shown as row bands with an AI legend. Exact boxes only from the PDF text layer (untested live).
- Structure verification is exact but depends on the reader: missing rows, wrong periods or multi-invoice bundles still need review. The hierarchy is not saved.
- Dense pages are not timed against Vercel's 60 s limit.
- History is per browser; site-data wiping or another device starts a fresh list. No delete, edit or provider name.
- Outdated status text: "PDF selected … Nothing is uploaded." Stranger found the goal unclear, the UI overwhelming in parts and the next step unclear.
- Test rows and one builder-created "sent" event (anonymous user 183d914c…) are in the real database; not user evidence.
- Known-user test with an observed send and changed-word count is missing. **Nobody has tested the merged D-064–D-066 version.**
- Only EUR and INR pass the reader (`parse_response`), `/api/link-pages` and the review contract; amounts always use 2 decimals; the reader prompt has a Dutch-only rule ("Factuurbedrag"); `amount-candidates.mjs` has names from one German bill (PRD_SCALABLE W1).
- The whole-bill pass replaces the structure only when linking fails; a bill that adds up but repeats lines keeps them. Payments/balances are labelled but the balance equation is not checked in Python.
- The participant's PDF has been replayed from its exported lines, not run end to end on the merged version; Flipkart (C) still stops at grouping questions; the new elements are not checked at phone width.
- Each bill now makes one more AI call (the whole-bill pass); the summary's numbers other than its total are AI-written (labelled).

## 12. Next technical work — owner approval per stage

See docs/PRD.md §12 and docs/PRD_SCALABLE.md §10b. In short: user test of the merged version → W1 any currency/language → Python balance check → repeats on bills that add up → W6 never stuck → held-out real bills for the evaluation scripts.

## 13. Product evidence and records to maintain

Hackathon window in PROJECT: 2026-10-17 22:17 to 2026-10-20 22:17 Europe/Amsterdam. Planned known-user/stranger tests on 2026-10-20 are not assumed completed. Brief's primary target: at least 2 of 3 observed sends with fewer than 20 changed words; minimum one known user and one unassisted stranger. Owner's earlier explanation-first case weakened the send hypothesis; do not redefine past success to make it green.

Check-in 4 known requirements from owner screenshot: live link opens + main flow works once; proof live link; Move 4/Data. Posting is unconfirmed in records. Draft communications only when asked; never post for owner. Never expose access code/keys/private details in screenshots.

Update sequence after material work: detailed work/evidence record → append DECISIONS with date/status/reason/files/verification → PRD as needed → parent PROJECT if available → this handoff/README when operational context changes. In a fresh clone, keep repository-contained records and say parent evidence isn't available; do not fabricate it. Do not treat proposal prose as implementation authority.

Before any owner-authorized push: tests, whitespace/syntax as relevant; inspect outgoing filenames and commits for private/.env/cache/build/runtime inputs and credential patterns without echoing values. Non-force push only; verify remote tracking acknowledgement, then separate public health/static serving from end-to-end owner acceptance. Current secrets, settings, raw documents and screenshots are not handoff material.
