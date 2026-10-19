# UI research and design brief — "Kill Bill 2.0" (input for N-1)

2026-10-19 · Status: research and proposal for the owner's review; nothing built. Requirement context: PRD v2.0 §3 (flow) and §12 N-1.

**Principle:** BillShield is a bill-checking tool. Clarity and trust come first; the *Kill Bill* reference is a light accent (colour, chapter labels, one "cut" motif) — never decoration that competes with the numbers.

## 1. What similar apps teach

| Finding | Source | Apply to BillShield |
|---|---|---|
| The AI pre-fills; the person mainly **reviews**, not types | SAP Concur ExpenseIt (creates line items and itemizes hotel bills automatically) | Keep pre-filled cards + one **Confirm all**; editing is the exception |
| A separate **review/verify** step before anything is final | expense-capture descriptions (review, categorize, match; verification layer) | Our Confirm step stays a clear, separate chapter |
| Missing key fields should be **flagged, not silently fail** | Expensify SmartScan (needs date, total, merchant) | Show "missing total" / "line unclear" as a short note on the card or step |
| **Retake** prompt when the photo is blurry | Workday/LSU receipt guidance | When reading finds nothing or is cut off: one clear "select a smaller area / clearer photo" action |
| Competitor BillShield (Srikar-Merugu) uses plain-words explanations per line, email/chat message styles, "where did you send it?" | repository review 2026-10-19 | Worth adopting: one-line plain explanation per row (from Groq), channel choice, sent-where |

General UI practice applied (not from a single source): one primary action per screen; progressive disclosure (summary first, formulas on demand); tabular numerals for amounts; mobile-first; status never shown by colour alone.

## 2. *Kill Bill* visual signature (what to borrow, minimally)

Observed signature of the films' marketing and titles: **high-contrast yellow and black**, with **sparing blood-red**; the yellow-black is a widely cited nod to Bruce Lee's *Game of Death* jumpsuit; **heavy, bold display type** for titles while supporting text stays plain; the story is told in **numbered chapters**; the Bride's **list of names crossed off one by one**; the **sword cut**.

| Film element | Minimal BillShield translation | Where |
|---|---|---|
| Yellow + black | One accent yellow on near-black/white; never large yellow areas behind text blocks | primary button, progress bar, active step, selection box |
| Sparing red | Red only for "doesn't add up / re-check" | outcome A banner, suspect line marker |
| Chapters | Step labels: **Chapter 1 · Your bill**, **2 · Read**, **3 · Check the lines**, **4 · What we found**, **5 · Your message** | step header (small caps, quiet) |
| The crossed-off list | A confirmed line gets a thin check; lines that explain the difference stay highlighted — "the list" of what to ask about | confirmation list, result |
| The cut | One thin diagonal slash in the logo mark and as the divider under the step header | logo, one divider |
| Bold title type | Heavy condensed display face for the wordmark and chapter titles only | header, chapter titles |

**Do not use:** film images, characters, the film logo or its exact lettering, Japanese title text, quotes, blood splatter, sword illustrations, or violent wording in app text ("kill", "revenge"). The name "Kill Bill 2.0" stays a playful project name; the app's voice is calm and factual ("Let's check this bill"). Avoids trademark/copyright imitation and keeps trust.

## 3. Proposed visual system

**Colour tokens** (light theme; dark theme swaps paper/ink and keeps the accent):

| Token | Value (proposal) | Use |
|---|---|---|
| `--paper` | `#FAFAF7` | page background |
| `--ink` | `#111111` | text, outlines |
| `--muted` | `#5F6368` | secondary text |
| `--line` | `#E4E4DE` | borders, dividers |
| `--accent` (Bride yellow) | `#F5C400` | primary button fill (black text), progress, selection |
| `--alert` (red) | `#C8102E` | re-check only |
| `--ok` | `#1E6B45` | small "checked" marks (with an icon, never colour alone) |

Contrast rules: black on yellow is fine; **never yellow text on white**; red only with an icon and words.

**Type:** wordmark and chapter titles in a heavy condensed sans (e.g. *Anton* or *Bebas Neue* via Google Fonts — free); everything else in a clean UI sans (system font or *Inter*); amounts with `font-variant-numeric: tabular-nums` and right-aligned.

**Shape:** flat, square-ish corners (4–6 px), 1 px borders, no shadows/gradients; generous white space; max content width ~720 px for reading steps; split view only where the bill must sit beside the list.

## 4. Screen-by-screen proposal (5 chapters)

Progress bar on top (5 thin segments, yellow for done/current). One primary yellow button per chapter, bottom-right on desktop, full-width sticky on mobile.

1. **Your bill** — one drop zone ("Photo or PDF"); expected amount; currency and decimal mark shown as small, pre-guessed choices; one line: *"Your bill stays on your device. Only the part you choose is sent to be read."* Button: **Read my bill**.
2. **Read** — the bill large; instruction "Draw a box around the prices"; preview sheet with the cropped image and one checkbox "No names or numbers I want to keep private" → **Send this part**. Fallback link (small): "Read it on this device instead".
3. **Check the lines** — desktop: bill left, list right; mobile: list with a "Show on bill" toggle. Each line is one row: label · amount (right) · role chip (Charge/Discount/Total…). Tap to expand row columns. Notes only when needed. Button: **Looks right — check it**. (Confirm all + calculate in one action, with the explicit confirmation text on the button.)
4. **What we found** — one big plain sentence first, e.g. *"Your bill adds up. It is ₹3,000 more than you expected."* Then up to three short bullets: what explains it (Python facts) and "possible reasons" (AI, labelled). "Show the maths" expands formulas and row checks. Outcome A replaces this with a red-edged card: *"These numbers don't add up — probably a reading mistake"* + the suspect lines + **Fix lines**.
5. **Your message** — Email / Chat toggle; editable text; **Copy**; then "Sent it? Where?" (Email, WhatsApp, company app, other) + optional paste → **I sent it** → "You changed N words." Small link: "Check another bill". (Chat about the bill can sit here later, N-3.)

## 5. Copy tone

Short, calm, second person; numbers always from Python; no blame ("This line explains the difference", not "They overcharged you"); explain internal terms in plain words (Role → "What is this line?", Precision → shown only as "on the bill" / "in the selected table" / "somewhere on page 2").

## 6. Next step

Owner reviews this brief (keep/drop items). Then N-1 implementation per PRD §12 and HANDOFF §7, plain HTML/CSS/JS, reusing the existing logic; a clickable mock of chapters 1–5 can be produced first for approval.

## Sources

- [SAP Concur — capturing receipts](https://www.concur.com/blog/article/how-capture-receipts-your-mobile-phone)
- [Expensify — receipt upload best practices (SmartScan)](https://community.expensify.com/discussion/5675/concierge@expensify.com)
- [Receipt scanning glossary (review/verification step)](https://www.hyperbots.com/glossary/receipt-scanning-app)
- [LSU receipt scanning guidance (retake blurry photos)](https://dsm.lsu.edu/administration/ofa/oas/business_manager_meetings/receipt_scanning.pdf)
- [What font does Kill Bill use? — title typography and palette notes](https://madegooddesigns.com/?p=10066)
- [Kill Bill Vol. 1 Japanese poster (red title, Japanese lettering)](https://japanposter.co.uk/products/kill-bill-vol-1-%E3%82%AD%E3%83%AB-%E3%83%93%E3%83%AB-vol-1-original-japanese-b1-advance-movie-poster-2003-rare-b1-poster-size-c-72-cm-103-cm-gallery)
- Competitor repository reviewed: [Srikar-Merugu/billshield](https://github.com/Srikar-Merugu/billshield)
