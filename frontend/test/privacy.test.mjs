import assert from "node:assert/strict";
import test from "node:test";

import { confirmedLine } from "../extraction/contracts.mjs";
import { buildServerPayload, containsPossiblePrivateData } from "../extraction/privacy.mjs";

const safeLine = {
  id: "delivery",
  role: "charge",
  description: "Delivery",
  rawAmount: "59.90",
  extractedRawAmount: "59.90",
  extractor: "pdf_text",
  currency: "EUR",
  source: { page: 1, precision: "exact", locatedBy: "pdf_text", bounds: { x0: 0.1, top: 0.2, x1: 0.3, bottom: 0.25 } },
  confirmed: true,
};

test("only confirmed lines can enter the server payload", () => {
  assert.throws(() => confirmedLine({ ...safeLine, confirmed: false }), /confirmed/);
});

test("payload contains selected structured fields and no document bytes or raw OCR", () => {
  const payload = buildServerPayload({ currency: "EUR", expectedAmount: "1299.00", lines: [safeLine] });
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.lines[0].rawAmount, "59.90");
  assert.equal(payload.lines[0].source.page, 1);
  assert.equal("file" in payload, false);
  assert.equal("tokens" in payload, false);
  assert.equal("image" in payload, false);
  assert.equal("context" in payload.lines[0], false);
});

test("possible private identifiers are blocked", () => {
  assert.equal(containsPossiblePrivateData("Account number 123456789"), true);
  assert.equal(containsPossiblePrivateData("Delivery"), false);
  assert.throws(
    () => buildServerPayload({ currency: "EUR", lines: [{ ...safeLine, description: "Account 123456" }] }),
    /private data/,
  );
  assert.throws(
    () => buildServerPayload({ currency: "EUR", lines: [{ ...safeLine, group: "phone 0000000000" }] }),
    /private data/,
  );
});

test("invalid coordinates are rejected", () => {
  const bounds = { x0: 0.8, top: 0.2, x1: 0.2, bottom: 0.3 };
  assert.throws(() => confirmedLine({ ...safeLine, source: { ...safeLine.source, bounds } }), /positive/);
});

test("mixed currencies are blocked before transmission", () => {
  assert.throws(
    () => buildServerPayload({ currency: "EUR", lines: [{ ...safeLine, currency: "INR" }] }),
    /differs/,
  );
});
