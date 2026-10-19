import test from "node:test";
import assert from "node:assert/strict";
import { outcomeText, whenText, MESSAGE_TEXT } from "../saved-checks.mjs";

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
