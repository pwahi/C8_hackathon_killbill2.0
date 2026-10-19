import { confirmedLine } from "./contracts.mjs";

const PRIVATE_PATTERNS = [
  /\b(?:\d[ -]?){13,19}\b/, // card-like sequence
  // Identifier words only when they introduce a number ("customer number", "account 1234"); on their own they are
  // ordinary bill words ("Customer benefit", "30 GB mobile plan"). "address" always blocks. Same rule in review.py.
  /\baddress\b|\b(?:account|customer|booking|reference|phone|mobile)\s*(?:number|no\.?|nr\.?|id|code)\b|\b(?:account|customer|booking|reference|phone|mobile)\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}/i,
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i, // IBAN-like sequence
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
];
const MESSAGE_TYPES = new Set(["automatic", "quote_difference", "fee_disclosure", "period_clarification", "checks_passed_summary"]);

export function containsPossiblePrivateData(text) {
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(String(text)));
}

// Schema 2: confirmed lines with role, group and honest source precision. No file bytes or OCR text.
export function buildServerPayload({ currency, decimalSeparator = ".", expectedAmount, messageType = "automatic", earlierPeriodGroup = null, printedFiguresRechecked = false, lines }) {
  const safeLines = lines.map(confirmedLine);
  const normalizedCurrency = String(currency).toUpperCase();
  if (![".", ","].includes(decimalSeparator)) throw new Error("choose the bill's decimal mark");
  if (!MESSAGE_TYPES.has(messageType)) throw new Error("unknown message type");
  const ids = new Set();
  for (const line of safeLines) {
    if (ids.has(line.id)) throw new Error(`line ${line.id} appears twice`);
    ids.add(line.id);
    if (line.currency !== normalizedCurrency) {
      throw new Error(`line ${line.id} currency differs from review currency`);
    }
    for (const text of [line.description, line.group || ""]) {
      if (containsPossiblePrivateData(text)) throw new Error(`line ${line.id} may contain private data`);
    }
  }
  const expected = expectedAmount == null ? "" : String(expectedAmount).trim();
  const earlier = earlierPeriodGroup == null ? "" : String(earlierPeriodGroup).trim();
  return Object.freeze({
    schemaVersion: 2,
    currency: normalizedCurrency,
    decimalSeparator,
    expectedAmount: expected || null,
    messageType,
    earlierPeriodGroup: earlier || null,
    lines: safeLines.map((line) => ({ ...line, source: { ...line.source }, ...(line.breakdown ? { breakdown: { ...line.breakdown, taxes: [...line.breakdown.taxes] } } : {}) })),
    printedFiguresRechecked: printedFiguresRechecked === true,
  });
}
