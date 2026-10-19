import assert from "node:assert/strict";
import test from "node:test";

import { nearbyText } from "../extraction/candidate-context.mjs";

test("shows nearby same-line text as a local review clue", () => {
  const candidate = { page: 1, bounds: { x0: 0.7, top: 0.2, x1: 0.8, bottom: 0.23 } };
  const tokens = [
    { page: 1, text: "Delivery fee", bounds: { x0: 0.35, top: 0.2, x1: 0.55, bottom: 0.23 } },
    { page: 1, text: "59.90", bounds: candidate.bounds },
    { page: 1, text: "Other row", bounds: { x0: 0.4, top: 0.4, x1: 0.55, bottom: 0.43 } },
    { page: 2, text: "Wrong page", bounds: { x0: 0.4, top: 0.2, x1: 0.55, bottom: 0.23 } },
  ];
  assert.equal(nearbyText(candidate, tokens), "Delivery fee 59.90");
});
