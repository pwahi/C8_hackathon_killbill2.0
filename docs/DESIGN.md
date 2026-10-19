# BillShield desktop design

Source: owner-provided `BillShield UI mock-ups.html` (2026-10-19), six desktop boards nominally 1280×800. Source path/hash and verification in parent work/13_DESKTOP_MOCKUP_IMPLEMENTATION.md. Actual reference pixels and decoded HTML inspected locally; no website scrape or remote assets needed. D-038, PRD v2.3.

## Extracted tokens (from reference CSS)

| Role | Value |
|---|---|
| Background / panel | #FAFAF7 / #FFFFFF |
| Ink / muted / secondary | #111111 / #5F6368 / #3C4043 |
| Line / input border | #E4E4DE / #C8CCC4 |
| Accent / soft accent | #F5C400 / #FFF8D6 |
| Re-check / checked | #C8102E / #1E6B45 |
| Corners | 6px (panels/controls), pill chips |
| Main content | 1160px maximum; 32px horizontal padding; 40–48px section padding/gaps |
| Display type | Anton, 56px first title; 44px later titles; 26px wordmark |
| Body type | Reference IBM Plex Sans; implementation system sans fallback |

## Components/layout

White horizontal header: wordmark/cut left, five chapters right, 3px active underline. Chapter 1 upload left/settings right; Read source left/approval guidance right; Check source left/compact row list right; Findings story/facts left/math right; Message editor left/send-report card right. Responsive stacking at 850px, compact navigation at 600px. Money is tabular and right-aligned. Buttons have visible keyboard focus; expandable rows use native details/summary.

Desktop stylesheet: frontend/desktop.css, layered after existing functional styles. Main orchestration: frontend/ui-flow.mjs. API-result presentation: frontend/result-display.mjs. No calculation/model/storage logic belongs in the stylesheet or mock-up.

## Assets

Anton Latin woff2 extracted unmodified from the supplied bundle; locally served at /assets/fonts/anton-latin.woff2 with ANTON-LICENSE.txt. No remote font requests or new dependency. No image asset is needed for this UI; the bill preview always uses the person's local file, never a sample invoice presented as theirs. scripts/preview_mockup.py recreates read-only desktop references and can re-extract supplied font/licence if given the original owner file.

## Constraints and unresolved fidelity

Expected amount required despite optional reference copy. No sample numbers/explanations, assumed tax exclusions, or fabricated highlights. No send-channel or formatting controls without implemented behaviour. Exact crop approval uses existing modal; final message chapter includes Finish. System body font, real result length and variable numbers of lines mean this is an adapted working implementation, not a pixel-perfect screenshot replica. Mobile is an adaptation. Live extraction accuracy, saved-history/chat gaps and owner/usability acceptance remain separate from design fidelity.

## Review recovery follow-up — D-039, 2026-10-19

Retain the desktop reference. Read/Check expose per-page reading, last-area preview and page line counts. Compact rows show source page and visible remove control; Add a line and Undo sit above the list. Printed-total prompt offers exact manual entry before checking. Appended rows use a short staggered fade; reduced motion disables it. Exact same-area repeat suppression does not merge equal charges across pages or areas. See parent work/14_MULTI_PAGE_AND_REVIEW_RECOVERY.md for offline verification and limits. Local only, not deployed.
