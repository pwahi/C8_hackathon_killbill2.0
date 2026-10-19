// Presentation only: values are copied from Python's result, never recomputed or inferred.
export function resultHeadline(result) {
  if (result.status === "needs_recheck") return { text: "These numbers don’t add up.", amount: null };
  if (result.verdict === "verified_mismatch") return { text: "The re-checked figures do not add up.", amount: null };
  if (result.minor.expected == null) return { text: "The confirmed bill amounts add up.", amount: null };
  if (result.minor.difference === 0) return { text: "Your bill adds up and matches what you expected.", amount: null };
  return { text: "Your bill adds up. Difference from what you expected:", amount: result.amounts.difference };
}

// Short maths: one row per section (Python's section sum), then lines outside any section, then one total.
// Every row-level formula stays under "Formulas & confirmed sources".
export function mathRows(result) {
  const counted = result.lines.filter(line => ["charge", "discount", "adjustment"].includes(line.role) && line.countedInTotal !== false);
  const groups = (result.groups || []).filter(group => group.amount);
  const inGroup = new Set(groups.flatMap(group => group.lineIds));
  const rows = [
    ...groups.map(group => ({ label: group.label, value: group.amount, kind: "line" })),
    ...counted.filter(line => !inGroup.has(line.id)).map(line => ({ label: line.description, value: line.amount, kind: "line" })),
  ];
  const { calculatedTotal, printedTotal } = result.amounts;
  if (printedTotal && result.minor?.printedTotal === result.minor?.calculatedTotal) {
    rows.push({ label: "Your bill total (matches the printed total ✓)", value: calculatedTotal, kind: "total" });
  } else {
    rows.push({ label: "Sum of the confirmed lines", value: calculatedTotal, kind: "total" });
    if (printedTotal) rows.push({ label: "Total printed on the bill", value: printedTotal, kind: "printed" });
  }
  if (result.amounts.expected != null) rows.push({ label: "You expected", value: result.amounts.expected, kind: "expected" });
  if (result.amounts.difference != null) rows.push({ label: "Difference from expectation", value: result.amounts.difference, kind: "difference" });
  return rows;
}
