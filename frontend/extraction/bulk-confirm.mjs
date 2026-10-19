import { confirmedLine } from "./contracts.mjs";
import { containsPossiblePrivateData } from "./privacy.mjs";

const ROLES = new Set(["charge", "discount", "adjustment", "subtotal", "total"]);
const SIGNED = /^\s*(?:[-−(]|(?:EUR|INR|€|₹)\s*[-−])/iu;
// Mirrors Python's label rule: a currency word alone is fine; an amount in a label is not.
const AMOUNT_IN_LABEL = /[€₹$]\s*\d|\d\s*[€₹$]|\b(?:EUR|INR|Rs)\.?\s*\d|\d\s*(?:EUR|INR|Rs)\b|\d[.,]\d|\d{3,}/iu;
const YEAR = /\b(?:19|20)\d{2}\b/gu;

function hasAmount(text) {
  return AMOUNT_IN_LABEL.test(String(text || "").replace(YEAR, ""));
}

// Pre-fill from a model suggestion. Never changes the amount or adds a sign; only explains what to check.
export function visionSuggestion(line) {
  const notes = [];
  let role = ROLES.has(line.role) ? line.role : "";
  if (line.role === "other") notes.push("Groq thinks this is not a bill amount, so it is left unticked.");
  if (role === "discount" && !SIGNED.test(String(line.raw_amount || ""))) {
    notes.push("Suggested as a discount, but the amount has no minus sign. If it reduces the bill, type a minus sign yourself.");
  }
  if (role === "subtotal" && !line.group) {
    notes.push("Suggested as a subtotal without a group. Add the group it covers, or change the role.");
  }
  return { role, group: typeof line.group === "string" ? line.group : "", notes };
}

export function toContractInput(candidate, currency) {
  return {
    id: candidate.id,
    role: candidate.role,
    group: candidate.group,
    description: candidate.description,
    rawAmount: candidate.rawAmount,
    extractedRawAmount: candidate.extractedRawAmount,
    extractor: candidate.extractor,
    questioned: candidate.questioned,
    currency: candidate.currency || currency,
    source: { page: candidate.page, precision: candidate.precision, locatedBy: candidate.locatedBy, bounds: candidate.bounds, region: candidate.region },
    breakdown: candidate.breakdown || null,
    confirmed: true,
  };
}

// Plain-language reason a line cannot be confirmed in bulk, or null when it is ready.
export function readiness(candidate, currency) {
  if (!String(candidate.rawAmount || "").trim()) return "Amount is empty.";
  if (!String(candidate.description || "").trim()) return "Label is empty.";
  if (!candidate.role) return "Choose a role (charge, discount, adjustment, subtotal or total).";
  if (candidate.role === "discount" && !SIGNED.test(candidate.rawAmount)) return "Discount needs a minus sign, for example -200.00.";
  if (candidate.role === "charge" && SIGNED.test(candidate.rawAmount)) return "Charge has a minus sign; choose Discount if it reduces the bill.";
  if (containsPossiblePrivateData(candidate.description) || containsPossiblePrivateData(candidate.group || "")) {
    return "Label may contain private details (for example an account or a phone number). Use a shorter label.";
  }
  if (hasAmount(candidate.description) || hasAmount(candidate.group)) {
    return "Label contains an amount. Use words only, for example 'Delivery fee' (the amount goes in the amount box).";
  }
  if (String(candidate.currency || currency).toUpperCase() !== String(currency).toUpperCase()) {
    return "Currency differs from the review currency at the top.";
  }
  try {
    confirmedLine(toContractInput(candidate, currency));
  } catch (error) {
    return error.message;
  }
  return null;
}

// Selection bookkeeping only. Ready means structurally complete, not correct money.
// Reference lines (a summary or total printed again elsewhere) are information, not lines to confirm.
export function allReadyState(candidates, currency) {
  candidates = candidates.filter(candidate => !candidate.reference);
  const ready = candidates.filter(candidate => readiness(candidate, currency) === null);
  const selected = ready.filter(candidate => candidate.confirmed).length;
  return {ready: ready.length, blocked: candidates.length - ready.length, selected,
    checked: ready.length > 0 && selected === ready.length,
    indeterminate: selected > 0 && selected < ready.length,
    disabled: !ready.length && !candidates.some(candidate => candidate.confirmed)};
}

export function confirmReadyLines(candidates, currency, checked) {
  return candidates.map(candidate => {
    if (candidate.reference) return candidate;
    const reason = checked ? readiness(candidate, currency) : null;
    return {...candidate, confirmed: !!checked && !reason, attention: reason ? `Not confirmed: ${reason}` : null};
  });
}

const QUANTITY_WITH_UNIT = /^\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*([A-Za-z]{1,6}\.?)?\s*$/u;
const PLAIN_AMOUNT = /^\s*[-−(]?\s*(?:EUR|INR|€|₹)?\s*[-−]?\s*\d[\d.,\s]*\)?\s*(?:EUR|INR|€|₹)?\s*$/iu;

// Tidy model-filled row columns before they are shown. Only unit words and percentage rates are removed;
// digits and decimal marks are never changed. Anything else odd stays visible with a note.
export function cleanVisionColumns(columns) {
  const notes = [];
  const quantityText = String(columns.quantity ?? "").trim();
  let quantity = quantityText;
  const match = QUANTITY_WITH_UNIT.exec(quantityText);
  if (quantityText && match) {
    quantity = match[1];
    if (match[2]) notes.push(`Unit "${match[2]}" removed from the quantity.`);
  } else if (quantityText) {
    notes.push(`Check the quantity "${quantityText}": it should be a number.`);
  }
  const amount = (name, value) => {
    const text = String(value ?? "").trim();
    if (text && !PLAIN_AMOUNT.test(text)) notes.push(`Check ${name} "${text}": it should be an amount only.`);
    return text;
  };
  const taxes = [];
  for (const raw of columns.taxes || []) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    if (text.includes("%")) { notes.push(`"${text}" looks like a tax rate, not a tax amount, so it was left out.`); continue; }
    taxes.push(amount("tax", text));
  }
  return {
    columns: {
      quantity,
      unitPrice: amount("unit price", columns.unitPrice),
      discount: amount("discount", columns.discount),
      taxableValue: amount("taxable value", columns.taxableValue),
      taxes,
    },
    notes,
  };
}

// Same grouping rules as Python (review.py), so the browser only rewrites what Python reads the same way.
const DOT_FORMAT = /^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3}|\d+)(?:\.\d{1,2})?$/u;
const COMMA_FORMAT = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/u;
const SINGLE_DECIMAL = /^\d+([.,])\d{1,2}$/u;

// Show a model-read amount without currency marks and in the chosen decimal format.
// Returns { text, note }. Ambiguous values are returned unchanged with a note; digits never change.
export function formatAmount(raw, decimalSeparator) {
  const original = String(raw ?? "").trim();
  if (!original) return { text: "", note: null };
  let text = original.replace(/\u2212/gu, "-").replace(/\s+/gu, "");
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) { negative = true; text = text.slice(1, -1); }
  if (text.startsWith("-")) { negative = !negative; text = text.slice(1); }
  text = text.replace(/^(?:EUR|INR|Rs\.?|€|₹)/iu, "").replace(/(?:EUR|INR|€|₹)$/iu, "");
  if (text.startsWith("-") && !negative) { negative = true; text = text.slice(1); }
  let used = null;
  if ((decimalSeparator === "." ? DOT_FORMAT : COMMA_FORMAT).test(text)) used = decimalSeparator;
  else if (SINGLE_DECIMAL.test(text)) used = SINGLE_DECIMAL.exec(text)[1];
  else {
    // Fully in the other format *with* a decimal part (e.g. "1,499.00" when Comma is chosen) is unambiguous.
    const other = decimalSeparator === "." ? "," : ".";
    const otherFormat = other === "." ? DOT_FORMAT : COMMA_FORMAT;
    const tail = text.length - text.lastIndexOf(other) - 1;
    if (otherFormat.test(text) && text.includes(other) && tail >= 1 && tail <= 2) used = other;
  }
  if (!used) return { text: original, note: `Check the decimal mark in "${original}": it does not match the chosen format.` };
  const [whole, fraction] = text.split(used);
  const digits = whole.replace(/[.,]/gu, "");
  const formatted = `${negative ? "-" : ""}${digits}${fraction === undefined ? "" : decimalSeparator + fraction}`;
  return { text: formatted, note: null };
}
