import assert from "node:assert/strict";
import test from "node:test";
import { resultHeadline, mathRows } from "../result-display.mjs";

const result = {status: "complete", verdict: "unexplained", minor: {expected: 129900, difference: 7980},
  amounts: {calculatedTotal: "EUR 1378.80", printedTotal: "EUR 1378.80", expected: "EUR 1299.00", difference: "EUR 79.80"},
  lines: [{description: "Bike", role: "charge", amount: "EUR 1299.00"},
    {description: "Packaging", role: "charge", amount: "EUR 19.90"},
    {description: "Delivery", role: "charge", amount: "EUR 59.90"},
    {description: "Total", role: "total", amount: "EUR 1378.80"}]};

test("desktop headline copies Python difference without inventing an explanation", () => {
  assert.deepEqual(resultHeadline(result), {text: "Your bill adds up. Difference from what you expected:", amount: "EUR 79.80"});
  const negative = {...result, minor: {...result.minor, difference: -100}, amounts: {...result.amounts, difference: "EUR -1.00"}};
  assert.equal(resultHeadline(negative).amount, "EUR -1.00");
});

test("recheck and verified mismatch never get an adds-up headline", () => {
  for (const value of [{...result, status: "needs_recheck"}, {...result, verdict: "verified_mismatch"}]) {
    assert.equal(resultHeadline(value).amount, null);
    assert.match(resultHeadline(value).text, /do not add up|don’t add up/);
  }
  assert.equal(resultHeadline({...result, minor: {expected: 0, difference: 0}}).text, "Your bill adds up and matches what you expected.");
});

test("maths table copies code values; printed total isn't another charge", () => {
  const rows = mathRows(result);
  assert.equal(rows.filter(row => row.kind === "line").length, 3);
  assert.equal(rows.at(-1).value, result.amounts.difference);
  for (const row of rows) assert.ok([...result.lines.map(line => line.amount), ...Object.values(result.amounts)].includes(row.value));
  const unknown = {...result, amounts: {...result.amounts, expected: null, difference: null}};
  assert.equal(mathRows(unknown).some(row => row.kind === "expected" || row.kind === "difference"), false);
});

test("maths table does not add a summary Python marked reference-only", () => {
  const value = {...result, lines: [...result.lines, {description:"Section summary", role:"charge", amount:"EUR 1299.00", countedInTotal:false, summaryOf:"section_total"}]};
  assert.equal(mathRows(value).filter(row => row.kind === "line").length, 3);
  assert.equal(mathRows(value).some(row => row.label === "Section summary"), false);
});

test("maths table shows one row per section, then a single total when it matches the printed total", () => {
  const value = {...result, minor: {...result.minor, calculatedTotal: 137880, printedTotal: 137880},
    groups: [{label: "Bike", amount: "EUR 1299.00", lineIds: ["bike"]}],
    lines: [{id: "bike", description: "Bike", role: "charge", amount: "EUR 1299.00"},
      {id: "pack", description: "Packaging", role: "charge", amount: "EUR 19.90"},
      {id: "total", description: "Total", role: "total", amount: "EUR 1378.80"}]};
  const rows = mathRows(value);
  assert.deepEqual(rows.map(row => row.label), ["Bike", "Packaging", "Your bill total (matches the printed total ✓)", "You expected", "Difference from expectation"]);
});
