import test from "node:test";
import assert from "node:assert/strict";
import { locateAmounts } from "../extraction/locate.mjs";

const box = (top) => ({ x0: 0.8, top, x1: 0.9, bottom: top + 0.01 });
const TOKENS = [
  { page: 1, text: "€ 33,75", bounds: box(0.2) },
  { page: 1, text: "2,50", bounds: box(0.5) },
  { page: 1, text: "2,50", bounds: box(0.6) },
  { page: 1, text: "-4,19", bounds: box(0.4) },
  { page: 2, text: "31,25", bounds: box(0.3) },
];

test("each amount is matched to its printed position; repeated amounts are paired top to bottom", () => {
  const found = locateAmounts([
    { id: "total", page: 1, rawAmount: "33,75" },
    { id: "discount", page: 1, rawAmount: "- 4,19" },
    { id: "extra", page: 1, rawAmount: "2,50" },
    { id: "sub", page: 1, rawAmount: "€2,50" },
  ], TOKENS);
  assert.deepEqual(found.get("total"), box(0.2));
  assert.deepEqual(found.get("discount"), box(0.4));
  assert.deepEqual([found.get("extra"), found.get("sub")], [box(0.5), box(0.6)]);
});

test("an amount is not located when the count does not match or it is on another page", () => {
  const found = locateAmounts([
    { id: "once", page: 1, rawAmount: "2,50" },   // printed twice, read once: ambiguous
    { id: "elsewhere", page: 1, rawAmount: "31,25" },
    { id: "empty", page: 1, rawAmount: "" },
  ], TOKENS);
  assert.equal(found.size, 0);
});
