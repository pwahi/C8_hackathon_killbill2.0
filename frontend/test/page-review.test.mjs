import test from "node:test";
import assert from "node:assert/strict";
import { appendPageCandidates, pageLineCounts, manualCandidateFields, printedCheckPresence, removeCandidateById, rowRevealDelay, linkUnassignedSections, assignSection, suggestSection, sectionReviewKey, sectionAccepted } from "../extraction/page-review.mjs";

test("nearby section suggestion never chooses cross-page summary or changes conflicting groups", () => {
  const lines = [{id:"summary", role:"charge", page:1, group:"Monthly", extractionSourceKey:"first"},
    {id:"detail", role:"charge", page:2, group:"Different model label", extractionSourceKey:"second", rawAmount:"20,54"},
    {id:"discount", role:"discount", page:2, extractionSourceKey:"second", rawAmount:"-4,19"},
    {id:"s", role:"subtotal", page:2, group:"Monthly", extractionSourceKey:"second", rawAmount:"31,25"}];
  assert.deepEqual(suggestSection(lines, "s").map(line => line.id), ["detail", "discount"]);
  assert.equal(lines[1].group, "Different model label");
  assert.equal(sectionAccepted(lines, "s"), false);
});

test("section suggestions stop at earlier subtotals and cannot jump across read areas", () => {
  const lines = [{id:"a", role:"charge", page:2, extractionSourceKey:"area"},
    {id:"s1", role:"subtotal", page:2, extractionSourceKey:"area", group:"First"},
    {id:"b", role:"charge", page:2, extractionSourceKey:"area"},
    {id:"s2", role:"subtotal", page:2, extractionSourceKey:"area", group:"Second"}];
  assert.deepEqual(suggestSection(lines,"s2").map(line=>line.id),["b"]);
  lines[2].extractionSourceKey = "other";
  assert.deepEqual(suggestSection(lines,"s2"),[]);
});

test("section suggestion respects consistent names rather than absorbing a neighbouring charge", () => {
  const lines = [{id:"standalone",role:"charge",page:1,extractionSourceKey:"area",group:"Separate"},
    {id:"detail",role:"charge",page:1,extractionSourceKey:"area",group:"Monthly"},
    {id:"discount",role:"discount",page:1,extractionSourceKey:"area"},
    {id:"s",role:"subtotal",page:1,extractionSourceKey:"area",group:"Monthly"}];
  assert.deepEqual(suggestSection(lines,"s").map(line=>line.id),["detail"]);
});

test("accepted section becomes pending after a member amount, label or membership changes", () => {
  const lines = [{id:"a", role:"charge", page:2, group:"Monthly", rawAmount:"20,54", description:"Plan"},
    {id:"s", role:"subtotal", page:2, group:"Monthly", rawAmount:"20,54"}];
  lines[1].sectionAcceptedKey = sectionReviewKey(lines,"s");
  assert.equal(sectionAccepted(lines,"s"),true);
  for (const change of [{rawAmount:"21,00"},{description:"Corrected plan"},{group:"Other"}]) {
    assert.equal(sectionAccepted([{...lines[0],...change},lines[1]],"s"),false);
  }
});

test("subtotal links preceding unassigned rows in the same read area without changing amounts", () => {
  const lines = [{id:"a", page:2, role:"charge", rawAmount:"20,54", confirmed:true, extractionSourceKey:"crop"},
    {id:"b", page:2, role:"discount", rawAmount:"-4,19", extractionSourceKey:"crop"},
    {id:"s", page:2, role:"subtotal", group:"Monthly costs", extractionSourceKey:"crop"}];
  const linked = linkUnassignedSections(lines);
  assert.equal(linked[0].group, "Monthly costs");
  assert.equal(linked[0].confirmed, false);
  assert.equal(linked[1].rawAmount, "-4,19");
  assert.equal(lines[0].group, undefined);
});

test("automatic linking never overwrites conflicting groups or crosses source areas/pages", () => {
  for (const change of [{group:"Other"}, {extractionSourceKey:"other"}, {page:1}]) {
    const lines = [{id:"a", page:2, role:"charge", extractionSourceKey:"crop", ...change},
      {id:"s", page:2, role:"subtotal", group:"Monthly", extractionSourceKey:"crop"}];
    assert.deepEqual(linkUnassignedSections(lines), lines);
  }
});

test("section picker explicitly moves selected rows and clears deselected membership", () => {
  const lines = [{id:"a", role:"charge", group:"Wrong", confirmed:true},
    {id:"b", role:"discount", group:"Monthly", confirmed:true},
    {id:"s", role:"subtotal", group:"Monthly"}];
  const assigned = assignSection(lines, "s", ["a"]);
  assert.equal(assigned[0].group, "Monthly");
  assert.equal(assigned[0].confirmed, false);
  assert.equal(assigned[1].group, "");
  assert.equal(lines[0].group, "Wrong");
});

test("section picker refuses empty selection or selecting another total", () => {
  const lines = [{id:"s", role:"subtotal", group:"Monthly"}];
  assert.throws(() => assignSection(lines, "s", []), /Choose/);
  assert.throws(() => assignSection(lines, "s", ["s"]), /only/);
});

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
