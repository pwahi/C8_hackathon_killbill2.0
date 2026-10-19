# BillShield — detailed Claude Code handoff

Updated 2026-10-19 · PRD v2.8 · decisions through D-043. Read this before proposing or changing code. This is continuation context, not permission to implement every proposal.

## 1. Start here: outcome and current checkpoint

BillShield helps a person check a real bill against what they expected and prepare one accurate complaint or clarification message. It is not a generic bill summarizer. A message is required after every completed review, including a truthful no-issue message. The app never finds provider contacts or sends messages automatically.

**Built:** deterministic Python checks/drafts; browser-local PDF/OCR plus approved-crop Groq reading; FastAPI; smaller Supabase saving implementation; Vercel hosting; five-chapter UI with multi-page reading/recovery, editable lines, section Yes/Change, limited summary/detail exclusion and accept-all-ready checkbox.

**Delivery:** owner explicitly authorized pushing all completed changes on 2026-10-19. Seven implementation commits were pushed from fbb050e through db71a4e. Public Vercel health and current UI assets were verified after push. This handoff/documentation is a subsequent commit; inspect Git for its final SHA/remote state. Do not treat earlier decisions' local-only status as current delivery status.

**Verification:** 114 Python tests and 73 browser-module tests pass on 2026-10-19. Recent browser acceptance used masked source carriers and simulated model output with real Python calculations. This is not new OCR/vision accuracy or an observed user send. Prior owner live-app acceptance and database checks are historical; current hosted end-to-end acceptance is still pending.

**Not built:** full model-understood bill hierarchy/cross-page semantic linking; general summary-versus-detail understanding; chat; loading saved reviews; cross-device history; full expectation/promise chronology; deletion; finding_lines/message_lines join-table migrations; alternate OCR host/evaluation.

**Next checkpoint:** summarize current status and up to three next actions for the owner. Recommend a masked hosted regression and ask whether to implement the proposed structure-first extraction design. The owner's latest request was push + documentation + handoff, NOT approval to build the hierarchy or run new model calls.

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

Expected baseline 114 Python / 73 browser-module tests; rerun, do not copy this count as evidence. Do not run benchmark scripts that call Groq or write the real database as a routine startup action.

## 5. What the person sees now

Five chapters: **Your bill → Read → Check the lines → What we found → Your message**. Finish/self-reported send stays beside the message, not an extra hidden stage.

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
| frontend/review-app.mjs | Page/crop/confirmation/recovery/API orchestration; not the financial engine |
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

Configured code model IDs: vision `qwen/qwen3.8-27b`, text explanation `openai/gpt-oss-20b`, both through Groq. These are inspected configuration, not a guarantee of current provider availability/quota. No OpenAI-hosted adapter is required for these current routes. Do not silently change model/provider.

- Local PDF.js/Tesseract receives bill bytes on the device. Only the approved redacted crop passes browser → Python → Groq in memory; app does not save request images or upload full bills to Supabase.
- Confirmed structured lines → Python; for unexplained differences only, relevant labels/amounts/results → text model. No raw OCR dump/full bill image in analysis/storage.
- Local cache stores provider responses, not request-image files; hosted cache disabled. Separate benchmark scripts may save masked crops under ignored private/. Groq's own retention and OneDrive sync are not verified. Never promise zero retention.
- Ignored `.env.local` contains credentials; never print/request/commit them. Names only: GROQ_API_KEY, BILLSHIELD_ACCESS_CODE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, optional BILLSHIELD_ALLOWED_ORIGINS.
- Supabase server uses publishable key plus the person's token; secret keys refused. Anonymous user per browser with row-level security. No full account/sign-in UX or cross-device continuity.
- Saved: confirmed structured rows, expectation, results/messages/events. Sent text is blanked for private patterns after counting changed words. No retrieval/delete UI/API yet; unsaved browser rows clear on reload. Repeated saves may duplicate records; stale result/history rehydration not implemented.

Routes: GET /api/health; POST /api/groq-extract; POST /api/analyze; POST /api/explain; POST /api/session; POST /api/messages/{id}/events; /docs. Access/origin/JSON/size guards apply. Health flags show configured readiness, never credential values or proof a model/save works.

Vercel entrypoint is root app.py, maxDuration 60 in vercel.json. Do not create root api/ or serve node_modules. Reading vendor assets live outside directories named build/dist; regenerate via scripts/vendor_assets.py only when needed. Crop HTTP body guard is 4.4 MB (function platform limit separate); decoded image ≤4,000,000 bytes. Confirmed JSON payload ≤200 KB. Per-process crop locking is not a global hosted quota manager.

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

- Flat role/group candidates are not a full hierarchy. Wrong headings/periods, missing rows, renamed summaries, duplicate group names and multi-invoice boundaries still need review. No automatic structure investigation across all pages.
- ₹ versus 2, decimal loss and wrong price columns remain extraction risks. Do not hardcode repairs or promise model output is correct because tests pass.
- Overlapping/different crops can duplicate rows. Exact same-area repeat suppression is intentionally narrower.
- Saved reviews exist but cannot currently be loaded/continued/deleted in UI; no unsaved-state persistence or reliable cross-device identity. Full promise source/effective-date/history/versioning incomplete.
- Chat, join tables and alternate OCR comparison are planned; no GPU resources or new processor approved.
- Required user evidence (known user and stranger, actual send/edit outcome) remains missing in records. Owner testing and scripted replays are not a substitute.
- Original hand-drawn architecture/schema photos must be participant-made and linked in final submission. App arrays/smaller schema differ from original sketches. Original brief's file-storage/link expectation conflicts with current no-image-storage choice and needs honest submission review, not a silent privacy reversal.

## 12. Proposed next technical work — requires explicit owner approval

Detailed proposal: PRD §16; original local analysis ../work/17_ACCEPT_ALL_AND_STRUCTURE_FIRST_PROPOSAL.md if available. Do not train/change models by default. Improve the extraction output contract and deterministic validation instead.

1. Agree a small example of bill/invoice → total → sections → detailed rows, plus separate summary/reference links and exact source provenance. Stable IDs, not group-name strings alone. Unknown periods/columns/links stay unknown.
2. Design Python graph verifiers first: existing IDs, correct invoice/period scope, no cycles/orphans/multiple counted paths, summary/reference not an extra charge, sums exact. Test missing/ambiguous data cannot force checks_passed.
3. Consider a structured cross-page reconciliation pass using already-approved candidate context rather than more full images. Exact payload/consent/token/rate/cost policy and persisted representation are open choices. Do not call it live while still a proposal.
4. Show compact proposed breakdown for confirmation; use code-checked structure to investigate sections then supporting rows. AI may suggest grounded explanations/evidence requests, never compute or decide a charge is wrong.
5. Offline acceptance first on four fixtures and synthetic duplicates/periods/tax included/missing pages/multiple invoices/renamed headings/bad graph links; stop for owner review before limited masked live testing.

Definition of done: schema and ownership agreed; deterministic verifiers reject invalid graphs; printed values preserved; no double counting; uncertainty visible; current verdict/draft/privacy tests retained; usable Yes/Change interaction; measured masked test results separated from scripted success; no unapproved storage/deployment changes. Do not silently reprioritise real-user testing to build a broad new architecture.

## 13. Product evidence and records to maintain

Hackathon window in PROJECT: 2026-10-17 22:17 to 2026-10-20 22:17 Europe/Amsterdam. Planned known-user/stranger tests on 2026-10-20 are not assumed completed. Brief's primary target: at least 2 of 3 observed sends with fewer than 20 changed words; minimum one known user and one unassisted stranger. Owner's earlier explanation-first case weakened the send hypothesis; do not redefine past success to make it green.

Check-in 4 known requirements from owner screenshot: live link opens + main flow works once; proof live link; Move 4/Data. Posting is unconfirmed in records. Draft communications only when asked; never post for owner. Never expose access code/keys/private details in screenshots.

Update sequence after material work: detailed work/evidence record → append DECISIONS with date/status/reason/files/verification → PRD as needed → parent PROJECT if available → this handoff/README when operational context changes. In a fresh clone, keep repository-contained records and say parent evidence isn't available; do not fabricate it. Do not treat proposal prose as implementation authority.

Before any owner-authorized push: tests, whitespace/syntax as relevant; inspect outgoing filenames and commits for private/.env/cache/build/runtime inputs and credential patterns without echoing values. Non-force push only; verify remote tracking acknowledgement, then separate public health/static serving from end-to-end owner acceptance. Current secrets, settings, raw documents and screenshots are not handoff material.
