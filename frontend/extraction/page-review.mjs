// Page bookkeeping only; no money parsing, sums or inferred duplicate charges.
export function appendPageCandidates(existing, added, page) {
  if (!Number.isInteger(page) || page < 1) throw new Error("Invalid source page");
  const ids = new Set(existing.map(line => line.id));
  for (const line of added) {
    if (line.page !== page) throw new Error("New lines must belong to the selected page");
    if (ids.has(line.id)) throw new Error("Duplicate candidate ID");
    ids.add(line.id);
  }
  // A repeat of the same crop is not another charge. Match multiplicity so two
  // identical printed rows in one extraction are not silently collapsed.
  const matched = new Set();
  const fresh = added.filter(line => {
    if (!line.extractionSourceKey || !line.extractionSignature) return true;
    const index = existing.findIndex((prior, i) => !matched.has(i) && prior.page === page &&
      prior.extractionSourceKey === line.extractionSourceKey && prior.extractionSignature === line.extractionSignature);
    if (index < 0) return true;
    matched.add(index);
    return false;
  });
  return [...existing, ...fresh];
}

export function pageLineCounts(pages, candidates) {
  return pages.map(page => ({ page, count: candidates.filter(line => line.page === page).length }));
}

export function manualCandidateFields({page, description, rawAmount, role, group = ""}) {
  if (!Number.isInteger(page) || page < 1) throw new Error("Choose the source page");
  if (!["charge", "discount", "adjustment", "subtotal", "total"].includes(role)) throw new Error("Choose the type of line");
  description = String(description || "").trim();
  rawAmount = rawAmount == null ? "" : String(rawAmount).trim();
  group = String(group || "").trim();
  if (!description || !rawAmount) throw new Error("Enter the printed label and amount");
  if (role === "subtotal" && !group) throw new Error("A subtotal needs the section it checks");
  return {page, description, rawAmount, role, group, extractor: "manual", precision: "page", locatedBy: null, bounds: null, region: null, confirmed: false};
}

export function printedCheckPresence(lines) {
  const checks = lines.filter(line => ["total", "subtotal"].includes(line.role));
  if (!checks.length) return "missing";
  const complete = checks.filter(line => String(line.rawAmount || "").trim() && String(line.description || "").trim() && (line.role !== "subtotal" || String(line.group || "").trim()));
  if (!complete.length) return "needs_details";
  return complete.some(line => line.confirmed) ? "confirmed" : "needs_confirmation";
}

export function removeCandidateById(lines, id) {
  const index = lines.findIndex(line => line.id === id);
  return {lines: lines.filter(line => line.id !== id), removed: index < 0 ? null : lines[index], index};
}

export function rowRevealDelay(index) {
  return Math.min(Math.max(0, index), 8) * 65;
}
