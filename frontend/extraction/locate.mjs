// Find where each read amount is printed, using the PDF's own text layer (exact positions, no AI).
// An amount is located only when it can be matched without guessing: the same printed amount must occur
// as often in the text layer as among the read lines of that page; then they are paired top to bottom.

const normal = (text) => String(text || "").replace(/[\s€₹]|EUR|INR/giu, "").replace(/[−–]/gu, "-");

// lines: [{ id, page, rawAmount }] in reading order; tokens: [{ page, text, bounds }]. Returns Map(id -> bounds).
export function locateAmounts(lines, tokens) {
  const found = new Map();
  const groups = new Map();
  for (const line of lines) {
    const key = `${line.page}|${normal(line.rawAmount)}`;
    if (!normal(line.rawAmount)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  for (const [key, group] of groups) {
    const [page, amount] = [Number(key.split("|")[0]), key.slice(key.indexOf("|") + 1)];
    const matches = tokens.filter((token) => token.page === page && normal(token.text) === amount)
      .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.x0 - b.bounds.x0);
    if (matches.length !== group.length) continue;  // ambiguous: leave at page level
    group.forEach((line, index) => found.set(line.id, matches[index].bounds));
  }
  return found;
}
