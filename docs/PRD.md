# BillShield — Product requirements and staged build plan

Authoritative PRD: maintain this file alongside [DECISIONS.md](DECISIONS.md). Parent-workspace evidence remains outside the future app repository.

Version 1.12 · 2026-10-19 · Owner: Prateek Wahi
Status: Stages 0–2 accepted; FastAPI backend live on Vercel with access code; Supabase saving (smaller version) live and owner-verified. Real-user tests scheduled for 2026-10-20. Next development additions N-1 (UI), N-2 (server OCR evaluation) and N-3 (chat + database) are planned, not implemented (D-034). Older status lines are kept in the history sections below.

## Current state — 2026-10-19 (implemented and verified)

This section summarizes D-015 to D-033. Details, evidence and superseded choices stay in [DECISIONS.md](DECISIONS.md) and in the history sections further down.

**Flow (what a user does):** choose a bill (photo or PDF) → read it (photos: Groq `qwen/qwen3.8-27b` on a table area the person draws, previews and confirms as free of personal details; PDFs: local PDF.js text; local Tesseract OCR remains as fallback) → Groq pre-fills label, amount, suggested role and row columns → the person checks against the visible page/table and clicks **Confirm all ready lines** → **Calculate and explain** → Python checks → one of three outcomes:

| Outcome | Condition | What happens |
|---|---|---|
| A — re-check | rows, subtotals or the printed total do not add up | No verdict, no message, no AI. Suspect lines are marked (e.g. a discount counted twice). The person fixes them, or states they re-checked; only then a cautious `verified_mismatch` message (D-028). |
| B — no issue | arithmetic fine and matches (or no) expectation | `checks_passed` summary; nothing sent to an AI. |
| C — difference | arithmetic fine, differs from the expected amount | Python first finds groups/lines that exactly equal the expected amount or the difference; then Groq `openai/gpt-oss-20b` receives only confirmed labels, amounts and Python's results and suggests likely causes. Answers citing unknown lines, containing numbers, accusing the provider or judging prices are rejected (D-027). Verdict stays `unexplained`. |

The editable message always uses Python's numbers and confirmed line IDs; an accepted AI suggestion may pre-select the lines asked about and add one number-free question. **Copy** and **I sent it** (with the pasted sent text) are recorded; the server counts changed words.

**Core rules in force:** code owns every amount, sum and comparison; amounts are parsed strictly (explicit decimal mark; only unambiguous two-digit decimal marks are converted; a leading 2 is never treated as ₹); explicit roles charge / discount / adjustment / subtotal / total with only charges, discounts and adjustments summed; row columns checked (quantity × price − discount = taxable value; + taxes = row amount); evidence precision exact / table / page, never invented boxes (D-024–D-028).

**Architecture:** browser page (HTML/JS) + FastAPI `app.py` (`/api/health`, `/api/groq-extract`, `/api/analyze`, `/api/explain`, `/api/session`, `/api/messages/{id}/events`) using the Python modules in `backend/billshield_core` (D-030). Hosted on Vercel at https://c8-hackathon-killbill2-0.vercel.app, code at https://github.com/pwahi/C8_hackathon_killbill2.0 (public; owner has permission for the names in these documents). Reading tools served from `frontend/vendor` (D-031, D-032). An access code (`BILLSHIELD_ACCESS_CODE`) is required for every operation that can use the server's Groq key.

**Data:** Supabase with anonymous identity per browser; tables bills, line_items, expectations, findings, messages, message_events; row level security limits every row to its owner; append-only; no bill images or OCR text stored; e-mail addresses and long numbers blanked in stored sent texts (D-033). Deferred: finding_lines, message_lines (line IDs kept as arrays), chat_turns, deletion.

**Verification so far:** 106 Python tests and 40 browser tests pass (2026-10-19); agent-scripted browser replays on the four masked cases; owner hands-on acceptance of Stage 2 and of the live site, including saving (owner-reported). Not yet: any test by a real user other than the owner, any observed send.

**Known limits:** four reference cases only; Groq output varies between runs; local OCR remains weak on photos; links between devices are not possible (anonymous identity is per browser); the page is still the Stage 2 review layout, not the owner's step-by-step UI design.

## Next development additions — planned for 2026-10-20 (not implemented)

Owner direction 2026-10-19 (D-034), in priority order. Each item ends with an owner checkpoint. Real-user tests (A-006/A-007) must keep enough time before the 2026-10-20 22:17 deadline; if time runs short, cut scope inside these items rather than skipping the tests.

### N-1 — User interface (priority 1)

**Goal:** turn the working review page into the owner's sequential design (paper UI sequence, evidence E-109 move 2): Provide → Confirm → Understand → Draft → Finish, so a stranger can complete it without help.

**Scope:** step-by-step screens with one clear primary action per step; bill view beside the confirmation list; plain-language result first (what was checked, what is unknown), details on demand; message step with Copy and I sent it; clear privacy notes at the point where data leaves the device; mobile-friendly layout. Reuse the existing API and modules; no change to numeric rules.

**Acceptance:** all four reference cases complete through the new screens with the same verdicts and drafts as today; existing browser/API tests pass; the owner can walk a first-time user through the flow without explaining terms such as "role" or "precision" (wording reviewed by the owner).

**Open choices:** keep plain HTML/JS (fastest, no build step) or adopt a framework (deferred unless needed); exact screen order from the owner's drawing.

### N-2 — Server-side reading with LightOnOCR-3 (evaluation first)

**Goal:** improve reading of photos and scans, possibly with real position boxes, by running [LightOnOCR-3-0.8B](https://huggingface.co/lightonai/LightOnOCR-3-0.8B) on a server.

**Facts checked 2026-10-19 (model card):** Apache-2.0; about 0.9B parameters (Qwen3.5 vision-language architecture); outputs the page as Markdown and, with the `grounding` prompt, typed blocks (text, table, …) with boxes in 0–1000 page coordinates; runs with Transformers, vLLM or SGLang (GPU examples) and has GGUF quantizations; English language tag; the card states it "isn't deployed by any Inference Provider". It is an OCR model: it does not decide charge/discount roles or row semantics.

**Implications:** cannot run inside a Vercel function (no GPU; size/time limits) — needs a separate GPU host (for example a Hugging Face Inference Endpoint, Modal or RunPod) with its own cost, cold starts and a key; the selected bill area or page would be sent to that host (a new data processor; same consent preview as the Groq route); structured lines would still come from rules or Groq applied to the OCR text, and Python's checks stay unchanged.

**Plan:** (1) time-boxed comparison on the masked cases A–D against Groq vision: correct amounts, missed/extra lines, ₹/2 and decimal-mark errors, boxes usable for exact highlights, latency, cost; (2) only if clearly better, add it as an optional extractor behind the existing confirmation step, keeping Groq and local OCR. **Acceptance for adoption:** measurably fewer corrections on A–D than Groq, no regression in privacy controls, owner approval of host and cost.

**Open choices:** hosting provider and budget; whether to send full pages or only selected areas.

### N-3 — Chat about a bill + database update

**Goal:** answer the owner's question-map item 6 ("what did the user ask about this bill?") and PRD FR-08: the person can ask follow-up questions about the current review.

**Scope:** chat panel on the result step; answers grounded only in the saved review (confirmed lines, Python results, missing information) and generated by a Groq text model; the same validation as D-027 (no numbers outside Python's facts, only existing lines, no accusations or price judgements); new facts from the person are treated as proposed corrections that require re-confirmation and recalculation, never as trusted numbers; no provider contact.

**Database update (migration):** add `chat_turns` (id, bill_id, user_id, role user/assistant, text with private details blanked, created_at, model, refers-to finding) with the same owner-only, append-only policies; at the same time add the deferred `finding_lines` and `message_lines` link tables (filled from the existing arrays); consider review deletion for testers.

**Acceptance:** questions and answers survive a reload for the same browser; another anonymous user cannot read them; an answer with an invented amount is rejected in tests; existing reviews and tests unaffected.


## Earlier technical direction (history, superseded where the Current state differs)

D-024 allows visible source-table/page evidence plus explicit line/amount confirmation without requiring a box around every amount. Exact highlights remain optional where reliable and must never be fabricated. Record source precision honestly. Implemented locally under D-025: `exact` / `table` / `page` provenance, a separate table `region` that is never sent as amount bounds, explicit charge/discount/subtotal/total roles, and the loopback confirmed → Python → controlled draft flow. Owner review of the four cases is next; do not declare Stage 2 complete.

D-023 exposes D-022's optional hosted comparison through the local harness: open a bill locally, select one charge table, preview and confirm redaction, then explicitly send that area to Groq through a local key-holding Python helper. Responses are cached privately for replay; no automatic OCR-to-cloud fallback. Three D prices match in a live browser smoke test, but usable source boxes and full-case acceptance remain open. This limited local bridge does not complete Stage 3 persistence/API requirements or Stage 5 UI requirements.

D-022 retains the browser-local extraction path and adds a separately invoked Groq Qwen 3.8 27B benchmark on owner-reviewed redacted crops. Default selection remains pending a measured comparison. Hosted testing transmits the selected crop to Groq; local OCR never triggers that upload automatically. Keys remain local and outside browser assets. Model amounts and crop-relative boxes remain unconfirmed until source review. The local-only statements below describe the browser route, not this explicit hosted benchmark exception.

D-017 supersedes routine server upload and hosted vision extraction for the MVP. The browser retains the bill file, uses PDF.js or Tesseract.js locally, and sends only user-confirmed structured lines to Python. The server does not receive the bill image/PDF or full extracted text. An LLM is not required. A future model fallback requires a new reviewed decision based on measured failure/effort.

The earlier upload/extraction investigation below remains historical platform research and a fallback reference, not the default architecture.

[Upload/extraction investigation](../../work/07_EXTRACTION_AND_UPLOAD_OPTIONS.md) previously recommended bounded multipart upload, pdfplumber, and hosted vision fallback. Its Vercel/Supabase limit findings remain valid if server upload is ever reconsidered. The current default instead uses client-side PDF.js/Tesseract.js, a ten-page review limit, explicit confirmation, and code-owned arithmetic. Existing source PDFs have extractable words/positions; browser OCR/image quality is not yet benchmarked.

## 1. Product outcome and evidence

Given a masked bill and what a user expected or was promised, identify and mark the relevant bill lines, show reproducible calculations, explain what is known or unresolved, and always produce editable message text. Support questions about the same bill before the user copies the message. The app never contacts the provider.

The owner's three final output rules are authoritative:

| Check | Required behavior |
|---|---|
| Correct numbers | Bill amounts are faithfully extracted/confirmed; code calculates totals and differences correctly. |
| Correct explanation | Relevant line items or periods are identified and linked to a visible source table/page for user confirmation. Exact highlights are optional where reliable; source precision and missing evidence remain explicit (D-024). |
| Message | Text is grounded in supported findings without invention. If no difference is found, produce an accurate no-issue explanation rather than a fabricated complaint. |

Product success is separate: observed sending, amount of editing, and what the user does next. Drafting is required; editing/copying/sending is the user's choice. Do not treat a copy event or willingness to send as an actual send. Original proposed send threshold remains in the hypothesis record and has not been met.

Evidence base in parent workspace: [four reference pairs](../../deliverables/GOLDEN_PAIRS_CONCISE.md), [detailed reference answers](../../deliverables/BILLSHIELD_GOLDEN_DATASET.md), [hypothesis](../../work/01_HYPOTHESIS.md). These are discovery cases, not completed unassisted product tests. Four cases provide limited coverage, not proof of general billing accuracy.

## 2. Decisions, scope, and open choices

### Confirmed product decisions

- Required sequence: Provide → Confirm → Understand / contextual follow-up → Draft message → Finish.
- Extraction: Groq vision on an approved redacted area is the recommended reader for photos; local PDF.js for PDFs; local Tesseract OCR as fallback (D-022–D-026). The person confirms every line. Python owns all calculations, comparisons and controlled drafts. A Groq text model may suggest causes of a difference under strict validation (D-027). *(Earlier wording — "an LLM is optional future fallback only" — superseded.)*
- Preserve `verified_mismatch`, `unexplained`, and `checks_passed`; arithmetic may pass while promise comparison remains unresolved.
- Show the source page/table beside lines; exact highlights optional (D-024). Never persist bill files or OCR text; only an approved area is sent to Groq. Retain message-to-line links (as arrays for now) and event history (D-033).
- No persistent account numbers, phone numbers, postal addresses, card numbers, or unmasked documents.
- Contact lookup, recipient suggestions, automatic sending, refunds, payment actions, legal judgments, general finance dashboards, and comprehensive tariff research are excluded.
- No standalone Service table. Bills contain internal User ID, provider, and consistent service label. Expectations link to Bill ID.

### Recommended implementation choices

- Python + FastAPI for the local and hosted API, with typed request/output schemas and a small deterministic calculation module.
- Start core calculation tests with fixed sanitized JSON fixtures. Validate browser extraction on the four documents next; do not add model orchestration without measured need.
- Connect a hosted Supabase development project while Python still runs locally. Store schema migrations in the repository. Deployment changes configuration, not the data model or calculation code.
- Use short, separate requests for extraction, confirmation/analysis, chat, and drafting. No long chain holding every operation in one request.
- Use a private Vercel preview compatibility smoke test before investing heavily in parsing dependencies. Main deployment remains after local/persistence gates. No UI work until hosted API passes.
- Proposed first UI: lightweight web frontend built from the owner's paper layouts. Framework choice deferred until UI stage; do not create two parallel application stacks unnecessarily.

### Choices to resolve at their implementation stage

- Whether a server-side OCR model (LightOnOCR-3, N-2) should be added next to Groq vision; decided by measured comparison, not assumed.
- Existing Supabase/Vercel projects and available plan limits; use user's resources without exposing credentials in chat.
- Initial local-file policy: PDF/JPEG/PNG, maximum 4,000,000 local file bytes and ten pages per review. Enforce in-browser before processing. The structured server payload is separately capped and contains no file bytes or full OCR/token stream.
- Retention proposal: keep masked review data through hackathon evaluation, offer review deletion, then purge by the agreed retention deadline. No automatic deletion of existing project evidence without direction.

## 3. User journey and behavior

| Step | Backend obligation before UI exists | Final UI behavior |
|---|---|---|
| Provide | Accept only confirmed structured lines plus optional expected price/terms, currency/context. Missing expectation is allowed; no bill bytes in the default request. | Select a local bill, process it in-browser, enter expected amount/currency/context. |
| Confirm | Return editable candidates with source page/table references and optional reliable exact bounds. Require user confirmation; uncertain amounts are corrected or excluded. | Source table/page beside editable lines; optional exact highlights. Missing exact bounds alone must not force manual box drawing (D-024; implemented locally under D-025). |
| Understand | Analyze confirmed revision; return numbers, scope of checks, supported line links, verdict, missing information, and next question. | Marked bill, calculation, separate arithmetic/promise status, contextual question area. |
| Follow-up | Save user/assistant turns against bill; use current structured state. New facts are proposed corrections, not silently trusted numerical inputs. | Ask about this bill, add masked previous bill/quote, return to updated result. |
| Draft | Every completed review creates a draft from the current checked finding. Unknown information stays unknown. | Editable message with optional transient invoice/name/contact fields; copy. |
| Finish | Record actual actions with explicit event types; never report automatic provider contact. | Accurate status: review complete / copied, not sent / checks passed. Review another bill. |

If extraction is unreadable, return an actionable error or request confirmation, not a completed review with a false no-issue result. Follow-up information is optional: when unavailable, explain the remaining uncertainty and still provide a cautious draft. A no-issue draft can be a factual summary for the user; no invented provider dispute is needed.

## 4. Functional requirements

| ID | Requirement | Acceptance condition |
|---|---|---|
| FR-01 | Validate the local document in-browser before extraction. | Unsupported, oversized, encrypted/unreadable inputs yield explicit errors; no silent partial-document pass and no default server upload. |
| FR-02 | Extract descriptions, signed monetary components, periods, invoice metadata, and source locations. | Output matches schema; raw and normalized amounts retained as appropriate without private identifiers; missing fields are null, not fabricated. |
| FR-03 | Support traceable source evidence with optional exact marking. | Every explanatory finding links to existing line IDs and a visible source table/page. Record exact/table/page precision; require explicit amount/label confirmation. No guessed box shown as exact; missing exact bounds alone does not block confirmation (D-024). |
| FR-04 | Require a confirmation boundary. | Calculations consume a confirmed structured revision; original extraction is distinguishable from corrections. |
| FR-05 | Calculate with integer cents/paise and Decimal parsing. | EUR/INR fixtures exact; discounts signed; tax-included amounts not added twice; mixed currencies not combined. |
| FR-06 | Compare expectation with applicable billed period/components. | Separate raw total difference from explained components and unresolved remainder; remembered expectation is not treated as proof of a contract. |
| FR-07 | Preserve honest verdicts. | Unexplained fee is never automatically wrong; no expectation means limited arithmetic-only result. A failed extraction is not checks-passed. |
| FR-08 | Contextual chat. | Fetches only user's current review and permitted prior evidence; factual changes require confirmation/reanalysis; no model-supplied arithmetic trusted. |
| FR-09 | Required draft. | Every successful review reaches a draft, including no-issue or missing-evidence wording; grounded numbers and valid line links only. |
| FR-10 | Editing and events. | Keep original draft plus append-only generated/edited/copied/sent-confirmed events; word changes measured only when final text exists. |
| FR-11 | Persistence and history. | Review survives server restart/redeployment; expectations are versioned; findings/drafts reference the revision used. |
| FR-12 | Least-data storage and deletion. | Persist only confirmed structured lines and derived results; no bill files or full OCR/token stream. Deletion removes the selected review and dependent records without deleting other reviews. |
| FR-13 | Session ownership. | User B cannot read, change, chat about, download, or delete User A's bill by guessing its ID. |
| FR-14 | Failure recovery. | Model timeout/invalid schema, missing file, or write failure never produces misleading completion; bounded retry is safe and duplicate clicks do not duplicate events/findings. |

## 5. Python responsibilities and pipeline

### Modules

| Module | Purpose | How owner can inspect it |
|---|---|---|
| Document intake | Validate file/reference and prepare page/text inputs. | Sanitized page count/type report. |
| Browser extractor | Use PDF.js/Tesseract.js and simple rules locally; return untrusted candidates. | Candidate JSON, raw amount strings, warnings, source positions; browser network inspection shows no document transmission. |
| Normalizer | Parse locale amounts, signs, dates, line kinds, and units into typed fields. | Side-by-side raw versus normalized fields. |
| Calculation engine | Reconcile components/subtotals, compute differences, compare compatible periods. | Explicit formula with operand line IDs and integer amounts. |
| Finding builder | Combine code results with user-confirmed context and missing evidence. | Structured verdict, checked scope, supporting IDs, unresolved items. |
| Grounded writer | Render explanation/draft from findings; answer bill questions. | Verified fact payload, prompt version, final text, validation report. |
| Repository/storage | Persist ten-table model, private object refs, history, session ownership. | SQL migration, sanitized saved records, round-trip test. |
| API layer | Expose stable operations independent of later UI. | Local interactive API documentation and example request/response files. |

### Source-location strategy

PDF text should be read in-browser with page/word coordinates where available; scanned PDFs/images use local OCR or the explicitly selected Groq route. Boxes remain untrusted candidates. When exact localization is unreliable, show the selected source table/page and require user confirmation without mandatory per-amount drawing. Preserve source precision and never invent coordinates. D-024 supersedes the exact-highlight requirement; trustworthy table/page evidence is sufficient, while exact-highlight accuracy is reported separately. Contract/UI/payload changes were implemented under D-025: precision `exact` requires amount bounds, `table` carries only a `region`, `page` carries no coordinates.

### Numeric and explanation boundary

- Distinguish component, subtotal, grand-total, and tax-breakdown rows. Never sum both a subtotal and its underlying charges. Implemented (D-025): each confirmed line has an explicit role; only charges (non-negative) and discounts (typed negative, never sign-flipped) are summed; a subtotal belongs to a named group and is checked against it; at most one grand total is checked against all charges; at least one printed total or subtotal is required. Tax-included breakdown rows are simply not confirmed.
- Decimal marks are an explicit review-level choice; amounts whose grouping contradicts it are rejected, never repaired. Only literal currency marks are removed; a leading digit is never treated as a misread currency sign.
- Distinguish multiple invoices from one bill, and record a document kind; order confirmation is not payment proof.
- Store per-line period_start/end; invoice issue date is separate. Overall bill period may be optional.
- No default assumption that an expectation includes tax, delivery, or the same billing duration. Ask or limit the conclusion.
- AI can suggest semantic labels and relevant lines; deterministic calculations and confirmed context govern numeric conclusions. Arbitrary contractual language is not fully machine-verifiable; unsupported claims must stay unresolved.
- Generate monetary facts using code-owned placeholders/structured facts, not freeform model-calculated numbers. Prefer controlled templates for verdict and disputed sums; permit AI language only within those bounds.
- A numeric allowlist alone is insufficient: a model can swap two valid amounts or assign a valid figure to the wrong charge. Validate fact-to-line associations and use case-specific human review. Bounded regeneration once; then a deterministic safe draft/fallback or explicit error.
- Treat locally extracted bill text as untrusted data, not instructions to change rules or disclose secrets.

## 6. Data and state

Implement the agreed conceptual model with necessary technical fields only; do not add product features through schema design.

| Table | Required content |
|---|---|
| users | Internal user UUID; session/auth mapping without personal contact fields. |
| bills | User ID, provider, service label, document kind, invoice date, optional overall period, currency, source/attachment role, optional parent bill for supporting structured evidence, status, revision, timestamps. No bill-file reference in the default MVP. |
| line_items | Bill ID, description, line kind, signed amount in minor units, optional period, page/normalized bounds, raw source text, confirmation/revision metadata. |
| expectations | Bill ID, expected/promised amount and terms, source, optional effective date, automatic recorded date; append versions rather than overwrite. |
| findings | Bill ID, exact expectation/revision reference, verdict, arithmetic status, comparison status, formula/operands, checked scope, missing information, timestamp. |
| finding_lines | Finding ID + Line ID, unique pair. |
| messages | Finding ID, original draft text, created_at; prompt/model metadata and revision reference for reproducibility. |
| message_lines | Message ID + Line ID, unique pair; link all relevant lines for total-level explanations. |
| message_events | Message ID, action, timestamp, sanitized final text when supplied, measured words_changed, confirmation source when sent is claimed. |
| chat_turns | Bill ID, role, sanitized text, created_at; revision/context reference. |

**Implementation status (D-033, 2026-10-19):** implemented in Supabase as bills, line_items, expectations, findings, messages and message_events; users are Supabase anonymous auth users. Not yet implemented: finding_lines and message_lines (line IDs stored as arrays in findings/messages), chat_turns (planned in N-3), deletion.

Supporting evidence uses another locally processed bill record containing confirmed structured lines, not file bytes or full OCR in chat. Comparison with earlier bills requires compatible provider/service labels and periods; it does not prove payment. A revision correction invalidates old current findings/drafts: preserve history but mark stale, re-run code, and regenerate before claiming current accuracy.

Word-count convention: normalize whitespace, case and punctuation; tokenize into words; use word-level Levenshtein edits (insertion, deletion, substitution each one). Preserve the convention with the measurement. No final sent text means unknown edits, not zero.

### Ownership proposal

Use anonymous Supabase Auth identity for the invite-only test session, without a signup form, plus owner-scoped policies. A visible signup/account-management feature remains excluded. Verify tokens server-side; never trust a client-supplied User ID alone. If a server secret/service-role client is used, it can bypass RLS, so ownership checks must be explicit in every handler. Prefer user-scoped queries; use elevated access narrowly for needed signed-file operations. Validate no cross-user access in local and hosted tests.

### Privacy workflow

The user may select an original bill locally because its bytes stay in browser memory, but the app must not transmit, log, or persist it. The browser builds an allowlisted payload from confirmed commercial lines; private-data pattern checks are warnings/blocks, not proof that text is anonymous. Logs, fixtures, and structured server records exclude credentials, addresses, account/phone/card numbers, booking references, and personal contact details. User-filled personalization stays transient; sanitize persisted final texts. No fully automatic redaction system is being promised.

## 7. Local and hosted API contract proposal

**Implemented (D-030–D-033):** `GET /api/health`, `POST /api/groq-extract`, `POST /api/analyze`, `POST /api/explain`, `POST /api/session`, `POST /api/messages/{id}/events`, interactive docs at `/docs`. The table below is the original proposal; chat, read-review and delete operations are not built yet (chat planned in N-3).

The same operations must work locally and on Vercel; interactive API docs are sufficient for early stages, not the final user interface.

| Operation | Inputs | Result |
|---|---|---|
| Health | None | Version/readiness without secret values. |
| Start review | Authenticated session, confirmed structured lines, document metadata, expectation/context; no file bytes/full OCR | Bill ID and accepted revision after validation. No arbitrary external URL input. |
| Local extract | Browser-local PDF.js/Tesseract.js; no server operation | Candidate lines, source locations, metadata, uncertainties shown for confirmation. |
| Confirm and analyze | Bill ID/revision or initial confirmed payload, corrected structured lines, expectation version | Persisted finding, code-owned calculation, supporting line IDs, missing evidence. |
| Read review | Bill ID | Current owned state plus source access reference. |
| Add follow-up | Bill ID, question, optional masked supporting-document reference | Sanitized chat turn and grounded answer; proposed changes or reanalysis requirement. |
| Draft | Current finding/revision | Required checked draft and linked line IDs; no-issue summary when appropriate. |
| Record action | Message ID, action, optional final text/confirmation | Append event and measured word changes when possible. |
| Delete review | Owned Bill ID | Remove selected review and dependencies/files; report success/failure. |

Repeated requests use idempotency keys or revision checks for extraction, confirmation, draft creation, and event writes. API errors distinguish invalid input, unauthorized/not found, stale revision, provider failure, and storage failure. No arbitrary external URL fetch or user-controlled filesystem path is accepted as a document reference.

## 8. Test plan from the three verifier rules

### Four real-source acceptance fixtures

| Case | Required facts/verdict | Must never claim |
|---|---|---|
| Nagarjun | 1425 August + 1950 September = 3375 cents. Source periods correct. Arithmetic passes; previous payment unknown. Draft asks rather than accuses. | August definitely unpaid/duplicated; verified overcharge; expected EUR 19.55. |
| Parikshit | 149900 - 20000 = 129900; packaging 1990 + delivery 5990 = 7980; total 137880 cents. Disclosure unknown. | Incorrect arithmetic, proven hidden fee, free delivery promise, verified payment/refund entitlement. |
| Antriksh | Listed paid amounts total 2182800 paise per owner confirmation; component sums balance. Expectation missing; scope limited. Required no-issue draft/summary. | Invented expected amount, unauthorized protection fee, automatically summing unrelated logistics docs without user context. |
| Divyae | Visible lines total 2243400 paise; difference 300000; questioned line 231200; development fees together 283200 do not establish full gap. | INR 2312 explains INR 3000; fee illegal/incorrect; actual send completed. |

### Test layers

1. **Deterministic unit tests:** parsing comma/decimal forms; sign/discount handling; rounding; total/subtotal hierarchy; missing expectation; mixed currency rejection; different periods; component-to-finding links. Include intentionally modified fixture variants as synthetic regression tests, never interview evidence.
2. **Core fixture replay:** all four sanitized expected structured datasets produce correct amounts, verdict scopes, relevant line references, and required draft facts. Four of four must pass.
3. **Browser extraction replay:** process the four actual PDFs/images locally, inspect browser network traffic to confirm no document/full OCR transmission, compare candidates to hand-checked truth, correct through confirmation, and verify final analysis. Report raw extraction accuracy separately from post-confirmation accuracy. Never hide corrections.
4. **Source-evidence inspection:** show the relevant table/page beside candidate lines and record user confirmation and source precision. Inspect exact highlights when available; missing exact boxes are not a blocker if table/page evidence is visible and confirmed. Missing source evidence or unreadable amounts still fail the check. Report exact-highlight failures separately (D-024).
5. **Message review:** code-owned numbers and line associations pass automated checks; human reviews all four messages for correct explanation and unsupported claims. Exact wording need not match the references.
6. **Integration:** save/load/restart; separate-user isolation; private file access; chat history; expectation versions; stale revision rejection; safe retries; message-to-line proof; copied versus sent events; deletion behavior.
7. **Hosted smoke replay:** same fixtures through deployed backend before UI, including largest accepted file, model timeout, and missing secret handling.
8. **UI and real-user test:** complete flow without builder help; verify visible marks and calculations; record edits/copy/actual send separately. Save honest no-send outcomes.

Record result, input fixture version, PDF.js/Tesseract.js versions, device/browser, time, failure, and correction. No all-green claim based solely on simulated extraction responses. Zero unsupported wrong-charge claims is the release bar on this limited test set, not a guarantee across unseen bills.

## 9. Development stages and owner checkpoints

| Stage | Deliverable | What you inspect | Exit gate |
|---|---|---|---|
| 0 — Contracts and sanitized fixtures | Typed data shapes, four hand-checked inputs/outputs, test commands; no live services required | Read one input JSON and expected result; identify every amount's source | Agreed scope and four trustworthy masked fixtures; unresolved provider choice documented. |
| 1 — Python calculation core | Small pure functions and deterministic fixture runner | Run totals/differences and inspect formulas without AI | Four core cases + meaningful edge cases pass; no binary floating-point money or AI arithmetic. |
| 2 — Extraction and grounded text | Local OCR and optional Groq; source-table/page confirmation; privacy filter; controlled drafts | Review candidates, corrections, visible source evidence, source precision, transmitted data and final draft | All four cases pass post-confirmation Python calculations/drafts; corrections are recorded; source table/page evidence is accepted. Local path transmits no documents/full OCR; Groq transmits only explicitly approved redacted areas. Exact boxes optional (D-024). |
| 3 — Local FastAPI + Supabase | Local API, development database/private bucket, migrations, session ownership, chat/history/events | Use API docs to complete review, restart server, retrieve same state | Complete backend flow persists; isolation, stale-state and retry tests pass. |
| 4 — Hosted backend | Vercel preview deployment using same Python modules and Supabase development project | Send the same confirmed structured payload remotely; compare results and timing | Hosted verifier replay, least-data payload, private access, cold/repeated request and timeout behavior pass. |
| 5 — UI | Owner's sequential screens wired to stable API | Upload → confirm → understand/chat → required draft → copy/finish | Same outputs as backend; visible source evidence and optional reliable highlights; no leaked keys, no automatic send. |
| 6 — Observed user tests | Known-user and fresh-stranger runs with unseen bills | Watch silently; inspect actual outcome and edits | Evidence captured and failure fixes replayed; claims match observations. |

After each stage, give the owner changed files, exact run instructions, a small demonstration, test outcomes, unresolved issues, and the next stage. End at that review boundary so learning/control is preserved; no silent jump from backend proof to a built frontend. A new user instruction can authorize proceeding. External deployment or database changes are reviewable outputs, not implied by this PRD alone.

**Stage 0/1 status on 2026-10-18:** Stage 0 and Stage 1 are implemented and verified locally under D-015. Four sanitized fixtures and 26 deterministic tests pass. Controlled templates produce a required draft/summary with code-bound numeric facts. That checkpoint was not extraction proof: fixtures are manually structured and source references are synthetic rather than coordinate boxes. See [Stage 0/1 record](../../work/08_STAGE_0_1_CALCULATION_CORE.md).

**Stage 3 database, smaller version, 2026-10-19 (D-033):** Owner chose to build the database before user tests, in a smaller first version of their hand-drawn model (evidence E-109): bills, line_items, expectations (with recorded/effective dates), findings, messages, message_events. Deferred: finding_lines and message_lines (line IDs stored as arrays meanwhile), chat, deletion. Supabase anonymous auth gives each browser an identity without a sign-up form. The server holds only the publishable key and acts with each user's own token; row level security limits every table to the user's own rows, with append-only history (no update/delete policies). `save_review` saves a completed review in one transaction. Only completed reviews are saved (not re-check states); a difference is saved once, after the explanation step. 'Copied' and 'sent' events are recorded; with a pasted sent text the server counts word-level changes (PRD convention) and blanks e-mail addresses, IBANs and numbers of seven or more digits before storing. The page shows a saved notice and an 'I sent it' box. A secret/service-role key is refused.

**Stage 3/4 work started 2026-10-19 (D-030):** Owner approved Stage 2 and asked to build the backend with FastAPI and then deploy. Checked first: FastAPI was only planned, never used; the existing route was a Node helper starting Python scripts. Implemented `app.py` (first created as `api/index.py`) (FastAPI 0.146.0, uvicorn 0.54.0): serves the review page and `GET /api/health`, `POST /api/analyze`, `POST /api/explain`, `POST /api/groq-extract`, calling the existing Python modules directly (no subprocess). Guards: allowed page origin, JSON only, size limits (200 KB; 5.5 MB for a crop), redaction confirmation, one provider request at a time per process, no automatic retries, security headers, interactive docs at /docs. Groq response cache only when not in production. Shared explain logic moved to `billshield_core/service.py`, also used by the CLI script. Same file layout is what Vercel expects; deployment, access code and hosted settings are the next step and not done. Database (Supabase) not started; owner chose hosting first.

**Stage 2 accepted 2026-10-19 (D-029):** Owner sign-off 2026-10-19: the project owner reviewed the Stage 2 flow in the browser (Participants A–D, Groq-first reading, Confirm all, Python checks, re-check gate, difference explanation and editable draft) and stated "everything is approved, we can go for next step". Stage 2 is closed on owner acceptance. Recorded limits: four reference cases only; the Network-panel privacy check and per-case correction counts were not separately documented; live Groq row-column quality was judged by the owner, not measured. No database, deployment or Stage 3 work has started.

**Stage 2 status on 2026-10-19 (after D-025):** D-024 provenance, explicit roles and the loopback `/api/analyze` route connecting confirmed lines to Python calculations and an editable required draft are implemented. 58 Python and 28 browser tests pass. An agent-scripted headless-browser replay of all four masked bills reproduced the reference verdicts and drafts (raw candidate matches A 1/8, B 4/5, C 14/14, D 0/8; remaining lines typed at page level); the table-level path was exercised with a cached Groq response and no live call. This is not owner acceptance.

**Earlier Stage 2 status on 2026-10-19 (before D-025):** Local OCR and optional Groq comparison harness exist (D-017–D-023). Last observed checks: 32 Python and 21 browser tests pass; three D prices match in a live Groq browser test. D-024 table-level confirmation remains unimplemented, as does browser-to-calculation/draft integration. Four-case accuracy, accepted source evidence, and complete privacy/post-confirmation replay remain open. Owner accepts proceeding with local integration before further OCR tuning; Stage 2 is not complete. See [Stage 2 record](../../work/09_STAGE_2_EXTRACTION.md).

Time trade-off: strict serial review can consume the remaining hackathon window. Protect a minimal runnable backend first, keep the early compatibility test small, and use the approved paper UI. If time is lost, cut polish—not numeric verification, source links, uncertainty, mandatory draft, or ownership isolation. The official Live checkpoint is Monday 09:00 IST: backend-only is an intermediate milestone, not a complete user-facing live app. Do not mark that checkpoint Green for end-to-end use if the UI is still absent. Submit an honest status if the learning-first sequence misses it.

## 10. Deployment and configuration

Vercel supports FastAPI as a Python function. Design for independent requests, not an always-running local process; no SQLite/local files as durable production storage and no in-process background task relied on after response. Use Supabase for durable state. Keep dependencies lightweight and measure PDF/image runtime behavior in the compatibility smoke test.

Vercel's function payload limit is no longer the reason for the bill-file cap because the default MVP does not upload bill bytes. The browser enforces the 4,000,000-byte/ten-page local processing limits for predictable performance. The server separately limits confirmed JSON metadata. Any future server file upload or private Storage design requires a new decision and privacy review; do not silently re-enable D-012's multipart route.

## PRD change history

| Version | Date | Change | Decision / verification |
|---|---|---|---|
| 1.0 | 2026-10-18 | Initial backend-first PRD from Moves 1–4. | D-011; planning only. |
| 1.1 | 2026-10-18 | Reconciled small-upload/hybrid-extraction recommendation throughout intake and deployment sections; added change tracking. | D-012; source inspection completed, implementation/benchmark pending. |
| 1.2 | 2026-10-18 | Recorded completed Stage 0/1 structured fixtures, deterministic calculation/verdict core, controlled drafts, and local verifier results. | D-015; 16 tests and four-case replay pass locally. |
| 1.3 | 2026-10-18 | Added Stage 2 local PDF/source/candidate/confirmation contracts and a configurable structured-output vision adapter; recorded live-gate limits. | D-016; 28 local tests pass, live fixture benchmark pending. |
| 1.4 | 2026-10-18 | Switched the confirmed MVP to client-side PDF.js/Tesseract.js extraction with least-data confirmed payload; removed required LLM/OpenAI adapter. | D-017; 11 browser and 26 Python tests pass, real-document gate pending. |
| 1.5 | 2026-10-18 | Retained local OCR and added optional Groq Qwen redacted-crop benchmark for later comparison. | D-022; offline tests, live gate pending at that point. |
| 1.6 | 2026-10-18 | Added explicit Groq crop preview/send in browser, local key-holding bridge and private response cache. | D-023; 32 Python/21 browser tests and three-price D smoke test. |
| 1.7 | 2026-10-19 | Allow table/page evidence confirmation without mandatory per-amount boxes; prioritize local calculation/draft integration and reconcile current status. | D-024; requirement confirmed, implementation pending; documentation-only audit. |
| 1.12 | 2026-10-19 | Added Current state summary (D-015–D-033) and Next development additions N-1 UI, N-2 LightOnOCR-3 server reading (evaluation first), N-3 chat + database; corrected outdated statements on LLM use, storage and configuration. | D-034; documentation only, nothing new implemented. |
| 1.11 | 2026-10-19 | Row columns inspired by EN 16931 and Indian GST e-invoice; re-check gate before any message; adjustment role; unambiguous two-digit decimal marks accepted. | D-028; 80 Python/36 browser tests; scripted B replay with one live GPT-OSS call. |
| 1.10 | 2026-10-19 | Difference explanation: deterministic exact-match search plus validated GPT-OSS 20B suggestion feeding the draft; button renamed Calculate and explain; privacy text corrected. | D-027; 71 Python/34 browser tests; limited live calls on D reference data. |
| 1.9 | 2026-10-19 | Groq first for photos, model-suggested roles/groups pre-filled, explicit Confirm all ready lines; amounts and signs never changed by the app. | D-026; owner-approved after hands-on feedback; 59 Python/34 browser tests and scripted D replay. |
| 1.8 | 2026-10-19 | Implemented D-024 provenance, explicit line roles, strict decimal-mark parsing, schema-2 confirmed payload and loopback confirmed → Python → editable draft flow. | D-025; 58 Python/28 browser tests; agent-scripted four-case browser replay; owner review pending. |

Material future changes link to DECISIONS.md and their implementation/test evidence; append new history rows instead of silently changing scope.

Keep each model operation within configured function/time budgets, cap pages and token output, use bounded provider timeouts/retries, and surface a recoverable failure. Verify actual plan duration limits during deployment instead of assuming unlimited execution. No queue/worker system in initial MVP; if measured accepted-document processing cannot fit, report the constraint and choose a narrower supported input limit before adding infrastructure.

Environment configuration (names only, never values): `GROQ_API_KEY`, `BILLSHIELD_ACCESS_CODE`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (publishable key only — a secret/service-role key is refused by the code), optional `BILLSHIELD_ALLOWED_ORIGINS`. Locally they live in the ignored `.env.local`; on Vercel in the project's environment variables, followed by a redeploy. *(Earlier proposal text in this paragraph — no LLM key required — superseded.)*

Supabase project and records remain where they are when the Python application is deployed. Deployment config supplies the same project URL/appropriate credentials (or a separately migrated production project); it does not “transport the database” to Vercel. Private storage and database permissions need verification as well as keys.

## 11. Build organization proposal

Application root is now `billshield-app/` (D-013). The following layout is relative to that folder; parent Hackathon retains the overall project record and private evidence, while this app folder holds the authoritative PRD and decision log. The Stage 0/1 core exists; API, extraction, persistence, deployment, and UI modules remain future implementation. No GitHub repository/remote created, and no nested git initialization performed inside existing parent C8 repository.

```text
backend/
  billshield_core/        # implemented calculations plus Stage 2 document/extraction/confirmation boundary
  app.py                  # future FastAPI entrypoint
  schemas.py              # future API/persistence shapes
  documents.py            # validated pages and source positions
  llm.py                  # one provider adapter
  writing.py              # grounded explanation/draft checks
  repository.py           # owner-scoped persistence
  config.py               # environment config, no secret literals
tests/
  fixtures/               # implemented four-case sanitized structured truth
  test_money.py           # implemented
  test_engine.py          # implemented verdict/mutation/message-binding checks
  test_golden_cases.py    # implemented four-case replay checks
  test_api.py             # future
  test_ownership.py       # future
supabase/migrations/      # reviewed versioned schema/policies
scripts/                  # fixture replay and local demos
frontend/                 # Stage 2 review harness exists; production UI remains later work
```

Exact file layout may change to keep implementation small. Pin tested dependency versions during implementation; do not invent package version guarantees in this PRD.

## 12. Definition of done

- All four real-source fixtures pass the three verifier rules through the complete local and hosted flow, with correction steps visible.
- Required draft exists for every completed review; no-issue and uncertain cases remain honest.
- Confirmed lines link to visible source table/page evidence with honest precision; exact highlights are optional and verified when provided (D-024).
- Current review, chat, expectation versions, line links, and events survive reload/restart.
- Multi-line finding/message links, masked storage, private access, and cross-user isolation are demonstrated.
- Same backend works locally and on Vercel; secrets and deployment limits verified; failed requests recover cleanly.
- UI follows the owner's final sequential drawing, with required drafting correction; copying never implies sending.
- Real-user testing evidence reports actual outcomes; no manufactured golden cases, quotes, send events, or success claims.
- Owner has understandable run instructions, schema, stage reports, known limitations, and final evidence links.

## Documentation sources checked 2026-10-18

- [Vercel FastAPI deployment](https://vercel.com/docs/frameworks/backend/fastapi): Python FastAPI support, deployment entrypoint, function execution model.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): 4.5 MB request/response payload limit; execution duration depends on plan/configuration.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control): policies, private access, service-key bypass behavior.
- [PDF.js browser examples](https://mozilla.github.io/pdf.js/examples/): browser PDF loading/rendering foundation.
- [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md): browser worker and recognition interface.

These sources support platform constraints, not claims that this application has been run or deployed. Existing implementation state at PRD creation: planning documents and evidence only.
