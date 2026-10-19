const CURRENCIES = new Set(["EUR", "INR"]);
export const ROLES = Object.freeze(["charge", "discount", "adjustment", "subtotal", "total"]);
export const PRECISIONS = Object.freeze(["exact", "table", "page"]);
const EXTRACTORS = new Set(["pdf_text", "local_ocr", "groq", "manual"]);
const LOCATORS = new Set(["pdf_text", "local_ocr", "groq", "user"]);

export function assertBounds(bounds) {
  const values = [bounds?.x0, bounds?.top, bounds?.x1, bounds?.bottom];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("bounds must contain normalized numbers between 0 and 1");
  }
  if (bounds.x1 <= bounds.x0 || bounds.bottom <= bounds.top) {
    throw new Error("bounds must have positive width and height");
  }
  return Object.freeze({ x0: bounds.x0, top: bounds.top, x1: bounds.x1, bottom: bounds.bottom });
}

// D-024: evidence is exact (box around this amount), table (area it was read from) or page.
// A table area lives in `region` and is never presented as the amount's own `bounds`.
export function sourceEvidence({ page, precision, locatedBy, bounds, region }) {
  if (!Number.isInteger(page) || page < 1) throw new Error("invalid page");
  if (!PRECISIONS.includes(precision)) throw new Error("source precision must be exact, table or page");
  if (precision === "exact") {
    if (region) throw new Error("exact evidence cannot carry a table region");
    if (!LOCATORS.has(locatedBy)) throw new Error("exact evidence needs a locator");
    return Object.freeze({ page, precision, locatedBy, bounds: assertBounds(bounds) });
  }
  if (precision === "table") {
    if (bounds) throw new Error("table evidence cannot carry exact bounds");
    if (!LOCATORS.has(locatedBy)) throw new Error("table evidence needs a locator");
    return Object.freeze({ page, precision, locatedBy, region: assertBounds(region) });
  }
  if (bounds || region) throw new Error("page evidence cannot carry coordinates");
  return Object.freeze({ page, precision });
}

// Printed row columns (all optional). Strings stay exactly as printed; Python parses and checks them.
export function rowBreakdown(input) {
  if (!input) return null;
  const text = (value) => (value == null ? null : String(value).trim() || null);
  const taxes = (Array.isArray(input.taxes) ? input.taxes : []).map(text).filter(Boolean).slice(0, 4);
  const breakdown = {
    quantity: text(input.quantity),
    unitPrice: text(input.unitPrice),
    discount: text(input.discount),
    taxableValue: text(input.taxableValue),
    taxes,
  };
  return Object.values(breakdown).some((value) => (Array.isArray(value) ? value.length : value)) ? Object.freeze(breakdown) : null;
}

export function confirmedLine(input) {
  if (!input.confirmed) throw new Error("line must be confirmed by the user");
  const label = String(input.description || "").trim();
  if (!input.id || !label || !String(input.rawAmount || "").trim()) {
    throw new Error(`line ${label || input.id}: confirmed line requires an amount and a label`);
  }
  if (!ROLES.includes(input.role)) throw new Error(`line "${label}": choose whether it is a charge, discount, adjustment, subtotal or total`);
  const currency = String(input.currency || "").toUpperCase();
  if (!CURRENCIES.has(currency)) throw new Error("unsupported currency");
  if (!EXTRACTORS.has(input.extractor)) throw new Error("unknown extractor");
  const group = String(input.group || "").trim();
  if (input.role === "subtotal" && !group) throw new Error(`subtotal "${label}" needs a group naming the lines it covers`);
  if (input.questioned && !["charge", "discount"].includes(input.role)) {
    throw new Error(`"${label}": only charges or discounts can be asked about`);
  }
  const breakdown = rowBreakdown(input.breakdown);
  if (breakdown && input.role !== "charge") throw new Error(`"${label}": row details belong to a charge line`);
  return Object.freeze({
    id: String(input.id),
    role: input.role,
    group: group || null,
    description: label,
    rawAmount: String(input.rawAmount).trim(),
    extractedRawAmount: input.extractedRawAmount == null ? null : String(input.extractedRawAmount).trim(),
    extractor: input.extractor,
    questioned: Boolean(input.questioned),
    currency,
    source: sourceEvidence(input.source || {}),
    ...(breakdown ? { breakdown } : {}),
  });
}
