// Rows for "Check the lines" in the bill's own hierarchy: what you pay > sections > breakdown rows.
// Presentation only. The tree and its ticks come from Python's plan; a tick is withdrawn as soon as a line in
// that part is edited or removed. No amount is added up here.

const nodeGids = (node) => [node.printedLineId, ...node.rows, ...node.sections.flatMap(nodeGids)].filter(Boolean);

const innerMismatch = (node) => node.sections.some((child) => child.matches === false || innerMismatch(child));

function status(node, byGid) {
  if (node.matches === false) return "mismatch";
  if (node.matches !== true) return "none";
  const members = nodeGids(node).map((gid) => byGid.get(gid));
  if (members.some((line) => !line || line.edited)) return "changed";   // only after the person edits or removes
  return innerMismatch(node) ? "inner" : "ok";
}

// toggles: Map(id -> collapsed). Default: a section that adds up is collapsed; one with a problem stays open.
export function lineTreeRows(candidates, tree, toggles = new Map()) {
  const rows = [];
  if (!tree?.length) return candidates.map((candidate) => ({ type: "line", id: candidate.id, depth: 0, breakdown: false }));
  const byGid = new Map(candidates.filter((candidate) => candidate.gid).map((candidate) => [candidate.gid, candidate]));
  const placed = new Set();
  const references = [];
  const line = (gid, depth, breakdown) => {
    const candidate = byGid.get(gid);
    if (!candidate || placed.has(candidate.id) || candidate.reference) return;
    placed.add(candidate.id);
    rows.push({ type: "line", id: candidate.id, depth, breakdown });
  };
  const hide = (node) => nodeGids(node).forEach((gid) => byGid.get(gid) && placed.add(byGid.get(gid).id));

  const visit = (node, depth) => {
    references.push(...node.references);
    const state = status(node, byGid);
    const collapsed = toggles.has(node.id) ? toggles.get(node.id) : state === "ok";
    rows.push({ type: "section", id: node.id, depth, label: node.label, period: node.period, status: state, collapsed,
      amountId: byGid.get(node.printedLineId)?.id || null, hint: byGid.get(node.printedLineId)?.attention || null });
    if (collapsed) { hide(node); collectReferences(node); return; }
    node.rows.forEach((gid) => line(gid, depth + 1, true));
    node.sections.forEach((child) => visit(child, depth + 1));
    line(node.printedLineId, depth + 1, true);
  };
  const collectReferences = (node) => node.sections.forEach((child) => { references.push(...child.references); collectReferences(child); });

  for (const invoice of tree) {
    references.push(...invoice.references);
    rows.push({ type: "invoice", id: invoice.id, depth: 0, label: tree.length > 1 ? invoice.label : "What you pay",
      status: status(invoice, byGid), amountId: byGid.get(invoice.printedLineId)?.id || null });
    invoice.rows.forEach((gid) => line(gid, 0, false));
    invoice.sections.forEach((section) => visit(section, 0));
    line(invoice.printedLineId, 0, false);
  }

  const referenceLines = candidates.filter((candidate) => candidate.reference);
  if (referenceLines.length) {
    const collapsed = toggles.has("references") ? toggles.get("references") : true;
    rows.push({ type: "group", id: "references", depth: 0, label: "Repeated elsewhere on the bill — not counted",
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
  none: "",
};
