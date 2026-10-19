// Presentation only: values are copied from Python's result, never recomputed or inferred.
export function resultHeadline(result) {
  if (result.status === "needs_recheck") return { text: "These numbers don’t add up.", amount: null };
  if (result.verdict === "verified_mismatch") return { text: "The re-checked figures do not add up.", amount: null };
  if (result.minor.expected == null) return { text: "The confirmed bill amounts add up.", amount: null };
  if (result.minor.difference === 0) return { text: "Your bill adds up and matches what you expected.", amount: null };
  return { text: "Your bill adds up. Difference from what you expected:", amount: result.amounts.difference };
}

export function mathRows(result) {
  const rows = result.lines.filter(line => ["charge", "discount", "adjustment"].includes(line.role))
    .map(line => ({ label: line.description, value: line.amount, kind: "line" }));
  rows.push({ label: "Sum of the confirmed lines", value: result.amounts.calculatedTotal, kind: "total" });
  if (result.amounts.printedTotal) rows.push({ label: "Total printed on the bill", value: result.amounts.printedTotal, kind: "printed" });
  if (result.amounts.expected != null) rows.push({ label: "You expected", value: result.amounts.expected, kind: "expected" });
  if (result.amounts.difference != null) rows.push({ label: "Difference from expectation", value: result.amounts.difference, kind: "difference" });
  return rows;
}
