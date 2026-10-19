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

import { pagesToRead, readButtonText } from "../read-flow.mjs";

test("only the ticked pages are read, in page order", () => {
  assert.deepEqual(pagesToRead([3, 1, 2], new Set([2])), [1, 3]);
  assert.deepEqual(pagesToRead([1, 2]), [1, 2]);
});

test("the read button says how many pages will be sent", () => {
  assert.equal(readButtonText(3, 3), "Read all 3 pages");
  assert.equal(readButtonText(1, 1), "Read my bill");
  assert.equal(readButtonText(1, 3), "Read 1 page");
  assert.equal(readButtonText(2, 3), "Read 2 pages");
  assert.equal(readButtonText(0, 3), "Choose at least one page");
});

import { parsePageList, formatPageList } from "../read-flow.mjs";

test("pages can be typed as ranges or lists; anything unclear is refused, never guessed", () => {
  assert.deepEqual(parsePageList("1-2", [1, 2, 3]), { pages: [1, 2], error: null });
  assert.deepEqual(parsePageList(" 3, 1 ", [1, 2, 3]).pages, [1, 3]);
  assert.match(parsePageList("4", [1, 2, 3]).error, /pages 1-3 only/);
  assert.match(parsePageList("a", [1, 2]).error, /not a page number/);
  assert.match(parsePageList("", [1, 2]).error, /Type the pages/);
  assert.match(parsePageList("3-1", [1, 2, 3]).error, /low to high/);
  assert.equal(formatPageList([5, 1, 2, 3]), "1-3, 5");
});
