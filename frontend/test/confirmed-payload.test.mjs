import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { confirmedLine } from "../extraction/contracts.mjs";
import { buildServerPayload } from "../extraction/privacy.mjs";

const fixtureDir = new URL("../../tests/fixtures/confirmed/", import.meta.url);
const region = { x0: 0.1, top: 0.4, x1: 0.9, bottom: 0.7 };
const base = {
  id: "fee",
  role: "charge",
  description: "Convenience fee",
  rawAmount: "₹650",
  extractedRawAmount: "₹650",
  extractor: "groq",
  currency: "INR",
  confirmed: true,
};

test("the browser builder reproduces all four confirmed Python fixtures exactly", () => {
  const names = readdirSync(fixtureDir).filter((name) => name.endsWith(".confirmed.json")).sort();
  assert.equal(names.length, 4);
  for (const name of names) {
    const fixture = JSON.parse(readFileSync(new URL(name, fixtureDir), "utf8"));
    const rebuilt = buildServerPayload({
      ...fixture,
      lines: fixture.lines.map((line) => ({ ...line, confirmed: true })),
    });
    assert.deepEqual(JSON.parse(JSON.stringify(rebuilt)), fixture, name);
  }
});

test("D-024: table-area evidence can be confirmed without an exact box", () => {
  const line = confirmedLine({ ...base, source: { page: 1, precision: "table", locatedBy: "groq", region } });
  assert.equal(line.source.precision, "table");
  assert.deepEqual(line.source.region, region);
  assert.equal("bounds" in line.source, false);
});

test("D-024: page-level evidence can be confirmed and carries no coordinates", () => {
  const line = confirmedLine({ ...base, extractor: "manual", extractedRawAmount: null, source: { page: 2, precision: "page" } });
  assert.deepEqual(line.source, { page: 2, precision: "page" });
  assert.throws(() => confirmedLine({ ...base, source: { page: 2, precision: "page", bounds: region } }), /coordinates/);
});

test("a table area can never be presented as an exact amount location", () => {
  assert.throws(() => confirmedLine({ ...base, source: { page: 1, precision: "table", locatedBy: "groq", bounds: region, region } }), /exact bounds/);
  assert.throws(() => confirmedLine({ ...base, source: { page: 1, precision: "exact", locatedBy: "groq", region } }), /table region/);
  assert.throws(() => confirmedLine({ ...base, source: { page: 1, precision: "exact", locatedBy: "groq" } }), /bounds/);
  assert.throws(() => confirmedLine({ ...base, source: { page: 1 } }), /precision/);
});

test("every confirmed line needs an explicit role", () => {
  const source = { page: 1, precision: "page" };
  assert.throws(() => confirmedLine({ ...base, role: "", source }), /charge, discount, adjustment, subtotal or total/);
  assert.throws(() => confirmedLine({ ...base, role: "subtotal", source }), /needs a group/);
  assert.throws(() => confirmedLine({ ...base, role: "total", questioned: true, source }), /only charges or discounts/);
});

test("decimal mark and message type must be explicit known values", () => {
  const line = { ...base, source: { page: 1, precision: "page" } };
  assert.throws(() => buildServerPayload({ currency: "INR", decimalSeparator: "", lines: [line] }), /decimal mark/);
  assert.throws(() => buildServerPayload({ currency: "INR", messageType: "complaint", lines: [line] }), /message type/);
});

test("duplicate line IDs are rejected", () => {
  const line = { ...base, source: { page: 1, precision: "page" } };
  assert.throws(() => buildServerPayload({ currency: "INR", lines: [line, line] }), /twice/);
});

test("row columns travel as printed strings, only on charge lines", () => {
  const source = { page: 1, precision: "page" };
  const line = confirmedLine({ ...base, source, breakdown: { quantity: "1", unitPrice: "1,499.00", discount: "-200,00", taxableValue: "", taxes: ["", "21.00"] } });
  assert.deepEqual(line.breakdown, { quantity: "1", unitPrice: "1,499.00", discount: "-200,00", taxableValue: null, taxes: ["21.00"] });
  assert.equal("breakdown" in confirmedLine({ ...base, source, breakdown: { quantity: " ", taxes: [] } }), false);
  assert.equal(confirmedLine({ ...base, role: "total", source, breakdown: { unitPrice: "5" } }).breakdown, undefined);
  assert.ok(confirmedLine({ ...base, role: "discount", rawAmount: "-5,00", source, breakdown: { quantity: "1", unitPrice: "5,00" } }).breakdown);
  const payload = buildServerPayload({ currency: "INR", printedFiguresRechecked: true, lines: [{ ...base, role: "adjustment", rawAmount: "-0.40", source }] });
  assert.equal(payload.printedFiguresRechecked, true);
  assert.equal(payload.lines[0].role, "adjustment");
});
