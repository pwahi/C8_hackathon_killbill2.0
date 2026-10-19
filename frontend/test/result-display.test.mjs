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
