const MONEY = /(?<![\p{L}\d.,])(?:(?:EUR|INR|Rs\.?|€|₹)\s*)?[-+]?\s*(?:\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+[.,]\d{2}|\d+)(?![\p{L}\d.,])/giu;
const DATE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/gu;
const WHOLE_NUMBER = /^[-+]?\s*\d{1,6}$/u;
const MONEY_CONTEXT = /\b(?:amount|balance|charge|cost|discount|fee|grand total|price|subtotal|tax|total)\b|EUR|INR|Rs\.?|€|₹/iu;
const NON_PRICE = /\b(?:IBAN|BIC|SWIFT|bank\s*code|account|VAT\s*(?:no|number|id)|tax\s*(?:no|number|id)|registration|register|district court|phone|telephone|mobile|managing director|address|street|strasse|straße|sparkasse|koblenz)\b|\bwww\.|@/iu;

export function isNonPriceToken(token, tokens) {
  // Restrict context to the same column, so a bank column cannot hide a price elsewhere.
  const local = tokens.filter((other) => other.page === token.page)
    .filter((other) => Math.abs(centerY(other.bounds) - centerY(token.bounds)) <= 0.025)
    .filter((other) => other.bounds.x0 <= token.bounds.x1 && other.bounds.x1 >= token.bounds.x0 - 0.16)
    .map((other) => other.text).join(" ");
  return NON_PRICE.test(local);
}

function centerY(bounds) {
  return (bounds.top + bounds.bottom) / 2;
}

function sameLineText(token, tokens) {
  const center = centerY(token.bounds);
  return tokens
    .filter((other) => other.page === token.page)
    .filter((other) => Math.abs(centerY(other.bounds) - center) <= 0.018)
    .sort((left, right) => left.bounds.x0 - right.bounds.x0)
    .map((other) => other.text)
    .join(" ");
}

export function findAmountCandidates(tokens) {
  const results = [];
  for (const token of tokens) {
    if (isNonPriceToken(token, tokens)) continue;
    let matchedDirectly = false;
    const textWithoutDates = String(token.text).replace(DATE, (date) => " ".repeat(date.length));
    for (const match of textWithoutDates.matchAll(MONEY)) {
      const rawAmount = match[0].trim();
      if (!rawAmount || !/\d/.test(rawAmount)) continue;
      const explicitMoney = /EUR|INR|Rs\.?|€|₹|[.,]/iu.test(rawAmount);
      if (!explicitMoney && !MONEY_CONTEXT.test(sameLineText(token, tokens))) continue;
      if (!explicitMoney && /^(?:19|20)\d{2}$/u.test(rawAmount)) continue;
      matchedDirectly = true;
      results.push(Object.freeze({
        id: `${token.id}-a${results.length + 1}`,
        rawAmount,
        page: token.page,
        bounds: token.bounds,
        sourceTokenId: token.id,
        warning: token.confidence == null ? null : "OCR can miss decimal marks, confuse letters with digits, or read a currency sign as a number. Compare every digit with the highlighted source.",
        confirmed: false,
      }));
    }
    const text = String(token.text).trim();
    if (!matchedDirectly && WHOLE_NUMBER.test(text) && !/^(?:19|20)\d{2}$/u.test(text)) {
      const context = sameLineText(token, tokens);
      if (MONEY_CONTEXT.test(context)) {
        results.push(Object.freeze({
          id: `${token.id}-a${results.length + 1}`,
          rawAmount: text,
          page: token.page,
          bounds: token.bounds,
          sourceTokenId: token.id,
          confirmed: false,
        }));
      }
    }
  }
  return results;
}
