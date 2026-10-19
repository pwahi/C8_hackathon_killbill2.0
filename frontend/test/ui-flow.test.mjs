import assert from "node:assert/strict";
import test from "node:test";
import { canVisit, requireExpectedAmount } from "../ui-flow.mjs";

test("comparison entry requires an expectation; unknown is never replaced with zero", () => {
  for (const value of [null, undefined, "", "  ", "\n\t"]) {
    assert.throws(() => requireExpectedAmount(value), /Enter what you expected/);
  }
});

test("required expectation preserves zero and printed decimal strings without calculations", () => {
  for (const amount of ["0", "19,50", "1,299.00", "1.299,00"]) {
    assert.equal(requireExpectedAmount(` ${amount} `), amount);
  }
});

test("results and message cannot be opened before a completed check", () => {
  assert.equal(canVisit(0, { opened: false }), true);
  assert.equal(canVisit(1, { opened: false }), false);
  assert.equal(canVisit(1, { opened: true }), true);
  assert.equal(canVisit(2, { opened: false }), false);
  assert.equal(canVisit(2, { opened: true }), true);
  for (const step of [3, 4]) {
    assert.equal(canVisit(step, { opened: true, complete: false }), false);
    assert.equal(canVisit(step, { opened: true, complete: true, busy: true }), false);
    assert.equal(canVisit(step, { opened: true, complete: true, busy: false }), true);
  }
});

test("invalid navigation is rejected", () => {
  for (const step of [-1, 5, 2.5]) assert.equal(canVisit(step, { opened: true, complete: true }), false);
});

import { STEPS, STEP_GUIDANCE, stepLabel } from "../ui-flow.mjs";

test("every chapter says where you are and what to do now", () => {
  assert.equal(STEP_GUIDANCE.length, STEPS.length);
  assert.equal(stepLabel(1), "CHAPTER 2/5");
  assert.match(STEP_GUIDANCE[1], /Choose the pages/);
  assert.match(STEP_GUIDANCE[4], /send it to the company yourself/);
});
