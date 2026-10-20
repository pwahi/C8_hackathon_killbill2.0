# BillShield — Product requirements

Version 3.1 · 2026-10-20 · Owner: Prateek Wahi

This PRD describes **what is required now** and **what exists now**. Reasons and dated supersessions are in [DECISIONS.md](DECISIONS.md), through D-066 at this snapshot; earlier PRD versions remain in Git history. When this PRD and code disagree about what *exists*, inspect the code/tests; about what is *required*, this PRD wins.

**Status (2026-10-20, main 9861c5b and later docs):** after the failed participant test (Harsh: confirmation effort, roaming cause missed, payment read as a discount), branch `feature/scalable-check` was built and merged to main with owner approval (D-064–D-066, [PRD_SCALABLE.md](PRD_SCALABLE.md)): lines that add up are **checked by maths** instead of by the person; a **whole-bill pass** says what every line is (counted, repeat, detail, earlier bill, payment, empty) and Python checks it; every bill gets an **About this bill** summary; the reader keeps **notes from the bill's own text**; **Python grades every AI cause** and the cause lines are marked in The maths. Earlier: structure-first whole-bill reading (D-044), Claude Haiku via OpenRouter (D-046), hierarchical line check (D-045), AI story (D-047), three tones (D-048), saved checks (D-049). **Evidence:** one stranger test (E-210, self-reported ~80% independent) and one assisted, failed participant test on the previous version; **no user has tested the merged version yet**, no observed send.

**Verified baseline:** 262 Python / 103 browser-module tests pass on 2026-10-20. [CLAUDE.md](../CLAUDE.md) is the detailed continuation guide; [DESIGN.md](DESIGN.md) the visual reference.

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
| **Read** | Main route: **Read the whole bill** — each page the person ticks goes to the vision reader (**OpenRouter `anthropic/claude-haiku-5.5`**, fallback Groq `qwen/qwen3.8-27b`) with the PDF text layer when available; a text-only linking pass connects the pages; Python verifies the structure (D-044/D-046). Then one text-only **whole-bill pass** (D-065/D-066) says what every line is and summarises the bill; it replaces the structure only when the linking did not check out, and is used only when its counted lines add up exactly to the amount due. The reader also returns short **notes** quoted from the bill (D-064). A confirmation states that the pages, including personal details, are sent. Fallbacks: draw one area (previewed and approved), local PDF.js/Tesseract, or typing a line. One page shown at a time with Previous/Next. |
| **Confirm** | **About this bill** (AI summary, three lines, labelled) above the buttons. Lines whose part adds up to a printed figure and were read cleanly start as **✓ Checked by maths**; discounts, minus signs and unsure readings are always shown to the person (D-064). Repeats, details, earlier bills, payments and empty tables sit under "Shown on the bill — not counted", each with the reason Python checked. The bill's hierarchy: what you pay → sections (collapsed with ✓ when Python verified them) → indented breakdown rows; reference lines (summaries, zero/nested subtotals) listed once, not counted. A section that does not add up shows one plain explanation and names a line equal to the gap. Rows open for editing; an edit withdraws Python's tick. **Looks right — check it** confirms ready lines then calls Python. AI-located rows are marked with a legend: AI-generated, may contain errors. |
| **Understand** | **What we found**: actual checked result and facts left, maths table right (one row per section); the AI explanation is a short story with a disclaimer, separate from Python's facts. Each AI cause shows Python's check of its evidence (green: explains the whole difference; blue: explains part; grey: offset by other lines, or bill text only; unsupported causes hidden) with the bill note it rests on, and its lines are marked "likely cause" in The maths (D-064, D-066). Re-check shows source page without inferred error boxes. Outcome A/B/C rules below unchanged. |
| **Draft** | Editable message in **Warm / Neutral / Direct**, written by AI from Python's fact sheet using placeholders only; Python checks each version and fills in every amount; a failing tone falls back to the controlled template (D-048). Line references from Python. **Copy**. |
| **Finish** | **I sent it** (optionally paste the sent text → changed words counted against the version shown). Saved privately for this browser and listed under **Your earlier checks** in Chapter 1; a saved check opens read-only with Copy / I sent it (D-049). Chat about the bill is planned (N-3). |

Multi-page/recovery requirements (D-039): per-page reading/reselection and last-area preview; append without clearing corrections; exact same-area repeat suppression preserving multiplicity; Add a line, remove/Undo; explicit manual printed total/subtotal, never inferred; edits/removal invalidate results; subtle reduced-motion reveal; ask before local OCR reset.

Section and summary requirements (D-040): subtotals and their members use identical section names; structurally link only unassigned contiguous same-area rows without conflicting groups. Offer a visible checkbox picker for each subtotal rather than requiring repeated section typing. Python may exclude a unique cross-page reference summary from summation only when label/section and parsed printed amount match uniquely and detail members exist (full rule in D-040/work/15). Retain references visibly, explain their exclusion, and do not offer them as additional charges to AI. Ambiguity or missing details must not become a false pass; prompt for review. Amounts and evidence are never invented.

D-041 presentation/confirmation override: show Choose page → Select prices → Check preview → Read → Review lines with current step highlighted and one short instruction. Use plain-language actions, one selected page at a time, and explicit Review lines after reading; preserve other pages' lines. Approved-crop consent/provider/privacy stay explicit. Suggest subtotal membership from consistent labels/table order, not amounts; show proposed rows and ask Yes/Change before normal checking. Do not silently apply the old automatic membership mutator. Hide section naming/full picker behind Change; accepted grouping is not verified arithmetic, and edits/removal/reassignment require acceptance again. Python's D-040 summary exclusion and re-check rules are unchanged.

D-044 – D-049 (current): whole-bill reading with a Python-verified structure replaces manual grouping as the main route; D-039–D-042 controls (append, remove/Undo, manual lines, Yes/Change, ready-line checkbox) remain for drawn areas, typed lines and corrections. Page checkboxes choose which pages are sent. Decimal mark follows the currency; the mark the reader saw on the bill wins. Labels in English with the original label kept. A tax line printed after a subtotal is outside it.

D-064 – D-066 (current, 2026-10-20): **a counted line is either checked by maths or confirmed by the person** (owner-approved change of the rule that every counted line is confirmed by the user). A read line without a type is shown as not counted, without a red mark. Labels may contain plain numbers ("Infinity Family 699 Plan"); only money-like text is refused. The bill's currency is adopted before linking. See D-064–D-066 and PRD_SCALABLE.

D-042: provide a visible I checked all ready lines against the bill checkbox. It selects only rows passing readiness, shows blocked/partial state, clears acceptance rather than deleting on uncheck, and never approves grouping or arithmetic. Relevant row edits clear row acceptance and invalidate output. Existing explicit Looks right check shortcut remains.

| Outcome | When | Result |
|---|---|---|
| **A — re-check** | a row, subtotal or the printed total does not add up | No verdict, no message, no AI call. Suspect lines are listed and marked (e.g. a discount already inside a row and counted again). After fixing, recalculate; or "I re-checked: the bill really shows these numbers" → `verified_mismatch` with a cautious message naming the figures. |
| **B — no issue** | arithmetic fine; expectation matches | `checks_passed` summary of what was checked; nothing sent to an AI. The reusable core/API still supports absent expectations for arithmetic-only tests, but the main UI requires one (D-037). |
| **C — difference** | arithmetic fine; differs from the expected amount | Python finds groups/lines that exactly equal the expected amount or the difference; then **Groq `openai/gpt-oss-120b`** writes a short story of likely causes from confirmed labels, amounts and Python's results only. Verdict stays `unexplained`. |

Unreadable input gives an actionable error or a request to confirm, never a false no-issue result. Missing evidence is stated; the draft stays cautious.

## 4. Functional requirements

| ID | Requirement | Acceptance | Status |
|---|---|---|---|
| FR-01 | Validate the bill in the browser before reading | Unsupported, oversized or unreadable inputs give explicit errors; no silent partial pass | Done |
| FR-02 | Extract descriptions, signed amounts, row columns, source locations | Candidates match the contract; raw strings kept; missing fields null, never invented | Done for whole-bill reading — periods in brackets, English label + original label, invoice label, page kind and decimal mark returned; exact amount boxes only from the PDF text layer |
| FR-03 | Traceable source evidence | Every line has page and precision `exact` / `table` / `page`; no guessed box shown as exact; missing exact box does not block confirmation | Done |
| FR-04 | Confirmation boundary | Calculations use only explicitly confirmed lines; original extraction distinguishable from corrections | Done |
| FR-05 | Exact money arithmetic | Integer cents/paise, Decimal parsing, explicit decimal mark, signed discounts, printed row-column checks, no mixed currencies | Implemented/tested on fixtures; correct extraction/role/group assignment still needed; no general semantic tax/summary guarantee |
| FR-06 | Compare expectation with the bill | Main UI requires an expected amount; total difference separated from exactly explained parts and the unexplained remainder; expectation is never proof | Partly — required input implemented locally (D-037); promise evidence/effective-date intake and period compatibility missing |
| FR-07 | Honest verdicts | Only `verified_mismatch`, `unexplained`, `checks_passed`; unexplained is never "wrong"; failed reading is never checks-passed | Done |
| FR-08 | Chat about the current bill | Uses only the person's review; new facts are proposed corrections needing re-confirmation; no model arithmetic trusted | Planned (N-3) |
| FR-09 | Required draft | Every completed review reaches a draft (incl. no-issue); only Python numbers and valid line links | Done |
| FR-10 | Copy/sent events and edits | Append-only events; changed words measured when the sent text is supplied; unknown ≠ zero | Partly — copied and sent recorded; no separate "edited" event |
| FR-11 | Persistence | Completed structured results saved; intended future retrieval/versioning must preserve what was checked | Partly — saving and read-only reopening of this browser's checks done (D-049); an unfinished review still clears on reload; expectation-change versioning and cross-device access not built |
| FR-12 | Least-data storage and deletion | Only confirmed lines and derived results stored; deletion of one review with its dependents | Partly — least-data done; deletion not built |
| FR-13 | Ownership isolation | Another user cannot read or add to someone's review | Done — verified live with two anonymous users |
| FR-14 | Failure recovery | Provider timeout/invalid output, write failure never produce a misleading result; duplicate clicks do not duplicate records | Partly — failures safe; duplicate saves on repeated clicks possible |
| FR-15 | Multi-page and crop recovery | Page switching retains edits; each approved crop appends; last-area preview/reselection; exact repeat signatures preserve multiplicity | Implemented/tested offline; overlapping/different crops can still duplicate |
| FR-16 | Manual review and confirmation | Add/remove/Undo, required printed check, ready-line checkbox, relevant edits invalidate acceptance/results | Implemented/tested; confirmation is human transcription review, not arithmetic verification |
| FR-17 | Section membership and reference summaries | Yes/Change proposal confirmation; unique reference-summary exclusion checked by Python, visible in result | Implemented; superseded as main route by FR-18 when a verified structure exists |
| FR-18 | Full bill hierarchy and structural investigation | Validated parent/child/reference links across pages, then code-grounded section-to-row investigation | Done (D-044) — invoices/sections/rows/summary links verified by Python; hierarchy not persisted |
| FR-19 | Whole-bill reading with page choice | Each ticked page read once; pages linked; unverifiable structure falls back to plain lines; the person is told which pages are sent | Done (D-046); 60 s Vercel limit per page not timed on dense pages |
| FR-20 | AI message in three tones | One request; placeholders only; Python rejects unknown placeholders, typed numbers, accusations; fills amounts; template fallback per tone | Done (D-048) |
| FR-22 | Confirmation by exception | A line counts when its part adds up to a printed figure and it was read cleanly (confidence ≥ 0.9 or the amount is in the PDF text layer), or when the person confirms it; discounts/minus signs/warnings always shown; an edit withdraws the check | Done (D-064) |
| FR-23 | Make sense of the whole bill | One AI pass names the amount due, the lines that make it up and what every other line is; Python accepts it only when the counted lines equal the amount due and checks copies/details/empty claims; every bill gets a labelled summary | Done (D-065/D-066); replayed on the participant's lines (45 of 49 folded with a checked reason); the participant's PDF itself not yet run end to end |
| FR-24 | Bill notes in the explanation | The reader quotes text that explains charges; personal data drops the note in any language; quotes verified against the PDF text layer when present; notes are never saved | Done (D-064) |
| FR-25 | Python-graded causes | Every AI cause is graded by its evidence (full / part / over / text, unsupported hidden); cause lines marked in The maths with a colour key | Done (D-064, D-066); 13/13 on self-written generated bills, not a real-bill accuracy figure |
| FR-21 | Reopen earlier checks | List and read-only view of the same browser's saved checks; another browser sees nothing; a temporary failure never loses the identity | Done (D-049); no delete, no cross-device |

## 5. Rules that must not break

**Numbers**
- Code owns every amount, sum, comparison and verdict. Models may extract candidates and write validated prose only.
- Amounts are parsed strictly in minor units with the review's explicit decimal mark. A single separator followed by exactly one or two final digits is accepted as a printed decimal mark; anything ambiguous (e.g. `1,499` under the comma setting) is rejected or flagged, never repaired. Only literal currency marks are removed; a leading `2` is never treated as a misread ₹; signs are never flipped.
- A counted line is checked by maths or confirmed by the person (D-064): maths-checked only when its nearest printed figure matches exactly, it is a plain positive charge/subtotal/total and it was read cleanly. Discounts, minus signs and adjustments always need a person, because a payment read as a discount adds up just as well.
- Every confirmed line has an explicit role: **charge** (≥ 0, summed), **discount** (typed negative, summed), **adjustment** (e.g. round-off, either sign, summed), **subtotal** (belongs to a group, checked), **total** (at most one, checked). At least one printed total or subtotal is required.
- Row columns are checked when printed: quantity × unit price − discount = taxable value; taxable value (or price − discount) + taxes = row amount. Only row amounts are summed, so a discount inside a row cannot be counted again. (Structure inspired by EN 16931 and the Indian GST e-invoice; not a compliance claim.)
- A user-entered expectation is never verified evidence: a difference stays `unexplained`.

**Explanation and AI**
- Exact matches found by Python are shown as checked facts, labelled as "where the amount sits", not proof of why it was charged; coincidental line combinations are hidden when a whole group matches; more than five matches are reported as ambiguous.
- AI explanation text is shown with an "AI-generated, may contain errors" disclaimer; references to lines that do not exist are dropped (D-047). Text that enters the message (appended question, AI-written tones) must contain no numbers outside placeholders/confirmed labels and no accusations; amounts are filled in by Python only (D-048). Failed AI never hides the Python result.
- Every AI cause is graded by Python on its evidence (cited lines exist and how much of the difference they cover; quoted notes exist); an unsupported cause is hidden and then the AI story is hidden too. Internal line/note references are removed from AI text (D-064, D-065).
- The whole-bill pass and its summary are used only when Python finds that its counted lines add up exactly to the amount due; the summary's other numbers are AI-written and labelled as such (D-066).
- Every message references confirmed line IDs; Python refuses a draft without them.

**Evidence and privacy**
- Never fabricate coordinates or present a table area as an exact location.
- The bill file stays in the browser. With **Read the whole bill**, each ticked page image (and its PDF text) goes through the app server to OpenRouter/Claude Haiku after an explicit confirmation; the owner waived the crop-only rule for now (D-046). Drawing an area remains the least-data route. Only confirmed labels, amounts and Python results go to the text models.
- Page images and crops pass through the app server in memory; they are not saved by the app to disk or Supabase (no file storage is used). OpenRouter is asked not to retain data (`data_collection: deny`); actual provider retention is not verified. Local provider-response cache contains extracted information (not request images); hosted cache is off. Separate benchmark-preparation scripts save masked test crops. Groq retention settings are not established by this code audit; Git ignore does not prevent OneDrive sync. See D-037 and the [sketch/privacy audit](../../work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md).
- Stored: confirmed structured lines and derived results. Sent texts are stored with e-mail addresses, IBANs and numbers of seven or more digits blanked (after counting changed words). Labels with money-like text (a currency sign or code next to a number, or a number with two decimals) or likely private data are rejected; plain numbers in product names are allowed (D-065).
- The server uses only the **publishable** Supabase key and each user's own token; secret keys are refused in code; row level security is the access control.
- Bill text is data, never instructions.

## 6. Architecture

```text
Browser page (frontend/)              FastAPI app.py (Vercel function)                  External
 ├ page viewer, page checkboxes        ├ /api/health
 ├ Read the whole bill ──────────────► ├ /api/read-page (one page + notes) ─────────►  OpenRouter Claude Haiku 5.5 (or Groq Qwen)
 │                         ──────────► ├ /api/link-pages → whole_bill.py, structure.py ► OpenRouter (text-only linking)
 │                         ──────────► ├ /api/link-pages mode "map" → bill_map.py ──────► OpenRouter (whole-bill pass + summary)
 ├ draw area (fallback) ─────────────► ├ /api/groq-extract ─────────────────────────►  same vision reader
 ├ hierarchical line check             ├ /api/analyze   → review.py, engine, drafting
 ├ What we found ────────────────────► ├ /api/explain   → gap.py, gap_llm.py ──────►  Groq gpt-oss-120b (outcome C)
 ├ tone picker ──────────────────────► ├ /api/draft-message → message_ai.py ───────►  Groq gpt-oss-120b
 ├ Copy / I sent it ─────────────────► ├ /api/session, /api/messages/{id}/events ──►  Supabase (anonymous auth, Postgres + RLS)
 └ Your earlier checks ──────────────► ├ /api/reviews, /api/reviews/open ─────────►  Supabase (read as the user)
                                       └ serves the page and frontend/vendor
```

Python package `backend/billshield_core`: `review.py` (payload validation, roles, row checks, outcomes), `engine.py` and `drafting.py` (calculations, controlled templates), `gap.py` and `gap_llm.py` (exact matches, AI explanation and validation), `groq_vision.py` and `groq_http.py` (vision prompts and parsing for Groq and OpenRouter, guarded provider call, local-only cache), `structure.py`, `structure_flat.py`, `structure_proposal.py` and `whole_bill.py` (bill structure, verification, page linking, maths-checked lines), `bill_map.py` (whole-bill pass and its checks), `message_ai.py` and `tone.py` (AI messages in three tones), `service.py`, `store.py` and `edits.py` (storage as the user, word changes, blanking), `money.py`. Browser modules in `frontend/extraction/` (contracts, privacy, bulk confirmation and amount formatting). The same code runs locally (`python app.py`) and on Vercel.

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

**Identity:** one anonymous Supabase identity per browser (no sign-up), kept as a signed pass in the browser's local storage. History is per browser and is listed in Chapter 1; another device, a private window or a browser that wipes site data on close is another user. Comparing a person's bills over time (question 3 of the owner's question map) is not supported yet.

**Sketch alignment (D-037):** core flow/HLD match; chat, previous-bill comparison, full promise/change chronology, loading history, join tables and file references do not. Arrays preserve current line associations but are not the drawn join tables. Original brief file-storage/link expectations need submission review; do not introduce image storage without a new privacy decision. [Full audit](../../work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md).

## 8. API (implemented)

| Operation | Purpose | Notes |
|---|---|---|
| `GET /api/health` | readiness: version, Groq key configured, access code required, database configured | never shows values |
| `POST /api/groq-extract` | one approved crop → unconfirmed candidate lines | `redacted: true` required; ≤ 4.4 MB; one provider request at a time; no retries; clear message if the answer was cut off |
| `POST /api/analyze` | confirmed payload (schema 2) → result | no provider call; saves outcome B (and re-checked A) when a session is present |
| `POST /api/explain` | outcome C → result + validated AI explanation with Python-graded causes | optional `contextNotes` beside the review (checked again, never saved); saves the review once |
| `POST /api/session` | start or refresh the browser's anonymous session | |
| `POST /api/messages/{id}/events` | record `copied` / `sent` (+ optional sent text, tone, version shown) | counts changed words against the version shown; blanks private details |
| `POST /api/read-page` | one whole page → unconfirmed lines, sections, page kind | `wholePage: true` required |
| `POST /api/link-pages` | read pages → Python-verified structure and line plan; `mode: "map"` → the checked whole-bill pass with summary, or `plan: null` | text only; deterministic merge fallback; two separate requests so each stays within 60 s |
| `POST /api/draft-message` | checked review → message in three tones | placeholders filled by Python; template fallback; nothing saved |
| `POST /api/reviews` | this browser's saved checks, newest first | read-only; needs the browser's token |
| `POST /api/reviews/open` | one saved check in full | 404 for another browser's check |
| `/docs` | interactive API documentation | |

All POSTs: allowed page origin, JSON only, size limits, access code when configured (required on the hosted server). Errors distinguish invalid input (4xx with a readable reason), provider failure and storage failure; a failure never hides a valid Python result. Planned: chat operations (N-3) and deleting a review. `/api/session` answers 410 only when the refresh token itself is rejected.

## 9. Configuration and hosting

- **Environment variables (names only):** `GROQ_API_KEY`, `OPEN_ROUTER_KEY` (vision via OpenRouter; optional `VISION_PROVIDER` to force `groq`/`openrouter`), `BILLSHIELD_ACCESS_CODE`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (publishable only), optional `BILLSHIELD_ALLOWED_ORIGINS`. Locally in the ignored `.env.local`; on Vercel in project settings followed by a redeploy.
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

**Current test layers (2026-10-20):** **262 Python / 103 browser-module tests pass**, adding maths-checked lines, text-layer matching, notes and their privacy, cause grading, the whole-bill map and label rules. Measurement scripts: `scripts/eval_confirmation_load.py` (cached reads: 93 of 166 counted lines no longer need a look), `scripts/eval_synthetic_causes.py` (13/13 generated bills), `scripts/eval_bill_map.py` (replays private reader lines). Earlier layers: four-case replays, money parsing, rows/subtotals/totals, structure verification and page linking (incl. the VAT-after-subtotal case), AI message checks and tone fallback, saved-check summaries/routes/session renewal, line tree, page choice, locate, privacy. Live evidence: owner runs on Vodafone (two pages), IndiGo and an Anthropic invoice with Haiku; Claude's save → list → open → second-browser isolation round trip on the real database; owner's save and reopen after browser restart on Vercel (E-111); one stranger test (E-210). Still required: known-user test with an observed send and changed-word count; A–D regression with Haiku on the hosted app; a Network-panel privacy check. A self-reported sent event is not an independently observed send.

Record for each test run: input, versions, device/browser, failures and corrections. No all-green claim from simulated extraction alone. Zero unsupported wrong-charge claims is the bar on this limited test set, not a guarantee for unseen bills.

## 11. Stages and status

| Stage | Deliverable | Status |
|---|---|---|
| 0 Contracts and fixtures | four sanitized cases, typed contracts | Done |
| 1 Calculation core | deterministic engine, verdicts, controlled drafts | Done |
| 2 Extraction and grounded text | reading, confirmation, row checks, re-check gate, explanation, draft | Done — accepted by owner (D-029) |
| 3 Backend + database | FastAPI; Supabase saving (smaller version) | Mostly done — chat, link tables, deletion pending (N-3) |
| 4 Hosted backend | Vercel with access code | Done |
| 5 UI | owner's chapters, whole-bill reading, hierarchy, tones, saved checks | Done and live; owner end-to-end run on Vercel (D-044–D-049) |
| 6 Structure-first reading | Haiku structure + Python verification across pages | Done (D-044/D-046) |
| 7 Observed user tests | known user and stranger with their own bills | Stranger done (E-210, ~80% alone); known user with observed send pending |
| 8 UI clarity from the stranger test | purpose line, one clear next step per screen, less at once | Done (D-050–D-061) |
| 9 Less checking, better explanations | maths-checked lines, whole-bill pass and summary, bill notes, graded causes | Done and merged (D-064–D-066); no user test of it yet |

After each stage the developer gives the owner changed files, exact run steps, test results, limitations and the next step, and stops for the owner's go-ahead. Pushing, deployments and settings changes need the owner's approval.

## 12. Next development additions

The hackathon deadline was Tue 2026-10-20 22:17 Europe/Amsterdam. Remaining work, in order (details in [PRD_SCALABLE.md](PRD_SCALABLE.md)):

1. **A user test of the merged version** — a stranger with their own bill; time to finish Check the lines; whether the explanation names the real cause; observed send and changed words. Nothing has been claimed about users yet.
2. **W1 — any currency and language**: today only EUR/INR pass the reader and the review contract, and every amount uses 2 decimals; currency and number format should be proposed by the reader and verified by Python (decimals from ISO 4217). Remove the Dutch-only reader rule and the hard-coded names in `amount-candidates.mjs`.
3. **Balance check in Python** (previous balance − payments + this period's charges = amount payable) for lines the whole-bill pass marks as payment or balance.
4. **Repeats on bills that already add up**: the whole-bill pass only replaces the structure when linking fails.
5. **W6 — never stuck**: bills such as C (Flipkart) can still stop at "First confirm which lines belong together".
6. **Held-out real bills** from other countries and sectors for the evaluation scripts.

**Deferred:** N-2 alternate OCR evaluation; N-3 chat and join tables; delete a saved check; provider name in the saved list; cross-device sign-in; persisting the hierarchy.

## 13. Open choices and risks

- **Server OCR host and budget** (N-2) — decide only after the comparison.
- **Retention** — keep saved test data through hackathon evaluation, then delete on the owner's instruction; deletion feature not built yet.
- **Identity per browser** — acceptable for tests; cross-device history would need a real sign-in (out of scope now).
- **Model variability** — reader and text-model answers differ between runs; everything stays behind confirmation and Python verification.
- **Privacy trade-off** — whole pages go to OpenRouter/Anthropic (D-046); retention requested off, not verified.
- **Vercel time limit** — 60 s per request; dense pages untested on Vercel. Local page reads took 5–30 s.
- **Extra AI calls** — every bill now makes one more text call (the whole-bill pass) besides linking, explanation and tones.
- **AI summary numbers** — only the total is checked by Python; other numbers in the summary are labelled AI.
- **Maths-checked lines** — two reading errors that cancel out would still add up; minus signs, discounts and unsure readings stay with the person to limit this.
- **Per-browser history** — browsers that wipe site data on close lose the list (data stays in the database).
- **Coverage** — four reference cases only; unusual layouts, languages, multi-invoice bundles and handwritten receipts are untested.
- **Time** — real-user evidence is still missing close to the deadline.

## 14. Definition of done (hackathon)

| Item | Status |
|---|---|
| A–D pass the three output rules through the complete local and hosted flow, corrections visible | Four-case core replay passes; prior owner checks historical; current UI offline verified; fresh hosted A–D acceptance pending |
| Required draft for every completed review; no-issue and uncertain cases honest | Done |
| Confirmed lines linked to visible source page/table with honest precision | Done |
| Review, events and line links can be recovered by the same user after reload | Done for completed checks (D-049, owner-verified on Vercel); an unfinished review does not survive reload |
| Masked least-data storage and cross-user isolation demonstrated | Done (live check) |
| Same backend locally and on Vercel; secrets and limits verified | Done |
| UI follows the owner's sequential design; copying never implies sending | Done and live; stranger found parts overwhelming — Next 1 |
| Real-user evidence (known user + stranger) with actual outcomes and edits | Stranger done (E-210, no send recorded); known user pending |
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
| 3.0 | 2026-10-19 | Structure-first whole-bill reading with Claude Haiku via OpenRouter and page choice; hierarchical line check; AI story with disclaimer; AI messages in three tones; reopen saved checks; stranger test; 218 Python / 92 browser-module tests | D-044–D-049 |

## 16. Structure-first extraction — original proposal (now implemented, D-044)

*Kept as the design record. Implemented: contract (invoices/sections/rows/summary links), Python verification, cross-page linking pass, compact confirmation. Not implemented: persisting the hierarchy, proposal versioning. The authorization note at the end of this section is superseded by D-044/D-046.*

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
| Exact core and four sanitized cases | 218 Python tests, fixtures/replays | Unseen bills and correct real extraction are not guaranteed |
| UI | 92 browser-module tests; owner end-to-end on Vercel; headless screenshots of saved checks | Clarity fixes from the stranger test |
| Deployment | main through 431a7c9 on Vercel; health shows Haiku reader and database | Dense-page timing against 60 s |
| Data isolation/storage | Live round trip and second-browser check (D-049); owner reopen after restart (E-111) | Delete not built; test rows remain in the database |
| Privacy | No file storage; images in memory only; OpenRouter `data_collection: deny` | Provider retention, Network-panel check, OneDrive sync |
| Product success | One stranger test (~80% alone, self-reported) | Known-user observed send with changed-word count |

Run normal app from application folder with `.venv\Scripts\python.exe app.py`; use existing process if already bound to 4173. Static changes need Ctrl+F5 (unsaved review clears); Python changes need existing server restart. Tests: `.venv\Scripts\python.exe -m unittest discover -s tests` and `npm --prefix frontend test`. Offline acceptance helper `scripts/ui_fixture_server.py` binds 4180, stubs model/storage, and is not a production route or OCR benchmark. See [CLAUDE.md](../CLAUDE.md) for full run/recovery and approval boundaries.

## Sources checked

- [Vercel FastAPI deployment](https://vercel.com/docs/frameworks/backend/fastapi) — entrypoints, static files, limits (2026-10-19).
- [Groq vision](https://console.groq.com/docs/vision), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Groq reasoning](https://console.groq.com/docs/reasoning).
- [LightOnOCR-3-0.8B model card](https://huggingface.co/lightonai/LightOnOCR-3-0.8B) (2026-10-19).
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
- Indian GST e-invoice and EN 16931 outlines — secondary sources listed in D-028.
