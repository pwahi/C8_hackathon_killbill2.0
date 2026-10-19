import test from "node:test";
import assert from "node:assert/strict";
import { applyTone } from "../tone.mjs";

// Same texts as tests/test_tone.py (the Python twin).
const DRAFT = "Hello, I expected to pay EUR 19.50, but the final amount was EUR 33.75, a difference of EUR 14.25.";
const EXPECTED = {
  neutral: DRAFT,
  warm: "Hello, I hope you are doing well. I expected to pay EUR 19.50, but the final amount was EUR 33.75, a difference of EUR 14.25. Thank you very much for your help, I appreciate it.",
  direct: "I expected to pay EUR 19.50, but the final amount was EUR 33.75, a difference of EUR 14.25. I would like a clear answer and, if a charge turns out to be incorrect, an adjustment. Please reply as soon as possible.",
};

test("tones change only the greeting and closing, never the amounts", () => {
  for (const [tone, text] of Object.entries(EXPECTED)) {
    assert.equal(applyTone(DRAFT, tone), text);
    assert.deepEqual(applyTone(DRAFT, tone).match(/\d+(?:[.,]\d+)?/g), DRAFT.match(/\d+(?:[.,]\d+)?/g));
  }
  assert.throws(() => applyTone(DRAFT, "angry"));
});
