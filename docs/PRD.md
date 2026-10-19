# BillShield — Product requirements

Version 2.8 · 2026-10-19 · Owner: Prateek Wahi

This PRD describes **what is required now** and **what exists now**. It was rebased on 2026-10-19 (D-035) and consolidated for handoff in D-043. Reasons and dated supersessions remain in [DECISIONS.md](DECISIONS.md), through D-043 at this snapshot; earlier PRD versions remain in Git history. When this PRD and code disagree about what *exists*, inspect the code/tests; about what is *required*, this PRD wins. Record discrepancies instead of assuming planning text was implemented.

**Status:** Stages 0–2 previously accepted; FastAPI/Vercel and smaller Supabase saving implementation exist. Owner authorized pushing all current changes on 2026-10-19 (D-043); implementation through db71a4e is pushed to main. Read-only health/static checks confirm Vercel serves the updated UI. Fresh hosted end-to-end acceptance of these UI changes remains pending. N-2 OCR evaluation, N-3 chat/database expansion and full structure-first extraction are not implemented. No observed known-user/stranger product test recorded; tests planned for 2026-10-20.

**Verified baseline:** 114 Python / 73 browser-module tests pass on 2026-10-19. Offline browser replays cover the new UX; Vercel health/static serving verified after push. Neither proves new live extraction accuracy. [CLAUDE.md](../CLAUDE.md) is the detailed continuation guide; [DESIGN.md](DESIGN.md) is the visual reference. Model/provider/storage policies unchanged. Older decision statuses describe their date of entry; D-043 supersedes their delivery status only.

---

## 1. Outcome, evidence and success

**Outcome.** Given a bill and what the person expected or was promised, BillShield identifies the relevant bill lines, shows reproducible calculations, explains what is known and what is still unknown, and **always produces an editable message**. The aim is one accurate complaint or clarification message, not a bill summary. The app never contacts the provider.

**Three output rules (owner, authoritative):**

| Check | Required behaviour |
|---|---|
| Correct numbers | Bill amounts are faithfully extracted and confirmed; code calculates totals and differences correctly. |
| Correct explanation | The lines or periods that explain the difference are identified and linked to a visible source page/table; source precision and missing evidence stay explicit. |
| Message | Grounded in what was found, no invented facts or claims. Without a difference: an accurate no-issue summary, not a fabricated complaint. |

**Success (separate from correctness):** observed sending, amount of editing and what the person does next. Target from the hypothesis: at least 2 of 3 observed users send the message with fewer than 20 words changed; minimum proof: one known user and one stranger use real bills without help. A copy or a stated intention is not a send. Not met yet.

**Evidence base** (parent workspace): [four reference cases](../../deliverables/GOLDEN_PAIRS_CONCISE.md), [detailed reference answers](../../deliverables/BILLSHIELD_GOLDEN_DATASET.md), [hypothesis](../../work/01_HYPOTHESIS.md), paper designs [E-109](../../evidence/E-109_CHECKIN3_PAPER_DESIGN.md). These are discovery cases (Nagarjun/Vodafone, Parikshit/Canyon, Antriksh/Flipkart, Divyae/IndiGo), not unassisted product tests; four cases are limited coverage, not proof of general accuracy.

## 2. Scope

**In:** photo/PDF bill plus expected amount; extraction with confirmation; code-owned arithmetic, checks and comparisons; explanation of differences; one editable message; copy/sent tracking with changed-word count; private saved history per browser; EUR and INR.

**Out:** provider contact lookup or recipient suggestions; automatic sending, refunds or payments; legal judgements ("illegal", "overcharged"); general bill summaries, dashboards or finance advice; tariff research; storing bill images or OCR text; sign-up forms or account management.

## 3. User flow

Conceptual flow remains Provide → Confirm → Understand → Draft → Finish. The owner's desktop HTML mock-up (D-038) presents it as **Your bill → Read → Check the lines → What we found → Your message**; Finish/sent reporting sits beside the draft. Current UI assets are served on Vercel after the authorized push; hosted end-to-end acceptance remains pending. See [DESIGN.md](DESIGN.md).

| Step | Behaviour |
|---|---|
| **Provide** | Choose one PDF or the image pages of one bill (≤ 4,000,000 bytes per file, ≤ 10 pages); currency; decimal mark; **expected amount required** before reading/comparison. Unknown is not replaced with zero or the bill total. |
| **Read** | Photos: recommended **Groq vision** (`qwen/qwen3.8-27b`) on one table area the person draws, previews and confirms free of personal details (one request per area). PDFs: local PDF.js text. Fallback: local Tesseract OCR, or typing an amount seen on a page. Nothing is uploaded without the explicit preview step. |
| **Confirm** | Compact expandable rows beside the source bill; label, amount and type visible; open for editing, group, source and printed row columns. **Looks right — check it** explicitly confirms ready lines then calls Python. Problem lines flagged; lines without a type remain unticked. |
| **Understand** | **What we found**: actual checked result and facts left, maths table right; AI causes separately unverified. Re-check shows source page without inferred error boxes. Outcome A/B/C rules below unchanged. |
| **Draft** | Editable message: numbers and line references from Python; an accepted AI suggestion may pre-select the lines asked about and add one number-free question. **Copy**. |
| **Finish** | **I sent it** (optionally paste the sent text → changed words counted). Saved privately for this browser. Chat about the bill is planned (N-3). |

Multi-page/recovery requirements (D-039): per-page reading/reselection and last-area preview; append without clearing corrections; exact same-area repeat suppression preserving multiplicity; Add a line, remove/Undo; explicit manual printed total/subtotal, never inferred; edits/removal invalidate results; subtle reduced-motion reveal; ask before local OCR reset.

Section and summary requirements (D-040): subtotals and their members use identical section names; structurally link only unassigned contiguous same-area rows without conflicting groups. Offer a visible checkbox picker for each subtotal rather than requiring repeated section typing. Python may exclude a unique cross-page reference summary from summation only when label/section and parsed printed amount match uniquely and detail members exist (full rule in D-040/work/15). Retain references visibly, explain their exclusion, and do not offer them as additional charges to AI. Ambiguity or missing details must not become a false pass; prompt for review. Amounts and evidence are never invented.

D-041 presentation/confirmation override: show Choose page → Select prices → Check preview → Read → Review lines with current step highlighted and one short instruction. Use plain-language actions, one selected page at a time, and explicit Review lines after reading; preserve other pages' lines. Approved-crop consent/provider/privacy stay explicit. Suggest subtotal membership from consistent labels/table order, not amounts; show proposed rows and ask Yes/Change before normal checking. Do not silently apply the old automatic membership mutator. Hide section naming/full picker behind Change; accepted grouping is not verified arithmetic, and edits/removal/reassignment require acceptance again. Python's D-040 summary exclusion and re-check rules are unchanged.

D-042: provide a visible I checked all ready lines against the bill checkbox. It selects only rows passing readiness, shows blocked/partial state, clears acceptance rather than deleting on uncheck, and never approves grouping or arithmetic. Relevant row edits clear row acceptance and invalidate output. Existing explicit Looks right check shortcut remains.

| Outcome | When | Result |
|---|---|---|
| **A — re-check** | a row, subtotal or the printed total does not add up | No verdict, no message, no AI call. Suspect lines are listed and marked (e.g. a discount already inside a row and counted again). After fixing, recalculate; or "I re-checked: the bill really shows these numbers" → `verified_mismatch` with a cautious message naming the figures. |
| **B — no issue** | arithmetic fine; expectation matches | `checks_passed` summary of what was checked; nothing sent to an AI. The reusable core/API still supports absent expectations for arithmetic-only tests, but the main UI requires one (D-037). |
| **C — difference** | arithmetic fine; differs from the expected amount | Python finds groups/lines that exactly equal the expected amount or the difference; then **Groq `openai/gpt-oss-20b`** suggests likely causes from confirmed labels, amounts and Python's results only. Verdict stays `unexplained`. |

Unreadable input gives an actionable error or a request to confirm, never a false no-issue result. Missing evidence is stated; the draft stays cautious.

## 4. Functional requirements

| ID | Requirement | Acceptance | Status |
|---|---|---|---|
| FR-01 | Validate the bill in the browser before reading | Unsupported, oversized or unreadable inputs give explicit errors; no silent partial pass | Done |
| FR-02 | Extract descriptions, signed amounts, row columns, source locations | Candidates match the contract; raw strings kept; missing fields null, never invented | Partly — periods and invoice metadata not extracted |
| FR-03 | Traceable source evidence | Every line has page and precision `exact` / `table` / `page`; no guessed box shown as exact; missing exact box does not block confirmation | Done |
| FR-04 | Confirmation boundary | Calculations use only explicitly confirmed lines; original extraction distinguishable from corrections | Done |
| FR-05 | Exact money arithmetic | Integer cents/paise, Decimal parsing, explicit decimal mark, signed discounts, printed row-column checks, no mixed currencies | Implemented/tested on fixtures; correct extraction/role/group assignment still needed; no general semantic tax/summary guarantee |
| FR-06 | Compare expectation with the bill | Main UI requires an expected amount; total difference separated from exactly explained parts and the unexplained remainder; expectation is never proof | Partly — required input implemented locally (D-037); promise evidence/effective-date intake and period compatibility missing |
| FR-07 | Honest verdicts | Only `verified_mismatch`, `unexplained`, `checks_passed`; unexplained is never "wrong"; failed reading is never checks-passed | Done |
| FR-08 | Chat about the current bill | Uses only the person's review; new facts are proposed corrections needing re-confirmation; no model arithmetic trusted | Planned (N-3) |
| FR-09 | Required draft | Every completed review reaches a draft (incl. no-issue); only Python numbers and valid line links | Done |
| FR-10 | Copy/sent events and edits | Append-only events; changed words measured when the sent text is supplied; unknown ≠ zero | Partly — copied and sent recorded; no separate "edited" event |
| FR-11 | Persistence | Completed structured results saved; intended future retrieval/versioning must preserve what was checked | Partly — saving implemented; unsaved browser review clears on reload; history loading, expectation-change versioning UI and stale-revision handling not built |
| FR-12 | Least-data storage and deletion | Only confirmed lines and derived results stored; deletion of one review with its dependents | Partly — least-data done; deletion not built |
| FR-13 | Ownership isolation | Another user cannot read or add to someone's review | Done — verified live with two anonymous users |
| FR-14 | Failure recovery | Provider timeout/invalid output, write failure never produce a misleading result; duplicate clicks do not duplicate records | Partly — failures safe; duplicate saves on repeated clicks possible |
| FR-15 | Multi-page and crop recovery | Page switching retains edits; each approved crop appends; last-area preview/reselection; exact repeat signatures preserve multiplicity | Implemented/tested offline; overlapping/different crops can still duplicate |
| FR-16 | Manual review and confirmation | Add/remove/Undo, required printed check, ready-line checkbox, relevant edits invalidate acceptance/results | Implemented/tested; confirmation is human transcription review, not arithmetic verification |
| FR-17 | Section membership and reference summaries | Yes/Change proposal confirmation; unique reference-summary exclusion checked by Python, visible in result | Implemented limited heuristic, not general hierarchy; unknown links remain review work |
| FR-18 | Full bill hierarchy and structural investigation | Validated parent/child/reference links across pages, then code-grounded section-to-row investigation | Proposal only; §16; owner implementation approval required |

## 5. Rules that must not break

**Numbers**
- Code owns every amount, sum, comparison and verdict. Models may extract candidates and write validated prose only.
- Amounts are parsed strictly in minor units with the review's explicit decimal mark. A single separator followed by exactly one or two final digits is accepted as a printed decimal mark; anything ambiguous (e.g. `1,499` under the comma setting) is rejected or flagged, never repaired. Only literal currency marks are removed; a leading `2` is never treated as a misread ₹; signs are never flipped.
- Every confirmed line has an explicit role: **charge** (≥ 0, summed), **discount** (typed negative, summed), **adjustment** (e.g. round-off, either sign, summed), **subtotal** (belongs to a group, checked), **total** (at most one, checked). At least one printed total or subtotal is required.
- Row columns are checked when printed: quantity × unit price − discount = taxable value; taxable value (or price − discount) + taxes = row amount. Only row amounts are summed, so a discount inside a row cannot be counted again. (Structure inspired by EN 16931 and the Indian GST e-invoice; not a compliance claim.)
- A user-entered expectation is never verified evidence: a difference stays `unexplained`.

**Explanation and AI**
- Exact matches found by Python are shown as checked facts, labelled as "where the amount sits", not proof of why it was charged; coincidental line combinations are hidden when a whole group matches; more than five matches are reported as ambiguous.
- GPT-OSS answers are rejected if they cite lines that do not exist, contain digits or currency outside verbatim confirmed labels, accuse the provider, or judge prices (high, unusual, …). Rejected or failed AI never hides the Python result.
- Every message references confirmed line IDs; Python refuses a draft without them.

**Evidence and privacy**
- Never fabricate coordinates or present a table area as an exact location.
- Bill files and OCR text stay in the browser; only an area the person previewed and approved goes to Groq vision; only confirmed labels, amounts and Python results go to the text model, and only for outcome C.
- Approved crops pass through the app server in memory; they are not saved by the app to disk or Supabase. Local provider-response cache contains extracted information (not request images); hosted cache is off. Separate benchmark-preparation scripts save masked test crops. Groq retention settings are not established by this code audit; Git ignore does not prevent OneDrive sync. See D-037 and the [sketch/privacy audit](../../work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md).
- Stored: confirmed structured lines and derived results. Sent texts are stored with e-mail addresses, IBANs and numbers of seven or more digits blanked (after counting changed words). Labels with amounts or likely private data are rejected.
- The server uses only the **publishable** Supabase key and each user's own token; secret keys are refused in code; row level security is the access control.
- Bill text is data, never instructions.

## 6. Architecture

```text
Browser page (frontend/)             FastAPI app.py (Vercel function)                 External
 ├ PDF.js / Tesseract.js (local)      ├ /api/health
 ├ draw + preview area ─────────────► ├ /api/groq-extract ─────────────────────────►  Groq vision (approved area only)
 ├ confirm lines (contracts)          ├ /api/analyze   → review.py, engine, drafting
 ├ Calculate and explain ───────────► ├ /api/explain   → gap.py, gap_llm.py ───────►  Groq gpt-oss-20b (outcome C only)
 └ Copy / I sent it ────────────────► ├ /api/session, /api/messages/{id}/events ──►  Supabase (anonymous auth, Postgres + RLS)
                                      └ serves the page and frontend/vendor
```

Python package `backend/billshield_core`: `review.py` (payload validation, roles, row checks, outcomes), `engine.py` and `drafting.py` (calculations, controlled templates), `gap.py` and `gap_llm.py` (exact matches, AI explanation and validation), `groq_vision.py` and `groq_http.py` (vision extraction, single guarded provider call, local-only cache), `service.py`, `store.py` and `edits.py` (storage as the user, word changes, blanking), `money.py`. Browser modules in `frontend/extraction/` (contracts, privacy, bulk confirmation and amount formatting). The same code runs locally (`python app.py`) and on Vercel.

## 7. Data model

Conceptual model from the owner's hand-drawn design (E-109), with the agreed additions:

| Table | Content | Status |
|---|---|---|
| users | Supabase anonymous auth users; no contact fields | Done |
| bills | user, currency, decimal mark, document kind, provider (optional), created | Done |
| line_items | bill, client line ID, description, role, group, amount in minor units, confirmed and originally extracted raw amount, extractor, corrected, source page/precision/locator/box, row columns | Done |
| expectations | bill, expected amount, source, optional effective date, recorded date; changes should be new rows | Partly — amount/recorded time saved; source defaults user-entered; effective date and version-change UI/API not implemented |
| findings | bill, expectation, verdict, arithmetic and comparison status, totals, difference, calculation (formulas, groups, row checks, exact matches), missing information, supporting line IDs, AI explanation | Done |
| finding_lines | finding ↔ line link | Planned (N-3); line IDs stored as an array in findings meanwhile |
| messages | finding, draft text, message type, line IDs, AI question, model | Done |
| message_lines | message ↔ line link | Planned (N-3); line IDs stored as an array meanwhile |
| message_events | message, action copied/sent, blanked final text, words changed, time | Done |
| chat_turns | bill, role, blanked text, time, model, finding referred to | Planned (N-3) |

All tables carry `user_id`; row level security allows each user to read and add only their own rows; no update/delete policies (append-only). A completed review is saved in one transaction (`save_review`); re-check states are not saved; a difference is saved once, after the explanation step. Migration: `supabase/migrations/20261019120000_reviews.sql`.

**Word-change convention:** lower-case, ignore punctuation, split into words, word-level Levenshtein (insert/delete/substitute = 1 each). No sent text → unknown, not zero.

**Identity:** one anonymous Supabase identity per browser (no sign-up). Consequence: history is per browser; another device is another user. Comparing a person's bills over time (question 3 of the owner's question map) is not supported yet.

**Sketch alignment (D-037):** core flow/HLD match; chat, previous-bill comparison, full promise/change chronology, loading history, join tables and file references do not. Arrays preserve current line associations but are not the drawn join tables. Original brief file-storage/link expectations need submission review; do not introduce image storage without a new privacy decision. [Full audit](../../work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md).

## 8. API (implemented)

| Operation | Purpose | Notes |
|---|---|---|
| `GET /api/health` | readiness: version, Groq key configured, access code required, database configured | never shows values |
| `POST /api/groq-extract` | one approved crop → unconfirmed candidate lines | `redacted: true` required; ≤ 4.4 MB; one provider request at a time; no retries; clear message if the answer was cut off |
| `POST /api/analyze` | confirmed payload (schema 2) → result | no provider call; saves outcome B (and re-checked A) when a session is present |
| `POST /api/explain` | outcome C → result + validated AI explanation | saves the review once |
| `POST /api/session` | start or refresh the browser's anonymous session | |
| `POST /api/messages/{id}/events` | record `copied` / `sent` (+ optional sent text) | counts changed words; blanks private details |
| `/docs` | interactive API documentation | |

All POSTs: allowed page origin, JSON only, size limits, access code when configured (required on the hosted server). Errors distinguish invalid input (4xx with a readable reason), provider failure and storage failure; a failure never hides a valid Python result. Planned: chat operations (N-3), reading back and deleting a review.

## 9. Configuration and hosting

- **Environment variables (names only):** `GROQ_API_KEY`, `BILLSHIELD_ACCESS_CODE`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (publishable only), optional `BILLSHIELD_ALLOWED_ORIGINS`. Locally in the ignored `.env.local`; on Vercel in project settings followed by a redeploy.
- **Hosting:** GitHub `pwahi/C8_hackathon_killbill2.0` (public; owner has permission for the names in these documents) → Vercel auto-deploy of `main` → https://c8-hackathon-killbill2-0.vercel.app. Supabase project (EU) with anonymous sign-ins enabled.
- **Vercel constraints:** FastAPI entrypoint `app.py`; 60 s function time (`vercel.json`); request bodies ≤ 4.5 MB; folders named `build/` or `dist/` and `node_modules` are not deployed, so pinned PDF.js/Tesseract.js files live in `frontend/vendor` (`scripts/vendor_assets.py`); no durable local files; Groq responses are cached only on a developer machine.
- **Limits:** 4,000,000 bytes per file and 10 pages in the browser; 200 KB for confirmed payloads; one Groq request at a time per server process.

## 10. Tests

**Reference cases (must hold after every change):**

| Case | Required facts / verdict | Must never claim |
|---|---|---|
| A — Nagarjun / Vodafone | 14.25 August + 19.50 September = 33.75 EUR; arithmetic passes; previous payment unknown; message asks rather than accuses | August definitely unpaid or duplicated; verified overcharge; expected 19.55 |
| B — Parikshit / Canyon | 1499.00 − 200.00 = 1299.00 (as one row); packaging 19.90 + delivery 59.90 = 79.80; total 1378.80; disclosure unknown | wrong arithmetic; proven hidden fee; free-delivery promise; refund entitlement |
| C — Antriksh / Flipkart | invoice totals 39 + 212 + 233 + 5587 + 15757 = 21828 INR, components balance; no expectation → no-issue summary | invented expectation; unauthorized fee; summing unrelated documents without context |
| D — Divyae / IndiGo | lines total 22434 INR; difference 3000; development fees 2312 + 520 = 2832 do not explain the full gap | 2312 explains 3000; fee illegal/incorrect; send completed |

**Current test layers (2026-10-19):** **114 Python / 73 browser-module tests pass**. Includes deterministic four-case replays, money parsing, rows/subtotals/totals, summary references, gap/AI validation, API/storage and browser contracts, selection/recovery/proposals/checkboxes. New UX browser checks used simulated extraction and real Python. Earlier live Supabase and owner Stage-2/live-app checks are historical evidence, not rerun for this push. Fresh post-push verification is limited to health/configuration flags and current static assets. Still required: owner hosted regression with masked bills; per-case live-model correction/uncertainty records; known user/stranger observed tests; a documented Network-panel privacy check. A self-reported sent event is not an independently observed send.

Record for each test run: input, versions, device/browser, failures and corrections. No all-green claim from simulated extraction alone. Zero unsupported wrong-charge claims is the bar on this limited test set, not a guarantee for unseen bills.

## 11. Stages and status

| Stage | Deliverable | Status |
|---|---|---|
| 0 Contracts and fixtures | four sanitized cases, typed contracts | Done |
| 1 Calculation core | deterministic engine, verdicts, controlled drafts | Done |
| 2 Extraction and grounded text | reading, confirmation, row checks, re-check gate, explanation, draft | Done — accepted by owner (D-029) |
| 3 Backend + database | FastAPI; Supabase saving (smaller version) | Mostly done — chat, link tables, deletion pending (N-3) |
| 4 Hosted backend | Vercel with access code | Done |
| 5 UI | owner's step-by-step screens and recovery | Implemented/tested locally, pushed and current assets served; fresh owner hosted acceptance pending (D-043) |
| 6 Observed user tests | known user (classmate) and stranger with their own bills | Not started — planned 2026-10-20 |

After each stage the developer gives the owner changed files, exact run steps, test results, limitations and the next step, and stops for the owner's go-ahead. Pushing, deployments and settings changes need the owner's approval.

## 12. Next development additions

**Proposal only — structure-first extraction (owner question, not implementation approval).** Replace free-text-only grouping with model-proposed parent/child/reference links across approved structured candidates, strictly validated and calculated by Python before grounded investigation. Requires output-contract design, multi-page/multi-invoice/period boundaries, graph/double-counting verifiers and masked acceptance tests; no new model calls, full-image uploads or storage changes authorized. [Proposal and definition of done](../../work/17_ACCEPT_ALL_AND_STRUCTURE_FIRST_PROPOSAL.md). Existing N-1–N-3 priorities are not silently replaced.

N-1 implementation and follow-ups D-036–D-042 are pushed (D-043), with 114 Python / 73 browser-module tests and offline UX verification; owner hosted acceptance remains. N-2/N-3 remain planned, not built. Structure-first extraction is an additional proposal, not silently promoted to an approved next stage.

Priority order (D-034). Keep time for the user tests before the deadline (Tue 2026-10-20 22:17 Europe/Amsterdam); if short, reduce these items, not the tests.

**N-1 — User interface (priority 1).** Turn the working page into the owner's step-by-step design (paper UI sequence, E-109): one primary action per step, bill view beside the confirmation list, plain-language result first with details on demand, Copy / I sent it, privacy notes where data leaves the device, mobile-friendly. Reuse the API and modules; rules unchanged; prefer plain HTML/JS (no build step). *Acceptance:* A–D give the same verdicts and drafts as today; all tests pass; a first-time user needs no explanation of internal terms.

**N-2 — Optional alternate OCR evaluation (not built).** Earlier LightOnOCR-3-0.8B research is historical, not a current availability/hosting guarantee. Reverify official model/runtime details if this is pursued. Time-box comparison on A–D for correct/missed/extra amounts, ₹/2 and decimals, usable evidence, latency and cost. No GPU host, new data processor, provider replacement or deployment is approved merely by listing this item. Retain current local/vision paths unless evidence and owner approval justify adoption.

**N-3 — Chat about a bill + database update.** Chat panel on the result step; answers grounded only in the saved review and validated like the AI explanation (no numbers outside Python's facts, existing lines only, no accusations or price judgements); new facts become proposed corrections that need re-confirmation. Migration: `chat_turns`, plus `finding_lines` and `message_lines` filled from the existing arrays; consider review deletion. *Acceptance:* chat survives reload in the same browser; another user cannot read it; an answer with an invented amount is rejected in tests.

## 13. Open choices and risks

- **Server OCR host and budget** (N-2) — decide only after the comparison.
- **Retention** — keep saved test data through hackathon evaluation, then delete on the owner's instruction; deletion feature not built yet.
- **Identity per browser** — acceptable for tests; cross-device history would need a real sign-in (out of scope now).
- **Model variability** — Groq answers differ between runs; everything stays behind confirmation and validation.
- **Coverage** — four reference cases only; unusual layouts, languages, multi-invoice bundles and handwritten receipts are untested.
- **Time** — real-user evidence is still missing close to the deadline.

## 14. Definition of done (hackathon)

| Item | Status |
|---|---|
| A–D pass the three output rules through the complete local and hosted flow, corrections visible | Four-case core replay passes; prior owner checks historical; current UI offline verified; fresh hosted A–D acceptance pending |
| Required draft for every completed review; no-issue and uncertain cases honest | Done |
| Confirmed lines linked to visible source page/table with honest precision | Done |
| Review, events and line links can be recovered by the same user after reload | Saving exists; history retrieval/UI not built; unsaved review does not survive reload |
| Masked least-data storage and cross-user isolation demonstrated | Done (live check) |
| Same backend locally and on Vercel; secrets and limits verified | Done |
| UI follows the owner's sequential design; copying never implies sending | Implemented/pushed/current assets served; owner/usability acceptance pending — N-1 |
| Real-user evidence (known user + stranger) with actual outcomes and edits | Not yet |
| Owner has run instructions, schema, decision log and honest limits | Done (README, HANDOFF, this PRD) |

## 15. Change history (condensed)

| Version | Date | Change | Decision |
|---|---|---|---|
| 1.0–1.2 | 2026-10-18 | Initial backend-first PRD; bounded uploads; Stage 0/1 core | D-011, D-012, D-015 |
| 1.3–1.6 | 2026-10-18 | Extraction boundary; browser-first reading; Groq vision comparison | D-016–D-023 |
| 1.7–1.9 | 2026-10-19 | Table/page evidence; local Python flow; Groq first for photos, Confirm all | D-024–D-026 |
| 1.10–1.11 | 2026-10-19 | Difference explanation; row columns and re-check gate | D-027, D-028 |
| 1.12 | 2026-10-19 | Current-state summary; next additions N-1–N-3 | D-029–D-034 |
| 2.0 | 2026-10-19 | Rebased: only current requirements and status; outdated directions removed (history in DECISIONS.md and Git) | D-035 |
| 2.1 | 2026-10-19 | Sequential UI first version local; 106 Python / 42 browser-module tests; owner review/deployment pending | D-036 |
| 2.2 | 2026-10-19 | Required expectation in main UI; crop-storage and sketch alignment audit; 106 Python / 44 browser-module tests | D-037 |
| 2.3 | 2026-10-19 | Working UI adapted to owner's desktop HTML mock-up, Finish inside Your message; 107 Python / 47 browser-module tests | D-038 |
| 2.4 | 2026-10-19 | Multi-page append, area recovery, conservative repeat suppression, manual lines/printed total, remove/Undo, reduced-motion row reveal; 107 Python / 58 browser-module tests | D-039 |
| 2.5 | 2026-10-19 | Section membership suggestions/picker and Python-owned reference summary exclusion; incomplete details still re-check; 114 Python / 63 browser-module tests | D-040 |
| 2.6 | 2026-10-19 | Five-step plain-language reading; one active page; explicit review; quick Yes/Change grouping instead of exposed technical editor or silent mutation; 114 Python / 70 browser-module tests | D-041 |
| 2.7 | 2026-10-19 | Visible ready-line acceptance checkbox, safe blocked/partial states and edit invalidation; 114 Python / 73 browser-module tests; structure-first extraction recorded only as proposal | D-042 |
| 2.8 | 2026-10-19 | Authorized push/delivery status; consolidated acceptance and limitations; detailed proposed hierarchy specification and Claude handoff; no new feature implementation | D-043 |

## 16. Structure-first extraction — detailed proposal, not implemented or approved

**Problem.** Current candidates are a mostly flat list with role, free-text group and optional printed row columns. The vision request sees one approved crop. It does not receive a reliable map of the whole bill. Section suggestions and unique label/amount summary matching cannot establish every summary/detail relationship, renamed heading, billing period or tax treatment. Better prompting alone is not a correctness guarantee.

**Intended outcome.** Build a source-grounded proposed map of a bill's printed total, sections, component rows and summary references. Use the checked map to investigate the user's specific difference, not to generate a general bill summary. Keep the current model initially; no training/provider change presumed.

### 16.1 Proposed contract (design to approve before coding)

| Entity / relation | Required meaning | Safety condition |
|---|---|---|
| Bill/invoice boundary | Which document/invoice a total and rows belong to | Do not combine distinct invoices/periods just because uploaded together |
| Printed total node | Exact printed final amount linked to source | Never inferred or model-calculated |
| Section node | Source heading/period or honestly labelled review section | Unknown heading/period stays unknown; no invented tariff/contract facts |
| Detail row | Original signed raw amount, label, role, optional printed columns | Preserve every digit/sign; code parses later |
| Component link | Row or section contributes to a named section/total | Existing IDs only; each monetary contribution counted once per calculation path |
| Summary/reference link | Printed summary repeats another section's amount | Reference not an additional charge; same amount alone is insufficient |
| Source link | Page plus approved table area or genuine exact position | Do not invent coordinates or present a crop as an exact amount location |
| Uncertainty / missing area | Specific unresolved relationship or evidence gap | Ask a focused question/re-read, not a fabricated complete map |

Contract field names, schema version and storage representation are **not decided**. Do not treat this table as an implemented API. Section names alone should not remain the only relationship key. Preserve original extraction separately from accepted relationships/corrections. Included tax versus extra tax, billed versus unit price and distinct periods must be explicit when visible or unknown when not.

### 16.2 Proposed processing sequence

1. Read one approved area through existing privacy/size controls. Extract visible candidates and proposed structure; no sums/comparisons/claims from the model.
2. Collect relevant pages. A possible separate linking pass may use structured candidate IDs/labels/roles/pages and approved context, not another full image or OCR dump. Exact payload, consent, quota/cost and retry policy require design approval before live use.
3. Validate in Python: IDs exist; no cycles/orphans; correct bill/period scope; unambiguous contribution/reference semantics; each contribution counted once. Reject bad structures before drafting or explanation.
4. Show a compact proposed breakdown for human correction, with Yes/Change and honest uncertainty. Avoid making the person rebuild the bill manually when a clear proposal is possible.
5. Python reconciles children with printed subtotal, then sections/standalone rows with the correct printed total. Missing rows/contradictions stay re-check; never discard inconvenient rows to force a match.
6. Investigate the checked sections against the user's expectation, then drill into supporting rows/periods/discounts. AI may select grounded causes or evidence questions using Python facts, not compute gaps or judge charges as wrong.
7. Produce the required editable message with only code-owned numeric claims and accepted line/source links. Existing verdicts/privacy/copy-versus-send rules remain.

### 16.3 Proposed staged acceptance gate

- First approve a small schema example and test plan with the owner; do not implement all planned N-items at once.
- Offline fixtures: summary plus details; identical legitimate charges; duplicate crop; renamed/inconsistent headings; a standalone charge beside a subtotal; periods; tax already included; missing page; multiple invoices; cyclic/unknown/duplicate-parent links.
- Verifiers: no changed source digits/signs; no invented IDs/amounts/boxes; no double-count path; exact Python arithmetic; missing evidence cannot yield a false pass; existing four-case numeric/draft regression preserved.
- Display: source-traceable breakdown, compact confirmation and focused correction; ambiguous cases explicit. Checkbox acceptance is not model-structure verification.
- Privacy/persistence: no full-image upload/storage added by default; proposal IDs/accepted IDs/versioning and saved reference semantics must be designed if persistence changes. Existing saved lines do not contain a full hierarchy.
- After offline approval, owner chooses whether to run limited approved masked live crops. Record missed/extra/wrong rows and corrections, not just a final answer. Token/rate/cost and model variation remain limitations.

**Not authorized by this PRD update:** model calls, new endpoint/schema migration, graph implementation, external resources, new OCR host, training, image retention or automatic sending. Implementation needs the owner's next explicit go-ahead.

## 17. Current operational acceptance and handoff gate

| Check | Current evidence | Remaining acceptance |
|---|---|---|
| Exact core and four sanitized cases | 114 Python tests, fixtures/replays | Unseen bills and correct real extraction are not guaranteed |
| UI contracts and recovery | 73 browser-module tests plus offline browser replays | Owner retest current hosted UI with masked multi-page bill |
| Deployment | GitHub push through db71a4e; current Vercel health/UI assets checked | New hosted end-to-end extraction/calculation/draft/save not run for this push |
| Data isolation/storage | Earlier live verification; current API/storage unit tests | Do not relabel prior checks as new evidence; loading/deletion absent |
| Privacy | Code boundary and ignored input/cache paths | Network-panel check, provider retention settings and OneDrive sync still require verification |
| Product success | Discovery cases and owner feedback only | Known-user/stranger observations, actual send/edit outcome evidence |
| Receiving agent | Repo-contained CLAUDE.md, PRD and decision log | Claude must rerun startup checks and obtain approval for proposed structural work |

Run normal app from application folder with `.venv\Scripts\python.exe app.py`; use existing process if already bound to 4173. Static changes need Ctrl+F5 (unsaved review clears); Python changes need existing server restart. Tests: `.venv\Scripts\python.exe -m unittest discover -s tests` and `npm --prefix frontend test`. Offline acceptance helper `scripts/ui_fixture_server.py` binds 4180, stubs model/storage, and is not a production route or OCR benchmark. See [CLAUDE.md](../CLAUDE.md) for full run/recovery and approval boundaries.

## Sources checked

- [Vercel FastAPI deployment](https://vercel.com/docs/frameworks/backend/fastapi) — entrypoints, static files, limits (2026-10-19).
- [Groq vision](https://console.groq.com/docs/vision), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Groq reasoning](https://console.groq.com/docs/reasoning).
- [LightOnOCR-3-0.8B model card](https://huggingface.co/lightonai/LightOnOCR-3-0.8B) (2026-10-19).
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
- Indian GST e-invoice and EN 16931 outlines — secondary sources listed in D-028.
