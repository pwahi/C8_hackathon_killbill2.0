import test from "node:test";
import assert from "node:assert/strict";
import { lineTreeRows } from "../line-tree.mjs";

const c = (gid, more = {}) => ({ id: `whole-${gid}`, gid, structureVerified: true, ...more });
const TREE = [{ id: "inv", kind: "invoice", label: "Invoice", printedLineId: "t", matches: true, rows: ["fee"], references: [],
  sections: [{ id: "mob", kind: "section", label: "Mobile", period: "September", printedLineId: "s", matches: true,
    rows: ["a", "b"], references: ["r"], sections: [] }] }];
const LINES = [c("fee"), c("a"), c("b"), c("s"), c("t"), c("r", { reference: { text: "Repeats Mobile" }, structureVerified: false }),
  { id: "manual-1", structureVerified: false }];

test("a section that adds up is collapsed and its rows are not repeated elsewhere", () => {
  const rows = lineTreeRows(LINES, TREE);
  assert.deepEqual(rows.map((row) => [row.type, row.id, row.depth]), [
    ["line", "whole-fee", 0], ["section", "mob", 0], ["line", "whole-t", 0], ["invoice", "inv", 0],
    ["group", "references", 0], ["group", "other", 0], ["line", "manual-1", 0]]);
  assert.equal(rows[1].status, "ok");
  assert.equal(rows[1].collapsed, true);
  assert.equal(rows[3].label, "What you pay");
});

test("opening a section shows its breakdown indented, ending with its printed subtotal", () => {
  const rows = lineTreeRows(LINES, TREE, new Map([["mob", false]]));
  const inside = rows.slice(2, 5);
  assert.deepEqual(inside.map((row) => [row.id, row.depth, row.breakdown]), [["whole-a", 1, true], ["whole-b", 1, true], ["whole-s", 1, true]]);
});

test("editing a line withdraws Python's tick and keeps the section open", () => {
  const edited = LINES.map((line) => line.gid === "a" ? { ...line, structureVerified: false, edited: true } : line);
  const section = lineTreeRows(edited, TREE).find((row) => row.id === "mob");
  assert.deepEqual([section.status, section.collapsed], ["changed", false]);
});

test("a section that does not add up is open and marked", () => {
  const tree = [{ ...TREE[0], sections: [{ ...TREE[0].sections[0], matches: false }] }];
  const section = lineTreeRows(LINES, tree).find((row) => row.id === "mob");
  assert.deepEqual([section.status, section.collapsed], ["mismatch", false]);
});

test("references are listed once, inside their own group, only when opened", () => {
  const closed = lineTreeRows(LINES, TREE);
  assert.equal(closed.filter((row) => row.id === "whole-r").length, 0);
  const open = lineTreeRows(LINES, TREE, new Map([["references", false]]));
  assert.equal(open.filter((row) => row.id === "whole-r").length, 1);
});

test("without a tree every line is a plain row", () => {
  assert.deepEqual(lineTreeRows([{ id: "x" }], null), [{ type: "line", id: "x", depth: 0, breakdown: false }]);
});

test("a total that adds up while a section inside does not is not called 'changed'", () => {
  const tree = [{ ...TREE[0], sections: [{ ...TREE[0].sections[0], matches: false }] }];
  const lines = LINES.map((line) => ({ ...line, structureVerified: false }));
  assert.equal(lineTreeRows(lines, tree).find((row) => row.type === "invoice").status, "inner");
});

test("lines the reader saw without a type are folded away as 'not counted'; the person's own lines stay visible", () => {
  const lines = [...LINES, c("vat", { role: "", structureVerified: false })];
  const closed = lineTreeRows(lines, TREE);
  const group = closed.find((row) => row.id === "info");
  assert.deepEqual([group.count, group.collapsed], [1, true]);
  assert.equal(closed.some((row) => row.id === "whole-vat"), false);
  assert.ok(closed.some((row) => row.id === "manual-1"));
  assert.ok(lineTreeRows(lines, TREE, new Map([["info", false]])).some((row) => row.id === "whole-vat"));
});

test("rows and sections follow the order printed on the bill", () => {
  // Like the Anthropic invoice: the section (Claude Pro) is printed before the VAT line that sits under the bill.
  const tree = [{ ...TREE[0], rows: ["vat"], sections: [{ ...TREE[0].sections[0], rows: ["a", "b"], references: [] }] }];
  const lines = [c("a"), c("b"), c("s"), c("vat"), c("t")];
  const order = lineTreeRows(lines, tree).map((row) => row.id);
  assert.ok(order.indexOf("mob") < order.indexOf("whole-vat"));
});

test("a one-cent gap reads as rounding; after a rounding line is added Python checks it again", () => {
  const tree = [{ ...TREE[0], matches: false, rounding: true, sections: [] }];
  assert.equal(lineTreeRows(LINES, tree).find((row) => row.type === "invoice").status, "rounding");
  const withFix = [...LINES, { id: "rounding-1", roundingFor: "t", role: "adjustment" }];
  assert.equal(lineTreeRows(withFix, tree).find((row) => row.type === "invoice").status, "changed");
  const real = [{ ...TREE[0], matches: false, sections: [] }];
  assert.equal(lineTreeRows(LINES, real).find((row) => row.type === "invoice").status, "mismatch");
});

import { splitPeriod } from "../line-tree.mjs";

test("a period in brackets is shown smaller under the line title; the label is not changed", () => {
  assert.deepEqual(splitPeriod("30 GB mobile plan (6-31 August)"), { title: "30 GB mobile plan", period: "6-31 August" });
  assert.deepEqual(splitPeriod("Supply"), { title: "Supply", period: "" });
  assert.deepEqual(splitPeriod("VAT (21%) on fees"), { title: "VAT (21%) on fees", period: "" });
});

test("a part's total that is shown, not counted, explains its gap under the part's header", () => {
  const tree = [{ ...TREE[0], label: "Gas", matches: false, rounding: true, sections: [] },
                { ...TREE[0], id: "inv2", label: "Electricity", printedLineId: "t2", rows: [], sections: [] }];
  const lines = [...LINES.map((line) => line.gid === "t" ? { ...line, reference: { text: "Total of Gas" }, gapHint: "a 0.01 rounding difference" } : line), c("t2")];
  const header = lineTreeRows(lines, tree).find((row) => row.id === "inv");
  assert.deepEqual([header.status, header.hint], ["rounding", "a 0.01 rounding difference"]);
});

test("with several parts each part's total closes its own lines, and a rounding line sits inside its part", () => {
  const tree = [{ ...TREE[0], id: "elec", label: "Electricity", printedLineId: "t", rows: ["a"], sections: [], matches: false, rounding: true },
                { ...TREE[0], id: "gas", label: "Gas", printedLineId: "t2", rows: ["b"], sections: [] }];
  const lines = [c("a"), c("t"), c("b"), c("t2"), { id: "rounding-1", roundingFor: "t", role: "adjustment" }];
  const rows = lineTreeRows(lines, tree);
  assert.deepEqual(rows.map((row) => row.id), ["whole-a", "rounding-1", "whole-t", "elec", "whole-b", "whole-t2", "gas"]);
  assert.equal(rows.find((row) => row.id === "elec").part, true);
  assert.equal(rows.some((row) => row.id === "other"), false);
});

test("a section whose lines were all removed disappears, and its part reads as changed", () => {
  const tree = [{ ...TREE[0], matches: false }];
  const lines = LINES.filter((line) => !["a", "b", "s"].includes(line.gid));
  const rows = lineTreeRows(lines, tree);
  assert.equal(rows.some((row) => row.id === "mob"), false);
  assert.equal(rows.find((row) => row.type === "invoice").status, "changed");
});
