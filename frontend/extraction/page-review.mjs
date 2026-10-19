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

// Structural suggestion only. Never compare/sum amounts or overwrite an explicit section.
export function linkUnassignedSections(lines) {
  const result = lines.map(line => ({...line}));
  for (let end = 0; end < result.length; end++) {
    const subtotal = result[end];
    if (subtotal.role !== "subtotal" || !subtotal.group?.trim()) continue;
    const members = [];
    for (let i = end - 1; i >= 0; i--) {
      const line = result[i];
      if (line.page !== subtotal.page || ["subtotal", "total"].includes(line.role)) break;
      // Only trust row order within the very same model-read area.
      if (!subtotal.extractionSourceKey || line.extractionSourceKey !== subtotal.extractionSourceKey) break;
      if (!["charge", "discount", "adjustment"].includes(line.role)) break;
      members.push(line);
    }
    const key = text => text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (members.some(line => line.group?.trim() && key(line.group) !== key(subtotal.group))) continue;
    for (const line of members) if (!line.group?.trim()) {
      line.group = subtotal.group.trim();
      line.confirmed = false;
    }
  }
  return result;
}

export function assignSection(lines, subtotalId, memberIds) {
  const subtotal = lines.find(line => line.id === subtotalId && line.role === "subtotal");
  if (!subtotal?.group?.trim()) throw new Error("Give this section a name first.");
  if (!memberIds.length) throw new Error("Choose the charge or discount rows this subtotal covers.");
  const selected = new Set(memberIds);
  const key = text => String(text || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const section = key(subtotal.group);
  for (const id of selected) if (!lines.some(line => line.id === id && ["charge", "discount", "adjustment"].includes(line.role))) throw new Error("Choose charge, discount or adjustment rows only.");
  return lines.map(line => {
    if (selected.has(line.id)) return {...line, group: subtotal.group.trim(), confirmed: false};
    if (["charge", "discount", "adjustment"].includes(line.role) && key(line.group) === section) return {...line, group: "", confirmed: false};
    return line;
  });
}
