import test from "node:test";
import assert from "node:assert/strict";
import { appendPageCandidates, pageLineCounts, manualCandidateFields, printedCheckPresence, removeCandidateById, rowRevealDelay } from "../extraction/page-review.mjs";

test("adding page 2 preserves page 1 values, corrections and confirmation", () => {
  const first = {id: "one", page: 1, rawAmount: "33,75", confirmed: true, corrected: true};
  const second = {id: "two", page: 2, rawAmount: "19,50", confirmed: false};
  const original = [first];
  const merged = appendPageCandidates(original, [second], 2);
  assert.deepEqual(merged, [first, second]);
  assert.equal(merged[0], first);
  assert.deepEqual(original, [first]);
  assert.deepEqual(pageLineCounts([1, 2, 3], merged), [{page: 1, count: 1}, {page: 2, count: 1}, {page: 3, count: 0}]);
});

test("same printed amount on different pages is never silently merged", () => {
  const merged = appendPageCandidates([{id: "a", page: 1, rawAmount: "2.50"}], [{id: "b", page: 2, rawAmount: "2.50"}], 2);
  assert.equal(merged.length, 2);
});

test("empty extraction retains earlier lines without inventing page amounts", () => {
  const first = {id: "a", page: 1};
  const merged = appendPageCandidates([first], [], 2);
  assert.deepEqual(merged, [first]);
  assert.deepEqual(pageLineCounts([1, 2], merged), [{page: 1, count: 1}, {page: 2, count: 0}]);
});

test("wrong-page output or duplicate IDs cannot corrupt the current list", () => {
  const current = [{id: "a", page: 1}];
  assert.throws(() => appendPageCandidates(current, [{id: "b", page: 1}], 2), /selected page/);
  assert.throws(() => appendPageCandidates(current, [{id: "a", page: 2}], 2), /Duplicate/);
  assert.throws(() => appendPageCandidates(current, [], 0), /Invalid/);
  assert.deepEqual(current, [{id: "a", page: 1}]);
});

test("retrying the same source area preserves corrected lines instead of duplicating them", () => {
  const existing = {id: "old", page: 1, rawAmount: "33,75", confirmed: true, extractionSourceKey: "area", extractionSignature: "original model row"};
  const repeated = {...existing, id: "new", rawAmount: "3375", confirmed: false};
  assert.deepEqual(appendPageCandidates([existing], [repeated], 1), [existing]);
  assert.equal(appendPageCandidates([existing], [{...repeated, extractionSourceKey: "different area"}], 1).length, 2);
});

test("two identical rows printed in one crop keep their multiplicity on retry", () => {
  const row = {page: 1, extractionSourceKey: "area", extractionSignature: "same printed row"};
  const original = [{...row, id: "a"}, {...row, id: "b"}];
  assert.equal(appendPageCandidates([], original, 1).length, 2);
  assert.deepEqual(appendPageCandidates(original, [{...row, id: "c"}, {...row, id: "d"}], 1), original);
});

test("manual entry preserves printed decimals and marks page-only evidence", () => {
  for (const rawAmount of ["33,75", "1,299.00", "-200.00", "0"]) {
    const fields = manualCandidateFields({page: 2, role: "charge", description: "Printed label", rawAmount});
    assert.equal(fields.rawAmount, rawAmount);
    assert.equal(fields.confirmed, false);
    assert.equal(fields.precision, "page");
    assert.equal(fields.bounds, null);
  }
});

test("missing manual values and subtotal sections are rejected without a guess", () => {
  const fields = {page: 1, role: "total", description: "Total", rawAmount: ""};
  assert.throws(() => manualCandidateFields(fields), /printed label and amount/);
  assert.throws(() => manualCandidateFields({...fields, rawAmount: "10", role: "subtotal"}), /section/);
  assert.throws(() => manualCandidateFields({...fields, rawAmount: "10", page: 0}), /source page/);
});

test("charges never count as a printed check and confirmation stays explicit", () => {
  assert.equal(printedCheckPresence([{role: "charge", rawAmount: "33.75", description: "Charges", confirmed: true}]), "missing");
  const total = {role: "total", rawAmount: "33.75", description: "Total", confirmed: false};
  assert.equal(printedCheckPresence([total]), "needs_confirmation");
  assert.equal(printedCheckPresence([{...total, confirmed: true}]), "confirmed");
  assert.equal(printedCheckPresence([{...total, rawAmount: ""}]), "needs_details");
  assert.equal(printedCheckPresence([{...total, role: "subtotal"}]), "needs_details");
});

test("remove targets one ID and preserves the removed record for Undo", () => {
  const lines = [{id: "one", page: 1}, {id: "two", page: 2}];
  const result = removeCandidateById(lines, "one");
  assert.deepEqual(result.lines, [lines[1]]);
  assert.equal(result.removed, lines[0]);
  assert.equal(result.index, 0);
  assert.equal(lines.length, 2);
  assert.equal(removeCandidateById(lines, "unknown").removed, null);
});

test("row reveal is staggered but large tables never wait indefinitely", () => {
  assert.equal(rowRevealDelay(0), 0);
  assert.equal(rowRevealDelay(1), 65);
  assert.equal(rowRevealDelay(100), 520);
});
