// Rows for "Check the lines" in the bill's own hierarchy: what you pay > sections > breakdown rows.
// Presentation only. The tree and its ticks come from Python's plan; a tick is withdrawn as soon as a line in
// that part is edited or removed. No amount is added up here.

const nodeGids = (node) => [node.printedLineId, ...node.rows, ...node.sections.flatMap(nodeGids)].filter(Boolean);

const innerMismatch = (node) => node.sections.some((child) => child.matches === false || innerMismatch(child));

function status(node, byGid, fixed = new Set()) {
  // After the person edits or removes a line in this part, Python's earlier answer no longer applies either way.
  const members = nodeGids(node).map((gid) => byGid.get(gid));
  if (node.matches != null && members.some((line) => !line || line.edited)) return "changed";
  if (node.matches === false) {
    // A 1-2 cent gap is named rounding; once the person added a rounding line, Python checks it again on Looks right.
    if (fixed.has(node.printedLineId)) return "changed";
    return node.rounding ? "rounding" : "mismatch";
  }
  if (node.matches !== true) return "none";
  return innerMismatch(node) ? "inner" : "ok";
}

// A section or part whose lines were all removed is not shown any more (owner: "I deleted this but it shows up").
const hasLines = (node, byGid) => nodeGids(node).some((gid) => byGid.has(gid));

// toggles: Map(id -> collapsed). Default: a section that adds up is collapsed; one with a problem stays open.
export function lineTreeRows(candidates, tree, toggles = new Map()) {
  const rows = [];
  if (!tree?.length) return candidates.map((candidate) => ({ type: "line", id: candidate.id, depth: 0, breakdown: false }));
  const byGid = new Map(candidates.filter((candidate) => candidate.gid).map((candidate) => [candidate.gid, candidate]));
  const fixed = new Set(candidates.map((candidate) => candidate.roundingFor).filter(Boolean));
  const placed = new Set();
  const references = [];
  const line = (gid, depth, breakdown) => {
    const candidate = byGid.get(gid);
    if (!candidate || placed.has(candidate.id) || candidate.reference) return;
    placed.add(candidate.id);
    rows.push({ type: "line", id: candidate.id, depth, breakdown });
  };
  // A rounding line the person added sits inside the part it fixes, just above that part's printed figure.
  const roundings = (gid, depth, breakdown) => candidates
    .filter((candidate) => gid && candidate.roundingFor === gid && !placed.has(candidate.id))
    .forEach((candidate) => { placed.add(candidate.id); rows.push({ type: "line", id: candidate.id, depth, breakdown }); });
  const hide = (node) => nodeGids(node).forEach((gid) => byGid.get(gid) && placed.add(byGid.get(gid).id));
  // Rows and sections in the order they are printed on the bill (the reading order of the lines), so a VAT line
  // printed after a section is not listed above it.
  const order = new Map(candidates.map((candidate, index) => [candidate.gid, index]));
  const position = (gids) => Math.min(...gids.map((gid) => order.get(gid) ?? Infinity));
  const children = (node) => [
    ...node.rows.map((gid) => ({ at: position([gid]), row: gid })),
    ...node.sections.map((section) => ({ at: position(nodeGids(section)), section })),
  ].sort((a, b) => a.at - b.at);

  const visit = (node, depth) => {
    if (!hasLines(node, byGid)) return;
    references.push(...node.references);
    const state = status(node, byGid, fixed);
    const collapsed = toggles.has(node.id) ? toggles.get(node.id) : state === "ok";
    rows.push({ type: "section", id: node.id, depth, label: node.label, period: node.period, status: state, collapsed,
      amountId: byGid.get(node.printedLineId)?.id || null, hint: byGid.get(node.printedLineId)?.attention || null });
    if (collapsed) { hide(node); collectReferences(node); return; }
    children(node).forEach((child) => child.section ? visit(child.section, depth + 1) : line(child.row, depth + 1, true));
    roundings(node.printedLineId, depth + 1, true);
    line(node.printedLineId, depth + 1, true);
  };
  const collectReferences = (node) => node.sections.forEach((child) => { references.push(...child.references); collectReferences(child); });

  for (const invoice of tree) {
    if (!hasLines(invoice, byGid)) continue;
    references.push(...invoice.references);
    const header = { type: "invoice", id: invoice.id, depth: 0, part: tree.length > 1, label: tree.length > 1 ? invoice.label : "What you pay",
      status: status(invoice, byGid, fixed), amountId: byGid.get(invoice.printedLineId)?.id || null,
      // A part's total that is shown, not counted (several parts with sections) has no card of its own to explain
      // a gap, so the explanation sits under the part's header; otherwise the total line itself shows it.
      hint: byGid.get(invoice.printedLineId)?.reference ? byGid.get(invoice.printedLineId).gapHint || null : null };
    // The lines first, the total as the closing row, like on a receipt (owner sketch). With several parts
    // (electricity and gas) each part ends with its own total.
    children(invoice).forEach((child) => child.section ? visit(child.section, 0) : line(child.row, 0, false));
    roundings(invoice.printedLineId, 0, false);
    line(invoice.printedLineId, 0, false);
    rows.push(header);
  }

  const referenceLines = candidates.filter((candidate) => candidate.reference);
  if (referenceLines.length) {
    const collapsed = toggles.has("references") ? toggles.get("references") : true;
    rows.push({ type: "group", id: "references", depth: 0, label: "Shown on the bill — not counted",
      count: referenceLines.length, collapsed });
    referenceLines.forEach((candidate) => { placed.add(candidate.id); if (!collapsed) rows.push({ type: "line", id: candidate.id, depth: 1, breakdown: true }); });
  }
  // Lines the reader saw but that have no type yet (e.g. "VAT 21% (information)") are not counted: folded away so
  // the person checks what is paid first. Lines the person added stay visible below.
  const info = candidates.filter((candidate) => !placed.has(candidate.id) && candidate.gid && !candidate.role);
  if (info.length) {
    const collapsed = toggles.has("info") ? toggles.get("info") : true;
    rows.push({ type: "group", id: "info", depth: 0, label: "Also on the bill — not counted", count: info.length, collapsed });
    info.forEach((candidate) => { placed.add(candidate.id); if (!collapsed) rows.push({ type: "line", id: candidate.id, depth: 1, breakdown: true }); });
  }
  const others = candidates.filter((candidate) => !placed.has(candidate.id));
  if (others.length) {
    rows.push({ type: "group", id: "other", depth: 0, label: "Other lines", count: others.length, collapsed: false });
    others.forEach((candidate) => rows.push({ type: "line", id: candidate.id, depth: 0, breakdown: false }));
  }
  return rows;
}

export const STATUS_TEXT = {
  ok: "✓ adds up",
  mismatch: "✗ does not add up",
  changed: "changed — checked again when you press Looks right",
  inner: "✓ adds up — but a section below does not",
  rounding: "≈ rounding difference",
  none: "",
};

// Display only: "30 GB mobile plan (6-31 August)" -> title "30 GB mobile plan", period "6-31 August" (smaller, below).
// The label itself is never changed; anything that is not a trailing bracket stays in the title.
export function splitPeriod(label) {
  const text = String(label || "").trim();
  const match = /^(.+?)\s*\(([^()]+)\)$/.exec(text);
  return match ? { title: match[1], period: match[2] } : { title: text, period: "" };
}
