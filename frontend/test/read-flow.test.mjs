import test from "node:test";
import assert from "node:assert/strict";
import { READING_STAGES, readingProgress, readingInstruction } from "../read-flow.mjs";

test("reading flow has five sequential steps and exactly one current step", () => {
  for (const [index, stage] of READING_STAGES.entries()) {
    const steps = readingProgress(stage);
    assert.equal(steps.length, 5);
    assert.equal(steps.filter(step => step.state === "current").length, 1);
    assert.equal(steps.filter(step => step.state === "done").length, index);
    assert.equal(steps[index].state, "current");
  }
});

test("instructions identify selected page, approval boundary and preserved earlier lines", () => {
  assert.match(readingInstruction("select", 2), /Page 2/);
  assert.match(readingInstruction("preview"), /Nothing is sent until you approve/);
  assert.match(readingInstruction("review"), /earlier lines are kept/);
  assert.match(readingInstruction("reading"), /not send it again automatically/);
});

test("unknown reading states and invalid pages are rejected", () => {
  assert.throws(() => readingProgress("finished"));
  assert.throws(() => readingInstruction("select", 0));
});
