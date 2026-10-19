import assert from "node:assert/strict";
import test from "node:test";

import { cleanVisionColumns, formatAmount, readiness, visionSuggestion, allReadyState, confirmReadyLines } from "../extraction/bulk-confirm.mjs";

const region = { x0: 0.1, top: 0.3, x1: 0.9, bottom: 0.7 };
const ready = {
  id: "groq-1", role: "charge", group: "", description: "Convenience fee", rawAmount: "₹650", extractedRawAmount: "₹650",
  extractor: "groq", questioned: false, currency: "INR", page: 1, precision: "table", locatedBy: "groq", bounds: null, region,
};

test("accept-all confirms ready lines only, without changing values or section acceptance", () => {
  const good = {...ready, sectionAcceptedKey:"unchanged"};
  const incomplete = {...ready,id:"bad",role:"",confirmed:true};
  const result = confirmReadyLines([good,incomplete],"INR",true);
  assert.equal(result[0].confirmed,true);
  assert.equal(result[0].rawAmount,good.rawAmount);
  assert.equal(result[0].sectionAcceptedKey,"unchanged");
  assert.equal(result[1].confirmed,false);
  assert.match(result[1].attention,/role/);
  assert.equal(good.confirmed,undefined);
});

test("accept-all reflects empty, partial, all-ready and blocked states", () => {
  assert.equal(allReadyState([],"INR").disabled,true);
  const rows = [{...ready,id:"a",confirmed:true},{...ready,id:"b",confirmed:false}];
  assert.equal(allReadyState(rows,"INR").indeterminate,true);
  const selected=confirmReadyLines([...rows,{...ready,id:"c",rawAmount:""}],"INR",true);
  const state=allReadyState(selected,"INR");
  assert.equal(state.checked,true);
  assert.equal(state.blocked,1);
  assert.equal(state.selected,2);
});

test("unchecking accept-all clears acceptance without deleting rows or changing values", () => {
  const result=confirmReadyLines([{...ready,confirmed:true}],"INR",false);
  assert.equal(result.length,1);
  assert.equal(result[0].confirmed,false);
  assert.equal(result[0].rawAmount,ready.rawAmount);
  assert.equal(allReadyState(result,"INR").checked,false);
});

test("a fully pre-filled table-level line is ready for Confirm all", () => {
  assert.equal(readiness(ready, "INR"), null);
});

test("missing role, label or amount keeps a line unticked with a plain reason", () => {
  assert.match(readiness({ ...ready, role: "" }, "INR"), /Choose a role/);
  assert.match(readiness({ ...ready, description: " " }, "INR"), /Label is empty/);
  assert.match(readiness({ ...ready, rawAmount: "" }, "INR"), /Amount is empty/);
});

test("sign rules are checked, never repaired", () => {
  assert.match(readiness({ ...ready, role: "discount", rawAmount: "200.00" }, "INR"), /minus sign/);
  assert.equal(readiness({ ...ready, role: "discount", rawAmount: "-200.00" }, "INR"), null);
  assert.equal(readiness({ ...ready, role: "discount", rawAmount: "₹ -200" }, "INR"), null);
  assert.match(readiness({ ...ready, rawAmount: "-650" }, "INR"), /choose Discount/);
});

test("private-looking labels and other currencies are not bulk-confirmed", () => {
  assert.match(readiness({ ...ready, description: "Mobile subscription" }, "INR"), /private/);
  assert.match(readiness({ ...ready, currency: "EUR" }, "INR"), /Currency/);
});

test("a currency word alone is fine in a label, an amount is not", () => {
  assert.equal(readiness({ ...ready, role: "total", description: "TOTAL EUR" }, "INR"), null);
  assert.match(readiness({ ...ready, description: "Fee 59.90" }, "INR"), /contains an amount/);
  assert.match(readiness({ ...ready, description: "Fee INR 5" }, "INR"), /contains an amount/);
  assert.equal(readiness({ ...ready, description: "Fee September 2026" }, "INR"), null);
});

test("a subtotal without a group is not ready", () => {
  assert.match(readiness({ ...ready, role: "subtotal" }, "INR"), /group/);
});

test("vision role suggestions pre-fill but never change the amount", () => {
  assert.deepEqual(visionSuggestion({ role: "total", raw_amount: "₹22,434", group: null }), { role: "total", group: "", notes: [] });
  const other = visionSuggestion({ role: "other", raw_amount: "120" });
  assert.equal(other.role, "");
  assert.match(other.notes[0], /not a bill amount/);
  const unsigned = visionSuggestion({ role: "discount", raw_amount: "200.00" });
  assert.equal(unsigned.role, "discount");
  assert.match(unsigned.notes[0], /no minus sign/);
  assert.equal(visionSuggestion({ role: "surcharge", raw_amount: "5" }).role, "");
});

test("row columns from the model are tidied without changing any digit", () => {
  const { columns, notes } = cleanVisionColumns({ quantity: "1 PC", unitPrice: "1,499.00", discount: "-200,00", taxableValue: null, taxes: ["21%", "₹426.12"] });
  assert.deepEqual(columns, { quantity: "1", unitPrice: "1,499.00", discount: "-200,00", taxableValue: "", taxes: ["₹426.12"] });
  assert.match(notes.join(" "), /Unit "PC" removed/);
  assert.match(notes.join(" "), /tax rate/);
});

test("unclear model values stay visible with a note instead of being repaired", () => {
  const { columns, notes } = cleanVisionColumns({ quantity: "one", unitPrice: "approx 19.90", taxes: [] });
  assert.equal(columns.quantity, "one");
  assert.equal(columns.unitPrice, "approx 19.90");
  assert.equal(notes.length, 2);
  assert.deepEqual(cleanVisionColumns({ quantity: "2", unitPrice: "€ 19,90", discount: "(5.00)", taxes: [] }).notes, []);
});

test("amounts are shown without currency marks in the chosen decimal format", () => {
  assert.equal(formatAmount("€31,25", ",").text, "31,25");
  assert.equal(formatAmount("31,25", ".").text, "31.25");
  assert.equal(formatAmount("1,499.00", ",").text, "1499,00");
  assert.equal(formatAmount("-200,00", ".").text, "-200.00");
  assert.equal(formatAmount("₹ 22,434", ".").text, "22434");
  assert.equal(formatAmount("- 4,19", ",").text, "-4,19");
  assert.equal(formatAmount("(5.00)", ".").text, "-5.00");
  assert.equal(formatAmount("1,57,757.00", ".").text, "157757.00");
});

test("ambiguous amounts stay as printed with a note", () => {
  const result = formatAmount("1,499", ",");
  assert.equal(result.text, "1,499");
  assert.match(result.note, /decimal mark/);
  assert.equal(formatAmount("1.378,80", ".").text, "1378.80");
  assert.match(formatAmount("12,345", ".").text, /^12345$/);
});
