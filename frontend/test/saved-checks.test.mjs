import test from "node:test";
import assert from "node:assert/strict";
import { outcomeText, whenText, MESSAGE_TEXT, rowSummary } from "../saved-checks.mjs";

test("each saved check says plainly how it ended, using Python's saved amount", () => {
  assert.deepEqual(outcomeText({ verdict: "checks_passed" }), { text: "✓ Matches what you expected", tone: "ok" });
  assert.deepEqual(outcomeText({ verdict: "unexplained", difference: "EUR 3.78" }), { text: "Difference EUR 3.78", tone: "warn" });
  assert.equal(outcomeText({ verdict: "verified_mismatch" }).tone, "bad");
});

test("dates are readable and a broken date shows nothing rather than 'Invalid Date'", () => {
  assert.match(whenText("2026-10-19T20:15:00Z"), /19 Oct 2026/);
  assert.equal(whenText("not a date"), "");
});

test("message status covers every saved state", () => {
  assert.deepEqual(Object.keys(MESSAGE_TEXT), ["sent", "copied", "not sent yet"]);
});

test("each previous bill is one short line: name, date, total, difference, message status", () => {
  const row = rowSummary({ name: "Claude Pro (14 October-14 November) · VAT - Netherlands", createdAt: "2026-10-19T14:54:00Z",
    total: "EUR 21.78", verdict: "unexplained", difference: "EUR 3.78", messageStatus: "not sent yet" });
  assert.equal(row.title, "Claude Pro");
  assert.equal(row.meta, "19 Oct · EUR 21.78 · +EUR 3.78 · Not sent");
  assert.equal(rowSummary({ name: "", createdAt: "x", total: "EUR 1.00", verdict: "checks_passed", messageStatus: "sent" }).meta, "EUR 1.00 · Matches · Sent");
});
