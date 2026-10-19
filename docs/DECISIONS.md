# BillShield — Decision log

## D-055 — Check the lines per owner sketch "Page 3"

Date: 2026-10-19. Status: Implemented and tested locally; push pending owner approval.

**Decision:** "Check all lines" (replaces the ready-lines checkbox; same rules) and "+ Add a line" side by side at the top. Each line has two small tools on the right: an eye (show where it is on the bill) and × (delete, with Undo). For a single bill the rows come first (sections with indented sub-lines, then the printed total) and "What you pay — ✓ checked by Python" is the closing row; several invoices keep a header each. Bottom: "Review lines" (red and enabled only when a line has a hint from Python or needs a decision; it opens that line) beside "Looks right — check it". "Message options & data preview" becomes "Advanced (for experts) ⓘ" with a one-line explanation and the privacy note.

**Verification:** 220 Python / 96 browser-module tests; headless Edge walk with the masked two-page Vodafone bill.

**Follow-up (owner feedback, same day):** the chapter title and instructions sit above both columns as in Chapter 2; instructions are three short points; status messages appear in a notification box above the bottom buttons. Rows and sections follow the order printed on the bill (a VAT line printed after a section is no longer listed above it). Sections are grey group headers; their lines are indented with a guide line; every row has a clear divider. A row shows only its name, type and amount (no page or section path when the hierarchy is shown); sections no longer repeat "✓ adds up" — only problems are shown, and the closing "What you pay" bar confirms the rest.

## D-054 — A line the verified bill adds up without is information, not a charge

Date: 2026-10-19. Status: Implemented and tested locally; push pending owner approval.

**Problem (owner, live Lebara PDF):** "Btw 21% over € 8,93 = 1,87" is already inside the printed total of 10,80. The structure verified without it ("✓ all lines add up"), but the line had no instruction from the plan, so the screen showed it as a yellow "Choose type" line; choosing Charge made Python count it on top (12,67 vs 10,80) and stop with a re-check message.

**Decision:** when Python verified every printed total and subtotal (status ok), any line the structure left out is marked "For information only — the bill adds up without it, so it is not counted" and shown as a calm reference row with "Count it anyway". When something does not add up, left-out lines keep their role, because one may be the missing piece. The folded group is renamed "Shown on the bill — not counted" (repeats and information).

**Verification:** 2 new Python tests (information line not counted when verified; kept when not verified). Not yet re-run on the owner's real Lebara PDF, which is not in the test folder.

## D-053 — Read chapter per owner sketch: Prev/Next viewer, page field, one button, notification box

Date: 2026-10-19. Status: Implemented and tested locally; push pending owner approval.

**Decision (owner sketch "Page 2"):** the page viewer header is only "‹ Previous · Page n of N · Next ›" (per-page line-count buttons removed; Zoom kept only on Check the lines). The right panel is "Read your bill" → a **Select pages** field where the person types "1-2", "1, 3" or "2" (shown only for multi-page bills; invalid input is refused with a plain message, never guessed) → one button ("Read all 2 pages" / "Read 1 page" / "Read my bill") → "Other ways to read". Reading messages appear in a notification box under the panel instead of at the top of the page. On Check the lines, the already-accepted grouping confirmations are hidden when Python verified every section. Supersedes D-046's page checkboxes.

**Verification:** 218 Python / 96 browser-module tests (new: page-list parsing and button text); headless Edge screenshots of the Read chapter with one- and two-page bills, the page field and Next.

## D-052 — "CHAPTER n/5" label; previous bills in a two-pane window

Date: 2026-10-19. Status: Implemented and tested locally; push pending owner approval.

**Decision (owner):** chapter labels read "CHAPTER 1/5" with the slash in the logo's orange. The earlier-checks side column is removed as too clunky; "Read my bill" (left, yellow) and "My previous bills (n)" (right, outlined, greyed out until a bill is saved) sit side by side; the latter opens a window with a narrow list on the left — one line per bill: name, date, total, difference or result, message status — and the chosen bill in a wider pane on the right (result, maths, lines, still unknown, message with Copy / I sent it). On a phone the list sits above the bill. Supersedes D-049's list placement; routes and storage are unchanged.

**Limits:** a bill's name is its largest charge label (e.g. "September subscription"), not the company; showing "Vodafone" would need the provider saved (database function change). Two more masked test checks were saved in the real database for the screenshots.

**Verification:** 218 Python / 95 browser-module tests; headless Edge screenshots of Chapter 1 and the window at 1280 px and 390 px with a test session.

## D-051 — Rename to Kill Bill 2.0; landing page; Chapter 1 per owner sketch

Date: 2026-10-19. Status: Implemented and tested locally; push pending owner approval.

**Decision (owner sketches, parent evidence):** the visible name becomes **Kill Bill 2.0**; "BillShield" is removed from every screen and user-facing server message. Logo: the owner's final logo image (KILL BILL with an orange-red slash, 2.0), trimmed with a transparent background in `frontend/assets/`. A clean landing page comes before step 1 (owner: "less text, more clean look"): the logo, "Paid more than you expected?", one sentence, **Check my bill**, centred on the screen, with a small "How it works" link to a separate page that shows You → AI reads it → Code checks every sum → AI words the message → You send it and "Every number comes from code. Your bill image is never saved." The header bar is hidden on the landing page; the small logo in the header returns to it. Chapter 1 follows the sketch: one line "Add the bill…", upload, expected amount / currency / decimal mark in one row, Read my bill; earlier checks in a right-hand column; privacy text moves to the landing page; reading options removed from Chapter 1 (still under "Other ways to read" in Read). Internal names (repository, Python package, browser storage keys, headers) are unchanged so saved checks keep working.

**Verification:** 218 Python / 94 browser-module tests; headless Edge walk from the landing page through all five chapters at 1280 px and 390 px.

## D-050 — UI clarity pass from the stranger test

Date: 2026-10-19. Status: Implemented and tested locally; push pending owner approval.

**Decision (owner: "lets fix the UI"):** each finding in E-210 gets one change. Purpose line and "how it works" in three steps on Chapter 1. "STEP N OF 5" with a progress bar and a one-sentence "what to do now" on every chapter. Read has one main button (Read the whole bill); area drawing, its step list and reading on the device move under "Other ways to read", and the page's area tools only appear when that is opened; "Review lines" appears once there are lines. In Check the lines, lines the reader saw without a type are folded into "Also on the bill — not counted"; their forms no longer open by themselves; when Python verified every total, the ready-lines checkbox and the printed-total reminder are hidden (Looks right — check it still confirms the ready lines). Your message gets a four-step "how to send it" guide; Copy message is the main button and I sent it is secondary. Outdated status texts ("Nothing is uploaded", "Select area to read") replaced. Supersedes D-041's visible five-step reading guide as the default and D-042's always-visible checkbox when the structure is verified.

**Verification:** 218 Python / 94 browser-module tests; headless Edge walk through all five chapters on masked bill B at 1280 px and 390 px (cached AI answers). Not yet retested with a new person.

## D-049 — Reopen saved checks; keep the browser's pass; stranger test recorded

Date: 2026-10-19. Status: Implemented, pushed (490b2fc, 431a7c9) and served on Vercel; owner verified on the main link.

**Decision (owner):** a person can see their earlier checks again. Chapter 1 lists this browser's saved checks (date, two largest charges, total, outcome, message status). A saved check opens read-only: result and maths, checked lines, still unknown, the message or the sent text; Copy and I sent it still work. Saved checks are never edited: checking again saves a new one. No delete yet.

**How:** `/api/reviews` and `/api/reviews/open` read with the browser's own token, so row level security limits them to its rows; no migration. A failed session renewal no longer wipes the stored pass: `/api/session` answers 410 only when the database rejects the refresh token, and only then does the browser start a new identity.

**Verification:** 7 + 2 new Python tests and 3 browser-module tests; live round trip through the local server on the real database (save, list, open, I sent it, reopen; second browser 0 rows / not found); owner saw the check listed after a browser restart on the main link (E-111). Test rows and one builder-created "sent" event remain in the database and are not user evidence.

**Stranger test (owner-supplied evidence, E-210):** completed the flow on the live link; self-reported ~80% independent; barriers: goal not clear at first, parts of the UI overwhelming, next step unclear. Check-in 5 posted Yellow (owner report).

**Limits:** history is per browser (site-data wiping or another device starts a fresh list); bill name is derived from charges, not the provider.

## D-048 — AI-written message in three tones with Python-filled placeholders

Date: 2026-10-19. Status: Implemented and pushed (3845f5f). Owner request: messages written by AI from a fact sheet, all three tones in one request so there is no waiting.

**Decision:** `/api/draft-message` sends Python's fact sheet (verdict, lines and sections as placeholders, the strongest exact match, still-unknown items, the controlled draft with amounts replaced by placeholders) to `openai/gpt-oss-120b`. It returns warm, neutral and direct versions. Python accepts a version only if every placeholder is known, no number appears outside placeholders or confirmed labels, there is no accusation, and at least one placeholder is used; then Python fills in the amounts. A failing tone falls back to the controlled template rewritten in that tone (`tone.py`). Words changed are counted against the version shown. Supersedes the single fixed template as the only message source; the template remains the reference and fallback.

## D-047 — AI explanation shown as a story with a disclaimer

Date: 2026-10-19. Status: Implemented and pushed (3845f5f).

**Decision (owner):** the explanation model becomes `openai/gpt-oss-120b` and writes a short narrative. The Python check that blocked explanation text from being displayed is removed at the owner's request and replaced by a visible disclaimer that the text is AI-generated and may contain errors. Unknown line references are still dropped. Text that enters the sendable message (the appended question) is still checked: no numbers, no accusations. Python's result and verdict are never affected by the explanation. Supersedes the display part of D-027's rejection rules; their message-side rules remain.

## D-046 — Claude Haiku via OpenRouter reads whole pages; the person chooses which pages

Date: 2026-10-19. Status: Implemented and pushed (3845f5f); `OPEN_ROUTER_KEY` added on Vercel by the owner and confirmed by health.

**Decision (owner):** vision reading uses OpenRouter `anthropic/claude-haiku-5.5` when `OPEN_ROUTER_KEY` is set (request asks `provider.data_collection: deny`); Groq `qwen/qwen3.8-27b` stays as fallback. "Read the whole bill" sends each ticked page (with the PDF text layer when available) and is the main route; drawing an area is the fallback. Checkboxes let the person send only some pages. The owner explicitly waived the crop-only privacy rule for now ("i do not care about privacy for now"); the confirmation dialog still states that the pages, including personal details on them, go to the reader. Bill images are still not stored by the app.

**Reason:** Qwen hit Groq's 8K tokens/minute limit and confused sections; local PDF.js/Tesseract reading and manual area drawing were too error-prone and confusing.

**Limits:** OpenRouter/Anthropic retention is requested off, not verified. Haiku boxes are row-accurate but horizontally offset, so they are shown as row bands with an "AI-generated, may contain errors" legend. Vercel's 60 s limit applies per page request; dense pages are not timed on Vercel. Supersedes D-022/D-023/D-026's crop-only/Groq-first reading route and the corresponding privacy wording in D-037; local reading remains available.

## D-045 — Hierarchical "Check the lines" and reading fixes

Date: 2026-10-19. Status: Implemented and pushed (3845f5f).

**Decision (owner UI requests):** Chapter 1 shows upload first, then expected amount, currency and decimal mark (the mark follows the currency; the reader's detected mark wins). Chapter 2 shows one page at a time with Previous/Next. Chapter 3 shows the bill's hierarchy: what you pay, sections that add up collapsed with ✓, breakdown rows indented; the rows must total the paid amount, subtotals are information. A section that does not add up shows one plain explanation under its header and names a line equal to the gap. "Changed" appears only after a real edit; "✓ adds up — but a section below does not" when only an inner section fails. All labels in English with the original label kept; periods in brackets. A tax line printed after a subtotal is outside that subtotal (prompt rule). "Mobile"/"phone" are product words unless followed by number/no/nr/id or digits. Supersedes D-041's Yes/Change grouping as the main route when a verified structure exists.

## D-044 — Structure-first extraction approved and built

Date: 2026-10-19. Status: Owner approved ("go for it", then H2/H4); implemented and pushed (3845f5f). Supersedes the "proposal only" status of PRD §16 and D-042/D-043.

**Decision:** the reader returns structure, not just lines: invoices → optional sections (up to three levels) → rows, plus summary links that repeat a section or invoice. Python verifies it (`structure.py`): every row counted once, subtotals and totals checked exactly; statuses ok / mismatch / incomplete / invalid. Links to unknown or uncountable lines are dropped before verifying. Multi-page bills get a text-only linking pass (`whole_bill.py`), with a deterministic merge as fallback. Python-verified sections are pre-accepted; reference lines (summaries, zero or nested subtotals) are shown but not counted. The flat role/group payload to `/api/analyze` is unchanged, so verdicts, drafts and storage keep working. Not persisted: the hierarchy itself (saved lines keep role/group only).

## D-043 — Push approved implementation; consolidate requirements and Claude handoff

Date: 2026-10-19. Status: Owner explicitly authorized push and documentation/handoff updates; implementation pushed and public serving verified. Final documentation delivery is established by its Git commit/push, not assumed from this entry.

**Authorization:** push the changes made so far first, then detail/update PRD and decisions, lastly produce detailed CLAUDE.md. This authorizes those pushes and their existing main-branch Vercel integration, not new features, model workflows, cloud settings, database migrations or data uploads.

**Delivery evidence:** 114 Python / 73 browser-module tests pass; outgoing file/credential-pattern checks; non-force push fbb050e → db71a4e on origin/main succeeded. Public Vercel health is ok, required configuration flags true; current static UI files expose the ready-line checkbox and plain Read this area action. This is health/static serving verification, **not** fresh hosted end-to-end/model accuracy, saving acceptance or a real-user test.

**Current effective choices:**

| Area | Authoritative choice | Effective status / limit |
|---|---|---|
| Numeric claims, outcomes, required draft | D-007/D-008/D-024/D-027/D-028 | Python computes; three verdicts; needs_recheck blocks draft until corrected or explicitly rechecked; AI prose is constrained |
| Local and vision routes | D-022/D-023/D-026/D-037 | Keep local PDF.js/Tesseract and approved Groq crop; server credential only; no app image persistence; no zero-retention claim |
| Expected amount | D-037 | Required in main UI; API fixture-only arithmetic path can omit it; unknown is never invented |
| Presentation | D-038/D-041 | Owner's desktop reference, restrained theme; five chapters plus five reading substeps; no provider jargon on main read actions |
| Recovery | D-039/D-041 | One selected page, append, reselect/preview, conservative same-area repeats, add/remove/Undo; not general semantic deduplication |
| Section confirmation | D-041 | Suggest, ask Yes/Change, explicitly accept; prior D-040 automatic membership mutator is not called by main app |
| Summary/detail arithmetic | D-040 | Unique cross-page label/section/amount rule only; incomplete detail still fails; not a full hierarchy |
| Accept-all | D-042 | Ready-line checkbox, blocked/partial state, clear acceptance not data; row edits invalidate acceptance; does not accept section links |
| Full structure-first extraction | Proposal in PRD §16 | Not built or approved; requires owner choice and strict code validation before live use |
| Hosting status | This entry supersedes earlier local-only notes | Implementation pushed; current UI files served on Vercel; new end-to-end owner acceptance pending |

**Records:** PRD v2.8; app-root CLAUDE.md (detailed receiving-agent context), concise AGENTS/HANDOFF/README; parent PROJECT and work/18. Earlier decisions are preserved as dated history. Parent discovery/evidence files are not automatically available in a fresh app clone; CLAUDE.md is self-contained for implementation context. [Detailed delivery record](../../work/18_PUSH_AND_CLAUDE_HANDOFF.md).

## D-042 — Visible ready-line acceptance checkbox

Date: 2026-10-19. Status: Owner-requested checkbox implemented and locally verified; owner acceptance/deployment pending.

Add I checked all ready lines against the bill above the line list. Select only structurally ready rows; show skipped counts/reasons and partial state. Unticking clears acceptance, not data. Bulk confirmation revalidates previous selections. Editing a value/label/type/group/row columns/currency clears that row's acceptance and stale output. Checkbox never approves section links or arithmetic; Python still verifies every figure. Existing Looks right action remains an explicit bulk-confirm/check shortcut.

**Affected:** frontend bulk-confirm/ui-flow/review-app/desktop.css and tests; PRD v2.7, DESIGN/HANDOFF/README/AGENTS; parent work/17 and PROJECT. **Verification:** 114 Python / 73 browser-module tests; offline browser select/clear/mixed/edit/blocked-row checks and real Python calculation on synthetic lines. No model/database write, push or deployment. Owner also asked how to improve breakdown understanding: [structure-first proposal](../../work/17_ACCEPT_ALL_AND_STRUCTURE_FIRST_PROPOSAL.md) records a proposed hierarchy/link-validation/explanation approach; **not an implemented or approved model-workflow change**.

## D-041 — Plain-language five-step reading and quick grouping confirmation

Date: 2026-10-19. Status: Owner-approved direction implemented and locally verified; owner acceptance/deployment pending.

Replace provider-labelled page-reading actions and long instructions with a visible five-step reading sequence: Choose page → Select prices → Check preview → Read → Review lines. Show one selected page with persistent selection/reselection; approved crop and provider/privacy disclosures remain. Reading stays on Read until the person chooses Review lines or another page. Empty/busy states do not enable premature review.

Subtotal proposals ask Do these lines belong together? with Yes/Change. Advanced naming/picker is collapsed behind Change. Explicit acceptance changes membership; edits/removal invalidate acceptance. Suggestions use existing consistent names before table order; never money comparison. Supersedes D-040's app-side automatic membership mutation and exposed picker as the normal route, not Python summary/reference arithmetic rules or fallback availability.

**Affected:** frontend read-flow/ui-flow/review-app/page-review/index/desktop.css and tests; PRD v2.6, DESIGN/HANDOFF/AGENTS/README; parent work/16 and PROJECT. **Verification:** 114 Python / 70 browser-module tests; offline two-page selection/preview/reselection/read/review/group acceptance/Change/Python/draft/edit-invalidation replay, desktop and narrow-screen checks. [Work record](../../work/16_SIMPLE_READING_AND_SECTION_CONFIRMATION.md). No live model accuracy, owner acceptance, new data storage, push or deployment claimed.

## D-040 — Repair section membership and count summary/detail once

Date: 2026-10-19. Status: Owner-requested fix implemented and verified locally; owner acceptance/deployment pending.

Owner's multi-page review exposed orphan subtotals and summary/detail double counting. Extractor now requests the same section on subtotal and members. Browser links only unassigned preceding rows within one read area without conflicting groups; explicit subtotal checkbox picker handles ambiguous/wrong memberships and resets affected confirmation. No browser money comparison. Python counts a unique cross-page summary only once when its label matches a unique subtotal's section, parsed amounts agree and detail members exist; reference remains visible. Conflicts/ambiguous cases require review. Incomplete breakdown still triggers re-check, never invented rows or false checks-passed. Model explanation excludes reference summaries; result/math expose counted versus reference rows. Orphan error gives picker instructions.

Extends D-039, not its same-area repeat rule. **Affected:** review/groq_vision/gap_llm, frontend page-review/review-app/ui-flow/result-display/desktop.css and tests; PRD v2.5, README/AGENTS/HANDOFF/DESIGN; parent work/15 and PROJECT. **Verification:** 114 Python / 63 browser-module tests, offline manual-row section-picker browser replay using real Python. No fresh Groq accuracy, owner acceptance, database writes, push or deployment. [Detailed work](../../work/15_SECTION_LINKS_AND_SUMMARY_COUNTING.md).

## D-039 — Multi-page append, selection recovery and editable review

Date: 2026-10-19. Status: Owner-requested changes implemented and locally verified; owner acceptance and deployment pending.

Each loaded page exposes Groq reading and last-area preview controls; another approved crop appends without clearing previous edits/confirmations. Exact repeated original extraction signatures from the same page/area are suppressed with multiplicity preserved. Different areas/pages and changed output are not silently discarded. Each row can be removed and restored with Undo. Removing/editing invalidates prior results/drafts. Local OCR restart asks before clearing existing review lines.

Visible Add a line uses exact user-entered raw values and page-only evidence. An early printed-total/subtotal prompt offers manual entry and blocks checking when missing/incomplete; no inferred totals. Subtotal scope remains explicit. New rows fade in with bounded staggering and reduced-motion support. These changes extend D-038's UI; numeric authority, three outcomes, confirmation, approved-crop privacy and message rules are unchanged. No new storage/provider/deployment.

**Affected:** frontend/extraction/page-review.mjs and tests, review-app.mjs, ui-flow.mjs, index.html, desktop.css; offline scripts/ui_fixture_server.py; PRD v2.4, DESIGN/HANDOFF/README/AGENTS; parent work/14 and PROJECT. **Verification:** 107 Python / 58 browser-module tests; offline two-image append/retry/edit/manual-total/remove/Undo/Python-result replay and six-page PDF controls. Model replies were simulated; no fresh extraction-accuracy or real-user acceptance claim. [Detailed record](../../work/14_MULTI_PAGE_AND_REVIEW_RECOVERY.md). Not pushed/deployed.

## D-038 — Adopt owner's desktop HTML mock-up

Date: 2026-10-19. Status: Owner requested implementation; adapted working desktop UI implemented locally; owner acceptance/deployment pending.

Supplied `BillShield UI mock-ups.html` becomes the desktop visual reference. Chapters now Your bill → Read → Check the lines → What we found → Your message, with Finish/sent reporting inside the message chapter. Replaces D-036's presentation/navigation (not backend rules). Uses compact expandable rows, two-column upload/result/message layouts, checked maths table, real source preview for re-check, and separate Python/AI sections. Amount strings come only from Python results; edits invalidate drafts; needs_recheck gate preserved. Required expectation D-037 overrides older optional mock-up text. No copied example values, fake VAT exclusions or error boxes. No nonfunctional channel/format toggles. Existing server/model/storage rules unchanged.

Anton Latin font extracted unchanged from supplied bundle with licence and self-hosted under frontend/assets/fonts; no external font calls. System sans replaces unbundled IBM Plex. Read preview stays an explicit modal; mobile adapts responsively. New design/reference helper does not execute owner bundle scripts or publish anything.

**Affected:** frontend index/styles/desktop.css/ui-flow/review-app/result-display, local font/licence; UI/display/API tests; scripts/preview_mockup.py; docs/DESIGN.md, PRD v2.3, HANDOFF/README/AGENTS; parent work/13 and PROJECT. **Verification:** 107 Python / 47 browser-module tests; desktop/mobile browser checks; offline structured A/B/D draft replays; C matching UI branch with explicitly synthetic expectation (not new participant evidence); changed-total re-check and explicit re-check draft. [Full record](../../work/13_DESKTOP_MOCKUP_IMPLEMENTATION.md). No live provider/database writes, push, deployment or owner acceptance claimed.

## D-037 — Expected amount required in comparison UI; sketch/privacy audit

Date: 2026-10-19. Status: Owner-directed change implemented and locally verified; not pushed/deployed.

Owner requires "What did you expect to pay?" rather than optional input. All UI reading routes and payload preparation block blank/whitespace; explicit zero and printed decimal strings remain unchanged. Python retains money parsing/comparison authority. Main UI does not invent an expectation for someone who does not know it. Reusable calculation API still supports unknown expectation for arithmetic-only historical tests (C); that path is no longer available through the main UI. Supersedes D-036/PRD v2.1 optional UI input and no-expectation C screen acceptance, not past test results or the no-issue verdict.

Owner also asked about saving crops and alignment with the paper sketches. Audited, not changed: app-generated crops are browser/request memory → server → Groq, no app image persistence or Supabase file link; local provider responses are cached (not image requests), hosted cache off. Existing benchmark script separately saves two masked test crops. Groq retention/settings and OneDrive sync not verified; no zero-retention promise. Smaller schema, chat/history/promise gaps are explicit in [audit](../../work/12_SKETCH_ALIGNMENT_AND_PRIVACY_AUDIT.md).

**Affected:** frontend/index.html, review-app.mjs, ui-flow.mjs, test/ui-flow.test.mjs; PRD v2.2, HANDOFF, README, parent PROJECT/audit. **Verification:** 106 Python / 44 browser-module tests; blank main/local/Groq actions blocked; explicit zero passes expectation guard. No live model or database writes; no storage policy, cloud or image-retention changes.

## D-036 — First sequential UI, local owner-review checkpoint

Date: 2026-10-19. Status: Owner approved implementation; first version implemented and locally verified; owner acceptance and deployment pending.

Owner approved Provide → Confirm → Understand → Draft → Finish with minimal Kill Bill 2.0 accents. Existing API/numeric/extraction/storage rules remain unchanged. Plain HTML/JS, off-white/charcoal/yellow; source details, row columns and JSON behind disclosures; separate Copy and actual-send reporting. A completed result gates Draft/Finish; edits revoke the previous result; needs_recheck exposes a return to charges. New-bill reset clears bill-specific expectation and message settings. No chat, OCR provider change, migration, push or deployment.

**Affected:** frontend/index.html, styles.css, review-app.mjs; new ui-flow.mjs and test/ui-flow.test.mjs; scripts/ui_fixture_server.py (offline test-only); README, PRD v2.1, HANDOFF, AGENTS, parent PROJECT/work record. **Verification:** 106 Python / 42 browser-module tests pass; agent browser replays A–D with simulated extraction/AI and real calculations/drafts, B edited-total gate, Finish/reset and desktop/mobile layout checks. Not live OCR accuracy or real-user evidence. [Detailed record](../../work/11_N1_UI_FIRST_VERSION.md). N-1 owner review remains open; prior deployed version unchanged.

## D-035 — PRD rebased to version 2.0 (current requirements only)

Date: 2026-10-19. Status: Done (documentation only).

Owner asked to rebase the whole PRD and remove outdated decisions. PRD v2.0 replaces the layered v1.x text with one current document: outcome and success measure, scope, user flow with outcomes A/B/C, functional requirements with a Done/Partly/Planned status each, rules that must not break, architecture, data model with build status, implemented API, configuration and hosting, tests with current results, stage status, next additions N-1–N-3, open choices and risks, definition of done, condensed change history. Removed from the PRD: the "earlier technical direction" sections, stacked status paragraphs, the original API proposal, superseded statements (e.g. "an LLM is optional only", "no LLM key required", multipart upload, ten-table storage as already built) and choices since decided. Nothing is lost: reasons and superseded choices stay in this log (entries are not edited), and every earlier PRD version stays in the Git history. Gaps made explicit by the rebase: FR-02 periods/invoice metadata, FR-06 period compatibility, FR-10 edited events, FR-11 reading back/stale revisions, FR-12 deletion, FR-14 duplicate saves on repeated clicks.

**Affected:** docs/PRD.md (v2.0), docs/HANDOFF.md, AGENTS.md, PROJECT.md. **Verification:** documentation only; statements checked against the code and the 106 Python / 40 browser tests run on 2026-10-19.

## D-034 — Next development additions: UI, server OCR evaluation, chat + database

Date: 2026-10-19. Status: Owner direction confirmed; planned for 2026-10-20; **not implemented**.

Owner wants three additions before sending the app to testers, in this order: **N-1 user interface** (priority: the owner's step-by-step design instead of the Stage 2 review layout), **N-2 server-side reading with LightOnOCR-3-0.8B**, and **N-3 chat about a bill with the matching database update** (chat_turns, plus the deferred finding_lines and message_lines link tables). Full scope, acceptance checks and open choices are in [PRD](PRD.md) v1.12, section "Next development additions".

Checked facts for N-2 (model card, 2026-10-19): Apache-2.0, about 0.9B parameters, Markdown output with optional typed blocks and boxes in 0–1000 page coordinates, GPU-oriented runtimes (Transformers, vLLM, SGLang) plus GGUF quantizations, English tag, "isn't deployed by any Inference Provider". It cannot run inside Vercel functions, so it needs a separate GPU host with cost and a new data processor; it reads text but does not assign charge/discount roles. Therefore N-2 starts as a time-boxed comparison against Groq vision on cases A–D and is adopted only if measurably better and approved by the owner.

Reviewer note: real-user tests (A-006 classmate, A-007 stranger) are still at zero and the deadline is 2026-10-20 22:17 Europe/Amsterdam. The plan keeps those tests; if time is short, cut scope inside N-1–N-3 rather than skip them.

Also on 2026-10-19: PRD v1.12 adds a "Current state" summary of D-015–D-033 and corrects outdated statements (LLM use, storage, configuration); earlier text is kept as history.

**Affected:** docs/PRD.md (v1.12), PROJECT.md. **Verification:** documentation only; current suite 106 Python and 40 browser tests pass; no code changed for this decision.

## D-033 — Supabase storage, smaller first version

Date: 2026-10-19. Status: Implemented and verified locally against the owner's Supabase project; hosted settings pending.

Owner chose to build the database before user tests, in a smaller first version of their hand-drawn model (evidence E-109): bills, line_items, expectations (with recorded/effective dates), findings, messages, message_events. Deferred: finding_lines and message_lines (line IDs stored as arrays meanwhile), chat, deletion. Supabase anonymous auth gives each browser an identity without a sign-up form. The server holds only the publishable key and acts with each user's own token; row level security limits every table to the user's own rows, with append-only history (no update/delete policies). `save_review` saves a completed review in one transaction. Only completed reviews are saved (not re-check states); a difference is saved once, after the explanation step. 'Copied' and 'sent' events are recorded; with a pasted sent text the server counts word-level changes (PRD convention) and blanks e-mail addresses, IBANs and numbers of seven or more digits before storing. The page shows a saved notice and an 'I sent it' box. A secret/service-role key is refused.

**Affected:** `supabase/migrations/20261019120000_reviews.sql` (new), `backend/billshield_core/store.py`, `edits.py` (new), `app.py`, `tests/test_store.py` (new), `frontend/review-app.mjs`, `index.html`, `styles.css`, README. **Verification:** Migration run by owner in the Supabase SQL editor. Python suite incl. 10 storage tests and 40 browser tests pass. Live Supabase check: anonymous session, one-step save, sent event with word count, own lines visible (14), second anonymous user sees 0 of the first user's bills/lines and cannot add events to them, nothing visible without login, phone number blanked, session refresh. Browser run on B: saved notice shown and 'I sent it' recorded 5 changed words. Setup issues met: the secret key was first put in the publishable slot (now refused by code; owner advised to rotate it because its first 15 characters were shown during diagnosis) and anonymous sign-ins were initially disabled.

## D-032 — Serve pinned reading tools from frontend/vendor

Date: 2026-10-19. Status: Implemented; hosted check pending redeploy.

First deployment (https://c8-hackathon-killbill2-0.vercel.app, commit d88e253) was healthy and the Groq key was configured, but every /node_modules/... file (PDF.js, Tesseract.js) returned 404, so the page could not open bills; the build-step approach of D-031 did not deliver them. The access code was not active (`accessCodeRequired: false`); the server correctly refused all work with 503 and refused foreign origins with 403. Fix: `scripts/vendor_assets.py` copies exactly the 18 files the page loads (PDF.js main and worker; Tesseract.js ESM and worker; LSTM core variants only; English data; licence files) into `frontend/vendor` (26.8 MB, kept in Git), and app.py serves them at the unchanged /node_modules/... paths, falling back to node_modules on a developer machine. The Vercel build step and `scripts/vercel_build.py` were removed. Owner still needs to set `BILLSHIELD_ACCESS_CODE` in Vercel and redeploy.

**Affected:** app.py, pyproject.toml, scripts/vendor_assets.py (new), frontend/vendor/ (new), tests/test_api.py. **Verification:** full Python suite passes, including a test that all six tool paths return 200 locally. D-031's first commit: d88e253.

**Follow-up (same day):** after the redeploy, health showed `accessCodeRequired: true` (an earlier `false` was a cached answer) and POSTs without or with a wrong code returned 401. Tool files inside folders named `build/` and `dist/` still returned 404, while files in other folders loaded: Vercel leaves such folders out of a deployment. The vendor copies now use short folder names (`vendor/pdfjs`, `vendor/tesseract`, `vendor/tesseract-core`, `vendor/tesseract-eng`), the page loads them from /vendor/..., the separate /node_modules mount was removed, and a test forbids build/ or dist/ folders under vendor. Locally, D (Tesseract) and B (PDF.js) were read through the page again.

## D-031 — Vercel preparation, access code and public repository export

Date: 2026-10-19. Status: Implemented locally; push and deployment pending owner approval.

Preparation for hosting on Vercel (owner: build with FastAPI, then deploy; GitHub repository pwahi/C8_hackathon_killbill2.0, which is public). Owner states they have permission to publish participant first names and their own name, so documents are uploaded unchanged. Changes: app moved to root `app.py` (Vercel's FastAPI entrypoint; a root `api/` folder has a separate legacy meaning on Vercel); `[tool.vercel.scripts] build` runs `scripts/vercel_build.py`, which installs PDF.js/Tesseract.js with `npm ci` from the lockfile and fails if they are missing; `vercel.json` allows 60 s; crop requests capped at 4.4 MB (Vercel limit 4.5 MB). Access code: when `BILLSHIELD_ACCESS_CODE` is set, every POST needs it in `X-BillShield-Access` (constant-time comparison); a hosted server without a code refuses work (503); the page shows an access-code box only when /api/health says it is required and keeps the code for the tab only. Hosted origins come from Vercel's URL variables; Groq responses are never cached when hosted. Clean export: 75 Git-allowed files copied to C:/Users/PWAH/billshield-repo (outside the parent repo and OneDrive); excluded .env.local, private/, node_modules, .venv. Owner pointed out that a separate copy would drift from the working folder; the copy was deleted and `billshield-app` itself was initialized as its own Git repository (nested inside the parent C8 repository), staging the identical 75 files with the same exclusions. Scan: no key values, no emails, no images/PDFs; a made-up phone-like test number was replaced with 0000000000.

**Affected:** `app.py`, `pyproject.toml`, `vercel.json`, `scripts/vercel_build.py` (new), `tests/test_api.py`, `frontend/review-app.mjs`, `index.html`, `styles.css`, `frontend/test/privacy.test.mjs`, README. **Verification:** Python suite (13 API tests) and 40 browser tests pass; local server healthy from app.py. Nothing pushed or deployed yet; the Vercel build step has not run on Vercel. Source: https://vercel.com/docs/frameworks/backend/fastapi No commit link yet.

## D-030 — FastAPI backend replaces the local Node helper

Date: 2026-10-19. Status: Implemented and verified locally; deployment pending.

Owner approved Stage 2 and asked to build the backend with FastAPI and then deploy. Checked first: FastAPI was only planned, never used; the existing route was a Node helper starting Python scripts. Implemented `app.py` (first created as `api/index.py`) (FastAPI 0.146.0, uvicorn 0.54.0): serves the review page and `GET /api/health`, `POST /api/analyze`, `POST /api/explain`, `POST /api/groq-extract`, calling the existing Python modules directly (no subprocess). Guards: allowed page origin, JSON only, size limits (200 KB; 5.5 MB for a crop), redaction confirmation, one provider request at a time per process, no automatic retries, security headers, interactive docs at /docs. Groq response cache only when not in production. Shared explain logic moved to `billshield_core/service.py`, also used by the CLI script. Same file layout is what Vercel expects; deployment, access code and hosted settings are the next step and not done.

**Affected:** `app.py` (new; first created as `api/index.py`), `backend/billshield_core/service.py` (new), `scripts/explain_difference.py`, `tests/test_api.py` (new), `pyproject.toml`, README, PRD, PROJECT. **Verification:** 11 new API tests (test client, provider stubbed) plus the existing suite pass; 40 browser tests pass. Live local server: health OK (key configured, no value shown); headless-Edge replay of B through the page reproduced re-check → fix → explanation → draft; D through local OCR worked (wasm served as application/wasm) and only POSTed to the app's own address. No commit link.

## D-029 — Stage 2 accepted by owner

Date: 2026-10-19. Status: Confirmed.

Owner sign-off 2026-10-19: the project owner reviewed the Stage 2 flow in the browser (Participants A–D, Groq-first reading, Confirm all, Python checks, re-check gate, difference explanation and editable draft) and stated "everything is approved, we can go for next step". Stage 2 is closed on owner acceptance. Recorded limits: four reference cases only; the Network-panel privacy check and per-case correction counts were not separately documented; live Groq row-column quality was judged by the owner, not measured. No database, deployment or Stage 3 work has started.

**Affected:** PRD stage status, Stage 2 record, PROJECT. **Verification:** owner statement in session; latest automated checks: Python suite and 40 browser tests pass.

## D-028 — Row columns, re-check before any message, and unambiguous decimal marks

Date: 2026-10-19. Status: Owner approved; implemented and locally verified; live Groq row extraction and owner retest pending.

Owner hands-on test on Participant B (2026-10-19): Groq returned the bicycle's after-discount amount (1,299.00) and the same −200.00 discount as a separate line, so Python summed 1,178.80 against the printed 1,378.80. Python flagged the mismatch, but the screen labelled it a verified billing mismatch, drafted a complaint and still called the AI. The owner asked why the row's own price/discount/amount was not checked and approved a row-based structure inspired by existing invoice standards, usable for Indian bills.

Rows may carry their printed columns (quantity, unit price, discount, taxable value, up to four tax amounts). Python checks quantity × unit price − discount = taxable value and taxable value (or price − discount) + taxes = row amount, and sums only row amounts, so a discount inside a row cannot be counted twice. New `adjustment` role for round-off lines (either sign). Structure inspired by EN 16931 (line amounts, allowances, VAT, rounding) and the Indian GST e-invoice (taxable value = gross − discount; CGST/SGST/IGST added; round-off); only the outline was confirmed from secondary sources, so this is "inspired by", not compliance. Prepaid/previous-balance check deferred. When a row, subtotal or the printed total does not add up, the result is `needs_recheck`: no verdict, no draft, no AI call; suspects are listed and marked on cards (failed rows, failed groups, a separate discount equal to a discount inside a row, lines equal to the exact gap). Only after the person presses "I re-checked: the bill really shows these numbers" does the flow produce `verified_mismatch` with a cautious draft naming the row; any later edit clears that statement. AI explanation now runs only for outcome C (arithmetic fine, differs from expectation). Groq prompt asks for one line per row with columns, never a duplicate discount line, and `other` for MRP or information-only VAT. Amount parsing now also accepts one separator followed by exactly one or two final digits as a printed decimal mark ("-200,00" on a point-decimal bill), because a thousands group always has three digits; three-digit forms such as "1,499" under the comma setting are still rejected.

Sources consulted for the outline (secondary, not the official artefacts): [GST e-invoice schema summary](https://navimumbai.icai.org/detail/38865.aspx), [GST JSON format](https://sleekbill.in/images/articles/Json-format-e-invoice.pdf), [EN 16931 overview](https://econnect.eu/en/docs/knowledge/document-formats/formats/en-16931-cius-pint), [EN 16931 validation artefacts](https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.5).

**Affected:** `backend/billshield_core/review.py`, `drafting.py`, `extraction.py`, `groq_vision.py`, `gap_llm.py`; `tests/test_review.py`, `tests/test_groq_vision.py`, `tests/fixtures/confirmed/*.json` (new `printedFiguresRechecked: false`); `frontend/extraction/contracts.mjs`, `privacy.mjs`, `bulk-confirm.mjs`, `frontend/review-app.mjs`, `index.html`, `styles.css`, `frontend/test/confirmed-payload.test.mjs`; README, [PRD](PRD.md) v1.11, [Stage 2 record](../../work/09_STAGE_2_EXTRACTION.md), PROJECT. Partly supersedes D-025's rule that `33,75` under the point setting is rejected.

**Follow-up (same day):** Owner hands-on result, 2026-10-19 (owner-reported, not agent-verified): the D-028 flow "works amazing" for Participants B and D and identifies the typical problem areas. Owner noticed Groq values are copied as printed even when a field expects only a number (quantity "1 PC"). Follow-up implemented: Groq prompt now specifies field formats; the browser removes a trailing unit word from quantity and drops percentage rates from tax amounts, with a note on the card; other odd values stay visible with a "check" note; Python accepts a number followed by a unit word for quantity and still rejects anything else ("two", "1/2"). Digits and decimal marks are never changed. Tests: Python suite and 38 browser tests pass.

**Verification:** 80/80 Python and 36/36 browser tests pass (new: Canyon row, duplicate discount → re-check with pointed suspect, row mismatch → re-check then cautious draft, Indian GST taxable value + CGST + SGST, quantity × price, round-off, row details only on charges, Groq column parsing). Headless Edge on B's PDF with an intercepted prepared Groq answer reproducing the owner's case (no vision call): first run stopped at re-check with the discount marked "probably counted twice" and the message hidden; after unticking it, total 1,378.80 matched, each row check matched, Python found bike row = expected and packaging + delivery = difference, one live gpt-oss-20b call suggested packaging and delivery, and the draft asked whether they were in the original quote. Live Groq vision quality on row columns is not yet measured. No commit link.

## D-027 — Difference explanation: Python exact matches, then a validated GPT-OSS suggestion

Date: 2026-10-19. Status: Owner directed; implemented and locally verified with limited live calls; owner retest pending.

Owner direction (2026-10-19): the app lacked an "intelligence layer" that points to what explains a difference. Agreed pipeline: Groq Qwen vision extracts → person confirms → Python checks → if no difference, nothing more → if there is a difference, the package goes to Groq `openai/gpt-oss-20b`, whose suggested cause feeds the draft.

Implemented: `gap.py` searches deterministically for confirmed groups (preferred) or up to four lines that equal the expected amount, the difference, or a failed printed-total gap; coincidental line combinations are hidden when a whole group matches; more than five matches are reported as ambiguous. `gap_llm.py` sends only confirmed labels/roles/groups, code-formatted amounts, verdict and Python's matches, using short refs (L1…) instead of internal IDs; no image or OCR text. The answer is rejected unless it cites existing refs only, contains no digits or currency outside verbatim confirmed labels, does not accuse the provider, and does not judge prices as high/unusual/excessive (the model never sees prior prices). Valid answers may pre-select the lines the message asks about (only when the person ticked none) and append one digit-free question; numbers, verdict and calculations are unchanged. `groq_http.py` now holds the single guarded Groq call (no retries, no echoed bodies, private cache) shared with the vision adapter. New loopback `/api/explain` route; Python recalculates from the confirmed lines rather than trusting browser results. The page button is now **Calculate and explain** and shows "Why is there a difference?" with ✅ Python matches and 💡 AI suggestions separately.

**Privacy:** for PDFs read locally, this is the first step that sends data off the device; it happens only when Python finds a difference and sends confirmed structured lines, not the document. The page text now states this; the earlier "Nothing goes to the internet" wording was removed.

**Affected:** `backend/billshield_core/gap.py`, `gap_llm.py`, `groq_http.py` (new); `groq_vision.py`, `review.py`, `drafting.py` (list wording "A, B and C"); `scripts/explain_difference.py` (new); `tests/test_gap.py` (new), `tests/test_groq_vision.py`; `frontend/local-server.mjs`, `review-app.mjs`, `index.html`, `styles.css`; README, [PRD](PRD.md) v1.10, [Stage 2 record](../../work/09_STAGE_2_EXTRACTION.md), PROJECT.

**Verification:** 71/71 Python and 34/34 browser tests pass. Exact matches: A → September = expected, 6-31 August = difference; B → bicycle + discount = expected, packaging + delivery = difference; C → no difference, nothing sent; D → no exact combination. Live GPT-OSS calls on D's sanitized reference data: the first valid answer judged prices ("higher than usual"), which led to the stricter prompt and price-judgement filter; the next answer asked neutrally whether the fuel charge, User Development Fee and GST were in the original offer. Headless-Edge run on D's photo (Groq vision intercepted with a cached response; one live GPT-OSS call) showed the full chain and an editable draft ending with a neutral AI question. AI reasons shown on screen can still sound over-certain (for example "not expected in initial quote"); they are labelled unverified and do not enter the message. Line choice varied between calls. Not yet measured: answer quality on A and B live, owner retest. No commit link.

## D-026 — Groq first for photos, model-suggested roles, and explicit Confirm all

Date: 2026-10-19. Status: Owner approved both proposals; implemented and locally verified; owner hands-on retest and live Groq check pending.

Owner feedback after first hands-on use of the D-025 flow (2026-10-19): Python results work, but filling and checking every line by hand is too tedious; the app should detect the costs and fill most text and numbers, asking only for confirmation. Local OCR still confuses the rupee sign with 2. Owner tested Groq area selection and reports it reads and fills the tables very well. Owner approved (1) Groq as the recommended reader for photos with local OCR kept as fallback, and (2) a single explicit **Confirm all ready lines** action instead of ticking each line.

Groq's prompt now also asks for a suggested `role` (charge, discount, subtotal, total or other) and optional `group` per line; unknown values are dropped, not repaired. The page pre-fills label, amount, role and group, follows the model's currency when given, and starts table selection immediately after opening a photo. *Confirm all ready lines* ticks only lines that pass the same browser contract checks (amount, label, role, sign, group for subtotals, privacy, currency); lines without a role (including model `other`) stay unticked; failing lines show a plain-language red note. No amount is changed and no sign is added: a suggested discount without a minus sign is flagged for the person. Python still owns all arithmetic; a wrong role suggestion shows up as a failed printed total/subtotal check. PDFs keep the local PDF reader as recommended. This settles D-022's pending default for photos only; local OCR remains available and no automatic upload occurs.

**Trade-off:** The selected table area is sent to Groq after preview and redaction confirmation, as under D-023. Changing the prompt changes the cache key, so earlier cached responses will not be reused for new requests.

**Affected:** `backend/billshield_core/extraction.py`, `groq_vision.py`, `tests/test_groq_vision.py`, `frontend/extraction/bulk-confirm.mjs` (new), `frontend/test/bulk-confirm.test.mjs` (new), `frontend/review-app.mjs`, `frontend/index.html`, `frontend/styles.css`, README, [PRD](PRD.md) v1.9, [Stage 2 record](../../work/09_STAGE_2_EXTRACTION.md), PROJECT.

**Verification:** 59/59 Python and 34/34 browser tests pass. Headless Edge on D's photo: Groq button highlighted for a photo, selection mode started automatically, `/api/groq-extract` intercepted and answered with the cached D response plus test-added role suggestions and one `other` line (no live call); 8 lines pre-filled and ticked by Confirm all, the `other` line left unticked, verdict and draft as expected. Live Groq role-suggestion quality is not yet measured. No commit link.

## D-025 — Implement D-024 provenance, explicit line roles, and local confirmed → Python → draft flow

Date: 2026-10-19. Status: Implemented and locally verified with automated tests and an agent-scripted browser replay; owner four-case review pending. Stage 2 remains open.

Implements D-024. Confirmed lines carry source precision `exact` (amount `bounds` plus locator: PDF text, local OCR, Groq or user), `table` (selected area as a separate `region`, never as amount bounds) or `page` (no coordinates). Browser and Python both reject mixed or fabricated shapes. Missing exact bounds no longer disable confirmation; exact marking is optional. Groq lines without boxes become table-level lines drawn as a labelled dashed area.

Every confirmed line has an explicit role: charge (non-negative, summed), discount (typed negative, summed; never sign-flipped), subtotal (grouped; checked, never summed) or total (at most one; checked). Groups without a printed subtotal are calculated but reported as not checked. At least one printed total or subtotal is required. A review-level decimal mark is explicit; amounts that contradict it are rejected, not repaired. Only literal currency marks are removed. Labels with amounts, currency marks or likely private data are rejected because they enter the draft.

Payload schema 2 (`schemaVersion`, `currency`, `decimalSeparator`, `expectedAmount`, `messageType`, `earlierPeriodGroup`, confirmed lines with role/group/label/raw and originally extracted amount/extractor/question flag/source) goes from the page to loopback `/api/analyze`, which runs local Python only. `review.py` re-validates, calls the existing engine, selects a controlled template by rule or validated user choice, and returns verdict, formulas, checks, provenance, missing evidence and a required draft linked to confirmed line IDs. User-entered expectations are never verified evidence, so differences stay `unexplained`. Failed printed checks give `verified_mismatch` with a cautious `arithmetic_mismatch` draft. Added templates/variants: `arithmetic_mismatch`, matching-expectation summary, quote difference without singled-out lines.

**Reason:** D-024 removes mandatory box drawing; roles prevent double-counting subtotals/totals; the local route completes the Stage 2 flow without persistence, database or deployment.

**Affected:** `backend/billshield_core/review.py` (new), `engine.py` (separate `calculate` step; optional printed figures), `models.py`, `drafting.py`, `scripts/analyze_confirmed_review.py` (new), `tests/test_review.py` (new), `tests/fixtures/confirmed/` (new, four synthetic page-level payloads), `frontend/extraction/contracts.mjs`, `frontend/extraction/privacy.mjs`, `frontend/review-app.mjs`, `frontend/index.html`, `frontend/styles.css`, `frontend/local-server.mjs`, `frontend/test/privacy.test.mjs`, `frontend/test/confirmed-payload.test.mjs` (new), README, [PRD](PRD.md) v1.8, [Stage 2 record](../../work/09_STAGE_2_EXTRACTION.md), PROJECT.

**Verification:** 58/58 Python and 28/28 browser tests pass; original fixtures unchanged. Confirmed payloads reproduce all four golden verdicts and exact drafts. Live loopback route returns expected results and refuses foreign origin/wrong purpose (403); secret file not served (404). Headless Edge replay of all four masked bills through the real page (scripted confirmation, value-matched candidates, not owner review) ended in the reference drafts; only the structured preview was POSTed, to 127.0.0.1. Table-level path verified in-page using an intercepted request answered by a cached validated D response; no live Groq call. Raw candidate matches: A 1/8, B 4/5, C 14/14, D 0/8. No commit link.

## D-024 — Table-level evidence confirmation; continue local integration before more OCR tuning

Date: 2026-10-19. Status: Owner direction confirmed; requirement recorded, implementation pending.

Owner reports that mandatory per-amount source marking adds too much work and accepts proceeding after discussion of table-level confirmation. Show the selected source table/page beside editable extracted lines and require explicit user confirmation of the amounts and labels. Exact row/amount highlights are optional where reliable. Preserve stable line IDs and source page/region identity; distinguish `exact` localization from `table` or `page` evidence rather than presenting a broad region as an exact line box. Never invent bounds. Unreadable amounts still require correction or exclusion, not silent acceptance.

Retain both local OCR and optional Groq vision; extractor selection remains pending measured comparison. Continue with the complete local confirmation → Python calculation → controlled draft flow before further OCR polish. Require explicit charge/subtotal/total roles to prevent double-counting. Keep Stage 2 open until four-case post-confirmation replay and privacy checks pass. This is not authorization to skip numeric verification, deploy, or create cloud/database resources.

Supersedes D-023's requirement to block confirmation solely because exact model boxes are unavailable, and the older PRD's mandatory exact-highlight gate. Current code still has that block: removing it requires contract/UI/payload changes and tests. Do not claim this decision is implemented.

Affected requirements: PRD source rule, FR-03, confirmation flow and Stage 2/5 gates; work record, README and PROJECT. Expected implementation files include browser review/contracts/privacy and Python extraction/confirmation boundaries. Verification: documentation audit only on 2026-10-19; last observed implementation tests were 32 Python and 21 browser tests. No new runtime verification or commit link.

## D-023 — Expose optional Groq comparison in the local test harness

Date: 2026-10-18. Status: Implemented; browser smoke test passed for three D prices; full gate open.

Owner requests browser testing of Groq. Provide local bill rendering, charge-table area selection, exact crop preview and explicit redaction confirmation before a loopback Node/Python bridge sends that area to Groq. No frontend key, automatic fallback upload or deployment. Persist benchmark responses only in ignored private local cache to reduce repeated API calls. This is a limited Stage 2 test bridge, not completion of the Stage 3 API/database or Stage 5 production UI. Retain local OCR alongside vision.

Model amounts and boxes remain unconfirmed. Map valid crop boxes to original-page coordinates; unavailable boxes block confirmation until user marks the source. Permit source marking without retyping model fields. Lower output allowance to 2048, surface safe rate-limit timing, and avoid automatic retries.

Affected: local server, review page/styles, `groq_browser_bridge.py`, Groq adapter/cache tests, README, PRD and Stage 2 record. Verification: 32 Python and 21 browser tests pass; foreign-Origin request blocked and secret path unavailable; live browser D crop returned three source-matching prices (15,800 / 650 / 1,800 INR) but no usable boxes. Four-case accuracy, source acceptance, calculation and draft replay still pending.

## D-022 — Keep local OCR and optional Groq vision for comparison

Date: 2026-10-18. Status: Owner confirmed; offline benchmark implemented, live test and default selection pending.

Retain browser PDF.js/Tesseract.js and add a separately invoked Groq `qwen/qwen3.8-27b` benchmark on already-redacted commercial-table crops. Owner explicitly authorizes hosted crop testing and requests keeping both paths until comparison. This narrowly supersedes D-017's local-image-only boundary for the optional benchmark. Local OCR never automatically falls back to hosted upload. Only the selected crop is transmitted when the benchmark command is explicitly run; local-only image privacy claims do not apply to that route.

Key stays in ignored local configuration, outside browser assets. Model extracts unconfirmed candidates only; code owns all calculations and controlled numeric messages. Crop-relative source boxes require human verification and original-page mapping before acceptance. Compare accuracy, irrelevant/missing lines, corrections, localization, timing, provider usage, and privacy before selecting a default.

Affected: `backend/billshield_core/groq_vision.py`, `scripts/benchmark_groq_crop.py`, tests, `.env.example`, README, PRD, Stage 2 record, PROJECT. Verification: 30 Python tests pass and ignored configuration verified. No live request or verified model accuracy yet. Official reference: https://console.groq.com/docs/vision .

## D-021 — Automatically prepare images and retry empty amount detection locally

Date: 2026-10-18. Status: Implemented; real-browser accuracy retest pending. Owner authorized reducing manual OCR effort.

Use a temporary enlarged grayscale/contrast-adjusted canvas for image OCR. Retry sparse-text segmentation automatically when the first prepared reading finds no amount candidates. Retain the initial reading unless the retry supplies candidates. Both outputs remain untrusted and require source confirmation. Raw source images remain unchanged. A local reproduction confirmed A's second image loses prices before the candidate filter.

Affected: `frontend/extraction/image-preparation.mjs`, `frontend/extraction/ocr-client.mjs`, `frontend/review-app.mjs`, tests, and Stage 2 record. Verification: 21 browser unit tests and syntax checks pass; real-image improvement and regression review remain pending. No API or model calls added.

## D-020 — Manual source selection when OCR misses amounts

Date: 2026-10-18. Status: Implemented; interactive acceptance pending. Owner requested manual fallback for the available images.

Allow a user to draw a source box on a rendered page and enter the amount and description manually. Require explicit confirmation and existing payload validation. Explain that zero detected candidates does not mean zero amounts. Preserve OCR failure in the evaluation record. Ask for clearer images in future collection rather than requiring replacement of current evidence.

Affected: `frontend/review-app.mjs`, `frontend/styles.css`, and Stage 2 record. Verification: syntax check and 20 browser unit tests pass; manual drawing remains to be tested interactively. No calculation or cloud change.

## D-019 — Filter non-price context and offer a local amount OCR retry

Date: 2026-10-18. Status: Implemented; real-document retest pending. Owner authorized the proposed correction after the second test.

Exclude candidates near bank/account, tax identifiers, registration, address/contact, and company-detail labels using local-column context. Preserve actual tax charges. Offer a padded, four-times enlarged crop and local single-line OCR retry for each candidate. Display the new reading as a suggestion; do not overwrite the current amount or confirm a line automatically. This addresses observed footer noise and rupee-sign confusion without guessing numeric repairs.

Affected: `frontend/extraction/amount-candidates.mjs`, `frontend/review-app.mjs`, `frontend/test/extraction.test.mjs`, and Stage 2 record. Verification: 20 browser unit tests pass; syntax check passes. Real-document recognition improvements and retry UI remain unverified. Stage 2 remains open.

## D-018 — Preserve source readings; fix candidate boundaries without guessing OCR repairs

Date: 2026-10-18. Status: Implemented locally; owner retest pending.

Owner testing found lost decimal punctuation, date fragments, truncated grouped prices, and OCR letter/currency confusion. Candidate parsing now excludes complete dates, preserves comma-grouped amounts and decimal commas, and rejects substrings inside letter identifiers. OCR warnings request a digit-by-digit source check. Do not silently insert decimal marks or remove a leading digit interpreted as a currency sign: the source must be checked and the amount corrected by the user.

Affected: `frontend/extraction/amount-candidates.mjs`, `frontend/review-app.mjs`, `frontend/test/extraction.test.mjs`, and Stage 2 record. Verification: 19/19 browser unit tests pass; OCR recognition accuracy and four-case post-confirmation replay remain pending. No commit link available.

## D-017 — Browser-first extraction; no LLM required

Date: 2026-10-18. Status: Confirmed and locally implemented; four-document technical preflight passed, owner accuracy/privacy review pending. Decision owner: Project owner.

Keep bill PDF/image bytes on the user's device for the default MVP path. Use browser PDF.js for text PDFs and Tesseract.js OCR for images/scans. Simple local rules propose possible monetary strings; the user confirms/corrects relevant descriptions and amounts beside the local document. Send only an allowlisted structured payload—line ID, description, raw amount, currency, page, normalized bounds, and optional expected amount—to Python. Do not send document bytes or the full OCR/text-token stream.

An LLM and OpenAI adapter are not required. Python continues to parse confirmed values, calculate, choose the scoped verdict, and render controlled messages. A future AI helper is allowed only as a separately reviewed fallback if real tests show unacceptable confirmation effort; it must not calculate or declare errors.

**Reason:** This removes routine bill-image transmission, avoids a provider key/model dependency, and preserves the trusted calculation boundary. It also shifts semantic interpretation to transparent rules plus user confirmation, which is acceptable for the narrow four-case hackathon test.

**Affected:** `frontend/index.html`, `frontend/review-app.mjs`, `frontend/styles.css`, `frontend/local-server.mjs`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/extraction/`, `frontend/test/`, `pyproject.toml`, `.env.example`, `README.md`, [PRD](PRD.md), and [Stage 2 record](../../work/09_STAGE_2_EXTRACTION.md). The prior `openai_extractor.py` and live model script were removed.

**Verification:** 15/15 browser module tests and 26/26 Python tests pass locally; dependency checks pass and npm reports zero vulnerabilities. All four masked participant cases render and extract locally in the harness: A has 2 pages/193 text pieces/2 candidates, B 1/111/18, C 6/424/73, and D 1/74/3. This is a technical preflight, not an accuracy result. Owner correction/source-mark review, Network-panel inspection, and post-confirmation Python replay remain pending.

**Supersedes:** D-012 only where it proposed server multipart upload and hosted vision as the default route. D-016's OpenAI adapter/provider path is superseded. D-012's size/page discipline and local extraction principles remain useful; D-016's strict source/confirmation contracts remain useful.

## D-016 — Stage 2 extraction boundary and candidate OpenAI adapter

Date: 2026-10-18. Status: Local implementation verified; live provider/document verification pending. Decision owner: Project owner authorized Stage 2.

Implement document reading, extraction candidates, source locations, and human confirmation as a separate boundary before deterministic calculation. Use `pdfplumber` 0.11.10 for positioned words in text PDFs. Candidate amount strings and model-proposed bounds remain untrusted until explicit confirmation; invented token references, invalid bounds, mixed/changed currency, and unconfirmed lines are rejected.

Implement one isolated OpenAI Responses structured-output adapter as the first hosted-vision candidate, pinned to OpenAI Python 3.35.1 and Pydantic 2.14.1. The model name remains explicit configuration with no code default. This adapter is not considered selected or accurate until an owner-configured live benchmark on already-masked fixtures passes. Existing deterministic drafts remain the safe grounded writer; no model-prose claim is accepted by this decision.

**Reason:** The extraction/model layer can fail without weakening the Stage 1 numeric boundary. The adapter follows current structured-output interfaces, but provider cost, handling terms, model capability, and fixture accuracy still require evidence.

**Affected:** `backend/billshield_core/documents.py`, `extraction.py`, `confirmation.py`, `openai_extractor.py`, `source_marking.py`, `tests/test_documents.py`, `tests/test_extraction.py`, `scripts/inspect_masked_pdf.py`, `scripts/extract_masked_document.py`, `pyproject.toml`, `.env.example`, `README.md`, [PRD](PRD.md), and [Stage 2 record](../../work/09_STAGE_2_EXTRACTION.md).

**Verification:** 28/28 local tests pass in the pinned `.venv`. Tests use a fake provider response and a fake PDF page object; no live model call, actual bill extraction, external upload, or highlight inspection occurred. Stage 2 remains in progress.

## D-015 — Stage 0/1 deterministic core and fixture contract

Date: 2026-10-18. Status: Implemented and locally verified; owner checkpoint pending. Decision owner: Project owner requested Stage 0/1 implementation.

Implement the first two PRD stages as a dependency-free Python 3.11 core using four de-identified JSON fixtures. Store all monetary values as integer cents/paise; parse any future textual amounts through `Decimal` with explicit rounding and reject binary floats. Compute signed line sums, component reconciliations, expectation differences, and verdicts in code. A differing remembered expectation remains `unexplained` unless comparison evidence is verified; failed displayed arithmetic or a verified expectation mismatch produces `verified_mismatch`; missing expectation permits only scoped arithmetic `checks_passed`.

Required drafts at this stage use controlled templates. Every numeric fact is bound to a calculated result, user-reported expectation, or referenced structured line; no model generates or calculates a number. Fixtures use synthetic source references and do not claim extraction or coordinate-marking success.

**Reason:** This creates an inspectable calculation boundary before model/API work, preserves the three confirmed outcomes, and makes unsupported numeric or billing-error claims test failures rather than prompt expectations.

**Affected:** `backend/billshield_core/`, `tests/fixtures/BS-001.json` through `BS-004.json`, `tests/test_*.py`, `pyproject.toml`, `README.md`, [PRD](PRD.md), and [Stage 0/1 record](../../work/08_STAGE_0_1_CALCULATION_CORE.md).

**Verification:** On Python 3.11.9, `python -m unittest discover -s tests -v` passes 16/16 tests; `python scripts/replay_fixtures.py` replays all four cases with expected formulas, outcomes, line references, and drafts. No live document/model, external service, secret, or unmasked input was used. No commit link exists yet.

## D-014 — PRD and decision history live with the application

Date: 2026-10-18. Status: Confirmed and completed. Decision owner: Project owner.

Authoritative PRD is `docs/PRD.md`; authoritative decision log is `docs/DECISIONS.md` in the application folder. Existing decision history and future material PRD/code/schema/deployment decisions are maintained here. Parent files are pointers, not competing copies. Historical workspace-relative paths in older entries identify original affected files; they are not files promised in a standalone clone. Private evidence remains outside the application repository. New entries link to app-relative files, implementation commits, and test results when available. No application code or GitHub publication performed by this document relocation.

## D-013 — Separate application folder for future GitHub repository

Date: 2026-10-18. Status: Confirmed and folder layout created. Decision owner: Project owner.

Keep application code in `billshield-app/`, separate from research/submission/evidence. Include backend, tests/fixtures, scripts, Supabase migrations, frontend, docs, README, environment-name example, and ignore rules. No runnable code or credentials added. Parent C8 is an existing Git repository, so no nested git initialization or remote creation performed. Independent publication later should use an isolated export/checkout of application files with sanitized documentation/fixtures. This establishes the code root for future stages, superseding PRD's previously unprefixed code-layout example.

## How we maintain this log

Confirmed working agreement, 2026-10-18: record material changes to the PRD, code, data model, deployment, and project scope here. Each entry includes date, decision/status, reason, affected files or components, verification evidence, and any decision it supersedes. Keep previous entries; record a reversal as a new entry. Distinguish Proposed, Confirmed, Implemented, Verified, and Superseded. Acceptance of an approach does not mean it has been implemented or tested. Routine edits can be grouped under the relevant decision; do not create an entry for every line of code. Link implementation commits/tests when they exist; never invent them. Update detailed work and PRD before refreshing PROJECT.md.

## D-012 — Bounded uploads and hybrid extraction approach

Date: 2026-10-18. Status: Agreed development direction; exact thresholds and model choice remain proposals pending implementation checks. Decision owner: Project owner.

**Direction:** Keep MVP uploads below Vercel's request limit; extract text/positions locally from readable PDFs; use a hosted vision-capable model for image/scanned inputs when required; retain user confirmation and code-owned arithmetic. Investigate invoice libraries before adding unnecessary dependencies.

**Current proposed settings:** 4,000,000 combined raw file bytes per multipart request, ten-page review limit, client and server enforcement, bounded metadata. pdfplumber for readable PDFs; one hosted model adapter for image/semantic extraction. Tesseract is a benchmark option if source marking needs it. Direct-to-Supabase uploads are deferred while the small-file cap suffices. Supabase storage limits are separate from Vercel's 4.5 MB function-body limit.

**Reason:** Four source fixtures fit below 1 MB; both supplied PDFs have readable words/positions. Avoid OCR/model overhead when embedded text exists and avoid adding local model/native OCR deployment complexity without evidence.

**Affected:** [PRD](../../deliverables/PRODUCT_REQUIREMENTS.md), [investigation](../../work/07_EXTRACTION_AND_UPLOAD_OPTIONS.md), future document intake/model adapter/deployment configuration.

**Evidence:** Read-only file size/text-position inspection and linked official documentation in the investigation. No image-model benchmark, file-limit implementation, application tests, or deployment completed. No model/provider selected. Replaces PRD's original proposed 10 MB/direct-storage default.

## D-011 — Backend-first learning and review sequence

Date: 2026-10-18. Status: Confirmed direction; implementation details proposed in PRD. Decision owner: Project owner.

Prepare a detailed PRD for Python logic and model integration first, run locally and check against agreed verifiers, deploy backend on Vercel with Supabase, then build UI. Owner wants to inspect/control stages. Supabase timing was offered as an open choice; recommendation is to integrate a hosted development project during local backend work. FastAPI and early Vercel compatibility smoke test remain recommendations. No external writes, credentials, service configuration, application implementation, or deployment performed by this planning task. See deliverables/PRODUCT_REQUIREMENTS.md.

## D-010 — Bill-linked expectations and date handling

Date: 2026-10-18. Status: Confirmed. Decision owner: Project owner.

Expectation/Promise links to Bill ID; obtain provider, service label, currency, and User ID through Bill instead of repeating them. Source identifies where the user's expectation/provider promise came from. Effective date is optional, used when known and relevant; recorded date is an automatic timestamp. Keep changed versions as new rows and Findings linked to the version checked. Supersedes D-009's repeated expectation grouping fields and direct User → Expectation connection.

## D-009 — Simplify user and service grouping

Date: 2026-10-18. Status: Confirmed. Decision owner: Project owner.

Rename Reviewer to User. Remove separate Service table/Service ID for MVP; Bill and Expectation/Promise contain User ID, provider, and service label. Preserve expectation history and direct finding-to-expectation-version links. Earlier bill comparisons require consistent provider/service labels; a User row does not contain a single service because users can have multiple services. See work/05_ARCHITECTURE_AND_DATA.md for current field list. Supersedes earlier proposed Service entity.

## D-008 — Draft message is a required stage

Date: 2026-10-18. Status: Confirmed. Decision owner: Project owner.

All completed reviews proceed through message drafting. Supersedes earlier optional-draft UI proposals. No-issue results produce an accurate explanatory message, not an invented complaint. Editing/copying remains available and actual sending stays under user control, outside app execution. See latest override in work/04_NEEDS_FIRST_SPEC.md. Historical generated sketches have not yet been redrawn for this correction.

## D-007 — Final output verification rules

Date: 2026-10-18. Status: Confirmed. Decision owner: Project owner.

Use three output checks: correct bill amounts/calculations; correct explanation identified and marked on the bill; message grounded in findings without invention, allowing “No issue found” when checks find no difference. See [concise dataset](../../deliverables/GOLDEN_PAIRS_CONCISE.md). Actual send behavior remains a separate outcome. This replaces earlier proposed shared verification checklists; source-grounding and uncertainty remain part of applying the rules.

## D-006 — Contact destination discovery excluded

Date: 2026-10-18. Status: Confirmed. Decision owner: Project owner.

Provider contact lookup, destination verification, and recipient suggestions are outside the current MVP. Preserve Divyae's uncertainty about whom to contact as a discovery observation and potential downstream send barrier. Message drafting remains in scope; user selects the channel/recipient. Evidence: [E-107](../../evidence/E-107_DIVYAE_FLIGHT.md). Supersedes assistant's proposed recipient-discovery requirement.

[Back to project record](../../PROJECT.md)

| ID | Date | Decision | Reason | Evidence | Owner | Status |
|---|---|---|---|---|---|---|
| D-001 | 2026-10-17 | Define success as an observed send with fewer than 20 changed words. | Praise and stated intention are weak evidence. | [Brief](../../evidence/E-001_BILLSHIELD_BRIEF.md) | Unassigned | Proposed |
| D-002 | 2026-10-17 | AI extracts and drafts language; deterministic code owns arithmetic and numeric claims. | A language model is not a reliable calculator. | [Architecture](../../work/05_ARCHITECTURE_AND_DATA.md) | Unassigned | Proposed |
| D-003 | 2026-10-17 | Represent “verified mismatch,” “unexplained,” and “checks passed” as distinct outcomes. | Lack of explanation is not proof of an incorrect bill. | [Hypothesis](../../work/01_HYPOTHESIS.md) | Unassigned | Proposed |
| D-004 | 2026-10-17 | Use a guided form first; add follow-up chat only if discovery shows a repeated follow-up need. | The interface must come from observed behavior, not taste. | Pending first session | Unassigned | Proposed |
| D-005 | 2026-10-17 | Use real first names in the submission only with explicit consent; otherwise use disclosed pseudonyms. | The brief values real evidence, but privacy and consent take precedence. | [Testing plan](../../work/06_USER_TESTING.md) | Unassigned | Proposed |

Do not convert these proposals to confirmed decisions until the owner accepts them or the evidence forces the choice.
