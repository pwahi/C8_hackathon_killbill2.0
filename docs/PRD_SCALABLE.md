# Kill Bill 2.0 (BillShield) — PRD: a check that works on bills we have never seen

Version 4.0 draft · 2026-10-20 · Owner: Prateek Wahi · Branch: `feature/scalable-check`

**Status (2026-10-20, merged to main 9861c5b):** the approved rule changes are recorded in [PRD.md](PRD.md) v3.1, which is authoritative for what exists; this document keeps the plan for what is left. Built: **W4** (maths-checked lines), **W2** (bill notes), **W5** (Python-graded causes), part of **W3** as the **whole-bill pass** (counted lines, copies, details, earlier bills, payments, empty tables, summary; D-065/D-066) and **W0-lite** (three measurement scripts). Not built: **W1** (any currency/language), the Python **balance check** (U2), W3 for bills that already add up, **W6** (never stuck). No user has tested the merged version. Rules marked **[changes a §5 rule]** below were approved by the owner where §10a says so.

---

## 1. Why this change

**The failed user test (Harsh, 2026-10-19, assisted, a long multi-page telecom bill):**

| What happened | Cause found in the code |
|---|---|
| Confirming the lines took longer than he was willing to spend | Every line had to be confirmed, even in sections whose lines already added up exactly to the printed subtotal. Python was used to stop the user until they confirmed, rather than to check the lines itself. |
| The explanation did not name the real reason (roaming) | The reader is told to keep amount lines only and ignore everything else ([groq_vision.py](../backend/billshield_core/groq_vision.py) `PAGE_PROMPT`). The explainer receives confirmed lines only ([gap_llm.py](../backend/billshield_core/gap_llm.py)). The bill text that explained the charge never reached the AI. |
| A payment was read as a discount | No rule checks the balance equation (previous balance − payments + new charges = amount due). |
| The same charges appeared more than once | Each page is read alone, so the reader of a detail page cannot see that the summary page already listed the charge. One prompt rule ("a label that repeats an earlier row is a separate line"), added for a single bill, pushes the AI to copy repeats. |
| He liked the message | Keep the message step as it is. |

**The app is fitted to the bills we tested.** It grew by fixing one bill at a time:
- prompt rules written for single cases (repeated labels, tax after subtotal);
- the explainer's number filter knows only `€ ₹ $ EUR INR Rs`;
- the privacy filter knows only English identifier words ("account", "customer"); "klantnummer" or "Kundennummer" pass;
- the scope says "EUR and INR";
- every amount is parsed with exactly 2 decimals ([money.py](../backend/billshield_core/money.py) `scale=2` everywhere), so currencies with 0 decimals (JPY, KRW) or 3 decimals (KWD, BHD, OMR) would be misread;
- only `.` and `,` are accepted as decimal marks, and only Western digits (0–9) are recognised; Arabic-Indic, Persian and Devanagari digits are not;
- the browser's amount finder ([amount-candidates.mjs](../frontend/extraction/amount-candidates.mjs)) knows only `EUR INR Rs € ₹`, English money words, and even the German place and bank names "koblenz" and "sparkasse" from one test bill;
- the accusation and price-judgement checks on AI text are English word lists, so they cannot check a message written in another language;
- the four reference cases are the only measured accuracy, and every prompt change was tuned on them.

Real bills will come from other countries, languages, currencies, sectors and layouts. The fix is not more rules. It is a different split of work between Python and the AI.

## 2. Goal

**Hard requirement (owner, 2026-10-20): the app works for any currency and any language.** This is a requirement, not an aim. A bill is never refused, and never read differently, because of its currency, language, script or number format.

Any bill from any country, language, currency or sector goes through the same flow:
- the user is asked only about the lines the maths cannot settle;
- the explanation cites evidence from the bill itself, checked by Python;
- when the app cannot verify something, it says so and still gives a partial answer.

## 3. Principles

1. **Python checks only rules that hold for every bill** (§5). It never needs to know the provider, the country, the sector or what a charge means.
2. **The AI is open-ended.** It reads, structures, notices context and proposes causes using general knowledge of bills. It is never given a fixed menu of causes.
3. **Python checks the AI's evidence, not its category.** Every AI claim names its lines, the share of the gap it claims to cover and the bill text it relies on. Python checks these three things whatever the cause is.
4. **Prompts state principles, not cases.** A prompt change that fixes one bill but does not improve the held-out set (§6) is not accepted.
5. **Python checks the AI's work; it does not stop the user.** When a check fails, the result is shown as "not verified" next to what was verified. The flow continues.
6. **The user is asked only where the AI and Python disagree, or where neither can decide.**

## 4. Scope

**In (this branch):**
- evaluation harness: held-out bills plus synthetic bills;
- any currency and any language (W1);
- removal of the fitting to tested bills;
- a document map and context notes;
- duplicate and breakdown detection;
- confirmation by exception;
- AI hypotheses tested by Python;
- partial answers instead of blocks.

**Out (deferred):**
- comparison with the previous bill (owner, 2026-10-20);
- asking the user why they expected an amount (dropped: someone who knew would not need the app);
- tariff lookups and provider research;
- currency conversion (a bill is checked in its own currency);
- explanations and screens in languages other than English (owner, 2026-10-20: English only for now);
- automatic sending.

**Unchanged:**
- the message step (tones, placeholders, Python fills the amounts);
- storage, privacy of saved data and Supabase;
- the UI chapters, except where a workstream below says otherwise.

## 5. Universal rules Python owns

These hold for any bill in any currency. Python applies each one only when the bill prints the lines it needs.

| # | Rule | Applies when |
|---|---|---|
| U1 | The counted lines of a group add up to the group's printed subtotal or total, at every level (section → part → invoice) | a subtotal or total is printed |
| U2 | Previous balance − payments received + new charges (± adjustments) = amount due | any of balance, payment or amount due is printed |
| U3 | Detail rows add up to the summary line they break down | the AI proposes a breakdown link |
| U4 | A repeated amount is counted once: a line marked "repeat of X" has the same amount as X and is not summed | the AI proposes a repeat link |
| U5 | Every amount shown or sent comes from the bill or from Python, never from AI text | always |
| U6 | Amounts are parsed in minor units using the bill's own decimal mark, digits and the currency's own number of decimals (0, 2 or 3, from ISO 4217); anything ambiguous is flagged, never repaired | always |
| U8 | Amounts in different currencies are never added together | a bill prints more than one currency |
| U7 | Every cited line id exists, and every quoted bill text appears word for word in what was read from the bill | any AI output |

Nothing in this table names a provider, a country, a language or a kind of charge. A new rule is added only if it holds for every bill.

## 6. Workstreams and acceptance

The order is fixed. Every workstream is measured on the held-out set before the next one starts.

### W0 — Evaluation harness (first; everything else is measured with it)

- **Held-out set.** Bills that are never used to tune prompts. They cover at least:
  - 4 languages, including one right-to-left script (e.g. Arabic) and one other non-Latin script;
  - 5 currencies, including one with 0 decimals (e.g. JPY), one with 3 decimals (e.g. KWD or OMR) and one the current code does not know (e.g. AED);
  - number formats: comma decimal (1.234,56), Indian grouping (1,23,456.00), space or apostrophe grouping (1 234,56 / 1'234.56) and non-Western digits;
  - 4 sectors (e.g. energy, telecom, insurance, hospital or rent);
  - 3 formats: a text PDF, a scan and a phone photo;
  - at least one multi-invoice document and one document of 8 pages or more.

  Masked, stored outside Git, as the current private bills are.
- **Synthetic bills.** A Python generator builds bill data with a known structure and one known cause, chosen at random:
  - an extra one-off fee;
  - usage outside the bundle;
  - a discount that ended;
  - a pro-rated period;
  - a summary page that repeats details;
  - a payment and a previous balance;
  - no difference at all.

  It renders the data as PDFs in varied layouts, languages, scripts, currencies and number formats. Every synthetic bill has a known right answer.
- **Metrics, reported per run:**
  - line accuracy (amount and role);
  - share of printed totals that close;
  - lines counted twice;
  - questions asked of the user per bill;
  - whether the right cause ranks first;
  - share of hypotheses Python verified.
- **Acceptance:**
  - one command runs the harness and writes a report;
  - a baseline report from the current `main` is saved before any other workstream starts.

### W1 — Any currency, any language, no fitting to tested bills

**Money: the AI detects, Python verifies (owner, 2026-10-20).**

Today the user picks the currency (EUR or INR only), the reader already proposes the decimal mark, and the structure check runs only for EUR and INR ([app.py](../app.py) `groq_extract`). On this branch the user no longer chooses any of these. The reader proposes them per bill; Python verifies:

| The reader proposes | Python verifies | The user is asked only when |
|---|---|---|
| **Language** of the bill (a code such as `nl`, `ar`) | Nothing to verify: it changes no number. It is used only to tell later steps what language the bill text is in | never |
| **Currency** as an ISO 4217 code, from symbols, text and country on the bill | The code exists in the ISO table. `$`, `kr`, `¥` and similar symbols that fit several currencies are accepted only when the bill's text or country settles which one | the bill itself does not settle it (once per bill) |
| **Number format:** decimal mark (`.` `,` `٫`), grouping (`.` `,` space, apostrophe, Indian lakh) and the digit script | Every amount on the bill must parse under that format, **and** the printed subtotals and totals must close under it. A wrong format almost always breaks the totals, so totals that close are strong proof the format is right | some amounts fit two formats and the totals do not settle it |
| — (not proposed) | **Number of decimals** comes from the ISO table for the currency (JPY 0, EUR 2, KWD 3), not from the AI. Python checks that the printed amounts agree with it and flags a bill where they do not | the printed amounts disagree with the currency |

- **The number of decimals is no longer fixed at 2.** **[changes a §5 rule]** Today's rule "one or two final digits after the separator" becomes "the currency's own number of decimals".
- Digits in any script are converted to 0–9 before parsing; the bill's printed form is kept for display.
- Anything that fits two formats and is not settled by the totals is flagged, never guessed (U6).
- The currency and format the reader proposed are shown once at the top of the check ("Read as: AED, 1,234.56"), so the user can correct them in one place.
- **Negative amounts** in any printed form (leading or trailing minus, parentheses, "CR" or its equivalent in the bill's language) come from the reader as an explicit sign. Python never flips a sign.
- **Hard-coded currency lists are removed** everywhere: the explainer's number filter, the browser's amount finder, the scope text. The filters use every Unicode currency symbol and every ISO 4217 code instead.

**Language:**
- **The reader reads any language and script, including right-to-left.** Descriptions are copied as printed. For a bill not in English, the reader also gives a short English gloss per line, shown next to the printed label and marked as an AI translation.
- **No word lists in the code that decide anything.** Roles, structure, repeats and identifiers are labelled by the reader in any language; Python checks only numbers and structure. The English keyword lists in [amount-candidates.mjs](../frontend/extraction/amount-candidates.mjs), including the place and bank names, are removed or replaced.
- **Privacy that does not depend on English.**
  - Structural patterns (card numbers, IBAN, e-mail, long digit runs in any script) stay; they are language-independent.
  - The English word list is replaced by the reader marking identifier fields itself, in any language.
  - Python masks the identifier part of a flagged label instead of blocking the whole line ("Klantnummer ••••").
  - The rule "never send personal data to the text models" is unchanged.
- **Output language: English only on this branch (owner, 2026-10-20).** The explanation is written in English, whatever the bill's language. Bill labels are quoted as printed, with the English gloss next to them. Python fills every amount, formatted the way the bill prints it, with the bill's currency.
- **The message to the provider is also English on this branch** (recommended; owner to confirm). This keeps every check on AI text deterministic: the existing English accusation and price-judgement rules cover everything the app writes. A message in the bill's language is a later step; it would need a check that works in any language, which a word list cannot give.
- **Checks on AI text** become independent of currency and script: no digits in any script, no currency symbols (every Unicode currency symbol) and no ISO 4217 codes, every placeholder intact, at least one checked fact. Digits are still allowed inside a bill label quoted word for word.

**Prompts state principles.** Case-specific rules in the reader prompts are rewritten as general principles or removed. The repeated-label rule goes; repeats are handled by W3.

**Acceptance:**
- the reader's proposed currency and number format are right for every held-out bill, or the user is asked; never silently wrong;
- every bill in the held-out set is read in its own currency with the right number of decimals and the right signs;
- no bill is refused or wrongly blocked because of its language, script or number format;
- the held-out set as a whole does not get worse than the W0 baseline;
- the English explanation and message pass all checks for every held-out bill, including those in other scripts.

### W2 — Document map and context notes

- **Document map.** Before pages are read, one pass over all pages (their text layer, or small images) gives each page a role and a topic, for example: summary, itemised detail, usage records, terms, payment information, advertising. Each page is then read with the map in its prompt.
- **Context notes.** The reader returns short facts next to the lines. Examples: "roaming usage outside the EU, 12–18 Aug", "price change from 1 July", "estimated meter reading". Each note:
  - quotes the bill text it comes from;
  - names the line ids it relates to, if any;
  - contains no personal data.

  Notes are never summed and never need confirmation.
- **Python checks (U7):** every quote appears in the page text read from the bill, and every line id exists. Notes that fail are dropped from what the AI uses, not shown to the user as an error.
- **Acceptance:**
  - on synthetic bills whose cause is printed as text, a note naming it is produced in at least 80% of cases;
  - no note contains personal data in the held-out set.

### W3 — Duplicates and breakdowns: the AI proposes, Python verifies

- The AI marks a line as **"repeat of X"** (the same charge listed again, e.g. on a summary page) or **"breakdown of X"** (detail rows that add up to X).
- **Python:**
  - accepts a repeat when the amounts are equal (U4);
  - accepts a breakdown when the rows add up to X exactly (U3).

  Accepted lines are folded under X: shown and expandable, labelled "repeated on page 7, not counted" or "details of X", and not asked about. Proposals that fail go to the user as one question: "Is this the same charge as X?"
- **Acceptance:**
  - zero lines counted twice on the synthetic set;
  - on the held-out set, lines counted twice fall below the baseline, and no real charge is folded away wrongly.

### W4 — Confirmation by exception [changes a §5 rule]

**Today:** every counted line must be confirmed by the user.
**Proposed:** every counted line is either verified by maths or confirmed by the user.

- **A section is auto-verified when all of these hold:**
  - its counted lines add up exactly to its printed subtotal (U1);
  - each amount was read with high confidence;
  - none of its lines is negative, a payment, a credit or a balance.

  It is shown collapsed as "✓ adds up to the printed subtotal". The user can open it and edit any line; an edit removes the verification.
- **Payments, credits and balances are checked with U2.** A line that fails U2 is asked about with the reason in plain words, for example "This looks like a payment, not a discount."
- **The user is asked one question per problem, not one per line.**
- **Known limit:** two reading errors can cancel each other out, so maths that closes is not proof. The confidence and sign conditions above reduce this risk; W0 measures how often it happens.
- **Acceptance:**
  - questions per bill drop clearly against the baseline;
  - line accuracy of auto-verified sections is at least that of user-confirmed lines in the baseline;
  - in a user test, a new person finishes confirmation without saying it took too long.

### W5 — Hypotheses tested by Python

- The explainer receives:
  - the lines;
  - the structure;
  - the context notes;
  - Python's difference and exact matches (from [gap.py](../backend/billshield_core/gap.py)).
- It proposes up to five causes, each with:
  - the cited line ids;
  - quoted bill text (from notes), if any;
  - the share of the gap it claims to explain: all or part.

  It uses general knowledge of bills and is given no list of causes.
- **Python grades each hypothesis:**
  - **explains the full difference:** the cited lines account for the whole gap, in minor units;
  - **explains part:** it covers €x of €y, in the right direction;
  - **supported by bill text, amount not checkable:** the quote passes U7 but the amount cannot be tied to lines;
  - **not supported:** a line is missing, the direction is wrong, or the quote is not on the bill. Hidden from the user.

  Results are ranked in that order. The story the user reads is written only from the hypotheses that passed.
- **Unchanged:**
  - no numbers in AI text;
  - no accusations;
  - Python fills every amount.
- **Acceptance:**
  - on synthetic bills, the injected cause ranks first in at least 80% of cases;
  - on the held-out set, no "not supported" hypothesis is ever shown.

### W6 — Partial answers instead of blocks

- **Every failure state ends in a result**, not a stop:
  - a total that will not close;
  - an AI timeout;
  - a rejected hypothesis;
  - a page that could not be read.

  The result says what was verified, what was not, and why, in one line each.
- **The message step works on any partial result:** it uses only verified facts and asks the provider about the rest.
- **Acceptance:** none of the held-out or synthetic bills ends without a result and a draft message.

## 7. Data contracts (to be detailed before building)

```text
DocumentMap   { pages: [{ page, role: summary|detail|usage|terms|payment|other, topic, invoice_label }] }
ContextNote   { id, page, quote, summary, line_ids[] }                     -- U7 checked, never summed
LineRelation  { line_id, kind: repeat|breakdown, of_line_id }              -- U3/U4 checked
SectionCheck  { section_id, verified_by: maths|user|none, reason }
Hypothesis    { line_ids[], note_ids[], claims: full|part, reason (digit-free) }
HypothesisGrade { hypothesis, grade: full|part|text_only|unsupported, covered_minor, gap_minor }
```

All are typed models in `backend/billshield_core`. AI output is parsed into them; anything that does not fit the model is dropped, not repaired.

## 8. Rules from PRD v3.0 that stay as they are

- Python owns every amount, sum, comparison and verdict.
- AI text that reaches the user or the message contains no numbers or accusations.
- Every message references confirmed or verified line ids.
- No bill image storage. Only the publishable Supabase key is used.
- The local-only error logging never runs hosted.
- Bill text is data, never instructions.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Auto-verify accepts two reading errors that cancel out | Confidence and sign conditions (W4); measured in W0; the user can always open a section |
| A real charge folded away as a repeat | Folded lines stay visible; repeat needs equal amounts; measured in W3 |
| Context notes leak personal data | Same privacy rules as lines; checked in the held-out set |
| The map pass adds time and cost | One text-only pass where a text layer exists; time the slowest bill against the 60-second Vercel limit |
| Synthetic bills are cleaner than real ones | Held-out real bills stay the main gate; synthetic bills test the logic, not reading quality |
| Held-out set too small to prove generality | Report the coverage honestly; claim only what the set shows |
| The AI proposes the wrong number format and every amount is off | The totals must close under the proposed format; if they do not, the format is not accepted and the user is asked |
| The wrong currency is picked from an ambiguous symbol (`$`, `kr`, `¥`) | Accepted only when the bill's text or country settles it; otherwise the user confirms once |
| An English-only explanation is harder to follow for someone who reads the bill in another language | Known limit of this branch; labels are quoted as printed next to their English gloss |
| A right-to-left or non-Latin bill is read worse than Latin ones | Measured separately in W0; reported per script, not hidden in an average |
| A hypothesis that passes Python but is still the wrong reason | It is labelled "AI suggestion, checked against the bill's numbers", not "the reason" |

## 10. Branch and release

- **Branch:** `feature/scalable-check`, from `main` at d17429c.
- **Preview:** Vercel builds pushed branches at their own preview address. Pushing needs owner approval each time.
- **Merge to `main` only when:**
  - W0–W6 meet their acceptance criteria on the held-out set;
  - all existing tests pass;
  - one new user test with a stranger has been run and recorded honestly;
  - the owner approves.

## 10a. Owner decisions, 2026-10-20

- **Scope for 2026-10-20 ("core 3"):** W0-lite (baseline on the existing bills plus a small synthetic set) → W4 → W2 + W5. W1 (any currency and language), W3 and W6 follow in a later round. The branch is merged to `main` today only if it passes the gates in §10.
- **W4 rule approved:** a line counts when it is checked by maths or confirmed by the user.
- **Test bills today:** the existing private bills as the regression baseline, plus synthetic bills. No new real bills are tested today; any result is reported as covering only these bills.
- **The explanation is in English only.** The message follows the recommendation and stays English (question 5).
- **Merge gate relaxed for today:** the stranger-test condition in §10 is waived for a same-day merge. The test is still owed before any claim that the change helped users.

## 10b. Built, measured and still open (2026-10-20, end of day)

| Workstream | State | Measured | Open |
|---|---|---|---|
| W0-lite | `eval_confirmation_load.py`, `eval_synthetic_causes.py`, `eval_bill_map.py` | baseline and after for cached reads; 13 generated causes | held-out real bills from other countries |
| W4 | built (D-064) | 93 of 166 counted lines in cached reads no longer need a look | user timing |
| W2 | built (D-064) | notes found on the Vodafone and generated bills | verification against images (only PDFs have a text layer) |
| W5 | built (D-064, D-066) | right cause first in 13/13 generated bills | real-bill accuracy |
| W3 (whole-bill pass) | built for bills whose pages do not link; summary for every bill (D-065, D-066) | participant's 49 lines: 45 folded with a checked reason, 0 left to review | bills that add up but still show repeats; participant's PDF end to end |
| U2 balance check | not built | — | — |
| W1 | not built; found: EUR/INR only, 2 decimals, Dutch rule, hard-coded names | — | all |
| W6 | not built | Flipkart (C) still stops at grouping questions | all |

## 11. Open questions for the owner

1. Approve the W4 rule change: "every counted line is verified by maths or confirmed by the user"?
2. Where do held-out bills come from (friends, public sample bills, own bills from other countries), and who masks them?
3. Is extra AI cost per bill acceptable for the map pass? The cost is to be measured in W0.
4. Approve the W1 rule change: the number of decimals comes from the currency (0, 2 or 3), not fixed at 2?
5. Should the message to the provider also stay in English on this branch (recommended), or be written in the bill's language?
