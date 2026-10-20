import { findAmountCandidates } from "./extraction/amount-candidates.mjs";
import { nearbyText } from "./extraction/candidate-context.mjs";
import { extractImageTokens } from "./extraction/ocr-client.mjs";
import { extractPdfTokens } from "./extraction/pdf-client.mjs";
import { buildServerPayload, containsPossiblePrivateData } from "./extraction/privacy.mjs";
import { prepareImage } from "./extraction/image-preparation.mjs";
import { cleanVisionColumns, formatAmount, readiness, toContractInput, visionSuggestion, allReadyState, confirmReadyLines } from "./extraction/bulk-confirm.mjs";
import { createFlow, requireExpectedAmount } from "./ui-flow.mjs";
import { resultHeadline, mathRows } from "./result-display.mjs";
import { lineTreeRows, STATUS_TEXT, splitPeriod } from "./line-tree.mjs";
import { locateAmounts } from "./extraction/locate.mjs";
import { applyTone } from "./tone.mjs";
import { pagesToRead, readButtonText, parsePageList, formatPageList } from "./read-flow.mjs";
import { createSavedChecks } from "./saved-checks.mjs";
import { appendPageCandidates, pageLineCounts, manualCandidateFields, printedCheckPresence, removeCandidateById, rowRevealDelay, assignSection, suggestSection, sectionMembers, sectionReviewKey, sectionAccepted, acceptVerifiedSections } from "./extraction/page-review.mjs";

const elements = {
  files: document.querySelector("#bill-files"),
  currency: document.querySelector("#currency"),
  decimalSeparator: document.querySelector("#decimal-separator"),
  expectedAmount: document.querySelector("#expected-amount"),
  process: document.querySelector("#process"),
  reset: document.querySelector("#reset"),
  status: document.querySelector("#status"),
  accessCode: document.querySelector("#access-code"),
  accessBox: document.querySelector("#access-box"),
  review: document.querySelector("#review"),
  pages: document.querySelector("#document-pages"),
  candidateList: document.querySelector("#candidate-list"),
  candidateCount: document.querySelector("#candidate-count"),
  confirmAll: document.querySelector("#confirm-all"),
  openVision: document.querySelector("#open-vision"),
  payloadPanel: document.querySelector("#payload-panel"),
  messageType: document.querySelector("#message-type"),
  earlierPeriodGroup: document.querySelector("#earlier-period-group"),
  previewPayload: document.querySelector("#preview-payload"),
  downloadPayload: document.querySelector("#download-payload"),
  analyze: document.querySelector("#analyze"),
  payloadError: document.querySelector("#payload-error"),
  payloadOutput: document.querySelector("#payload-output"),
  resultPanel: document.querySelector("#result-panel"),
  resultSummary: document.querySelector("#result-summary"),
  resultChecks: document.querySelector("#result-checks"),
  resultLines: document.querySelector("#result-lines"),
  resultMissing: document.querySelector("#result-missing"),
  draftText: document.querySelector("#draft-text"),
  draftNote: document.querySelector("#draft-note"),
  resultGap: document.querySelector("#result-gap"),
  copyDraft: document.querySelector("#copy-draft"),
  saveNote: document.querySelector("#save-note"),
  sentText: document.querySelector("#sent-text"),
  markSent: document.querySelector("#mark-sent"),
  sentNote: document.querySelector("#sent-note"),
  draftBox: document.querySelector("#draft-box"),
  recheckBox: document.querySelector("#recheck-box"),
  resultSuspects: document.querySelector("#result-suspects"),
  recheckConfirm: document.querySelector("#recheck-confirm"),
};

const ROLE_LABELS = {
  charge: "Charge",
  discount: "Discount (minus amount)",
  adjustment: "Rounding / adjustment",
  subtotal: "Printed subtotal",
  total: "Printed total",
};
// Short type names for the table's "What is it" column (the editor's dropdown keeps the longer explanations).
const PILL_LABELS = { charge: "Charge", discount: "Discount", adjustment: "Rounding", subtotal: "Subtotal", total: "Total" };
const EYE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const flow = createFlow();
// "groq" is the stored locator value for any AI-reader location, whichever provider read it.
const LOCATOR_LABELS = { pdf_text: "PDF text", local_ocr: "local OCR", groq: "AI reader (unverified)", user: "you" };
// Which service reads approved areas (from /api/health); named wherever data leaves the device.
let visionName = "Groq";
const VERDICT_LABELS = {
  verified_mismatch: "Verified mismatch — the confirmed printed figures do not add up",
  unexplained: "Unexplained — the bill differs from what you expected, but that is not proof of an error",
  checks_passed: "Checks passed — for the checks listed below only",
};

let reviewState = emptyState();
let reviewGeneration = 0;
let pendingGroq = null;
let groqRequestRunning = false;
const groqDialog = document.querySelector("#groq-dialog");
const groqSend = document.querySelector("#groq-send");
const groqRedacted = document.querySelector("#groq-redacted");

function emptyState() {
  return { tokens: [], candidates: [], pageElements: new Map(), objectUrls: [], payload: null, extractor: null, rechecked: false, activePage: 1, lastAreas: new Map(), skippedPages: new Set(), pageSelectError: null, removedLines: [], tree: null, toggles: new Map(), zoom: false, areaReads: new Map(), notes: [] };
}

// One shape for every candidate, whatever produced it. Evidence precision is never upgraded silently.
function newCandidate(fields) {
  return {
    rawAmount: "", extractedRawAmount: null, description: "", currency: elements.currency.value,
    role: "", group: "", questioned: false, confirmed: false, attention: null, breakdown: null,
    precision: "page", locatedBy: null, bounds: null, region: null,
    context: "", warning: "",
    ...fields,
  };
}

// One sentence about the structure Groq proposed for the area, as checked by Python on the server.
function structureNote(structure) {
  if (!structure) return "";
  if (structure.status === "invalid") return "The AI reader's sections for this area did not check out, so the lines were added without them.";
  if (structure.status === "mismatch") return "A section does not add up to its printed subtotal: open the marked lines to see what may be missing.";
  const verified = Object.values(structure.lines).some(line => line.verified);
  return verified ? "Sections were recognised and add up to their printed subtotals (checked by Python)." : "";
}

// ---- "Check the lines" table in the bill's hierarchy (Python's tree; nothing is added up here) ----
function renderLines() {
  const byId = new Map(reviewState.candidates.map(line => [line.id, line]));
  elements.candidateList.replaceChildren(...lineTreeRows(reviewState.candidates, reviewState.tree, reviewState.toggles).flatMap(row => {
    if (row.type !== "line") {
      const header = treeHeader(row, byId);
      if (!["mismatch", "rounding"].includes(row.status) || !row.hint) return [header];
      const note = document.createElement("p");
      note.className = `tree-hint${row.status === "rounding" ? " rounding" : ""}`;
      note.style.setProperty("--depth", row.depth);
      note.textContent = row.hint;
      const fix = row.status === "rounding" ? roundingButton(byId.get(row.amountId)) : null;
      if (fix) note.append(" ", fix);
      return [header, note];
    }
    const card = candidateCard(byId.get(row.id));
    card.style.setProperty("--depth", row.depth);
    card.classList.toggle("breakdown", row.breakdown);
    return [card];
  }));
}

function treeHeader(row, byId) {
  // Same columns as the lines (owner sketch): title with the period below, "What is it", amount, and the eye.
  const header = document.createElement("div");
  header.className = `tree-row tree-${row.type}${row.part ? " tree-part" : ""} status-${row.status || "none"}`;
  header.dataset.nodeId = row.id;
  header.style.setProperty("--depth", row.depth);
  const name = document.createElement("span");
  name.className = "tree-label";
  const title = document.createElement("span");
  title.className = "tree-title";
  const marker = row.type === "invoice" ? "" : row.collapsed ? "▸ " : "▾ ";
  const period = row.period && !row.label.includes(row.period) ? row.period : "";
  title.textContent = `${marker}${row.label}${row.count ? ` (${row.count})` : ""}`;
  name.append(title);
  if (period) { const sub = document.createElement("small"); sub.className = "line-sub"; sub.textContent = period; name.append(sub); }
  const state = document.createElement("small");
  state.className = "tree-status";
  state.textContent = row.type === "invoice" && row.status === "ok" ? "✓ all lines add up to this (checked by Python)"
    : row.type === "section" && row.status === "ok" ? "" : STATUS_TEXT[row.status] || "";
  if (state.textContent) name.append(state);
  const kind = document.createElement("span");
  kind.className = row.type === "section" ? "line-kind" : "tree-kind";
  kind.textContent = row.type === "section" ? "Section" : "";
  const amount = document.createElement("span");
  amount.className = "tree-amount";
  amount.textContent = row.amountId ? byId.get(row.amountId)?.rawAmount || "" : "";
  header.append(name, kind, amount);
  if (row.type === "invoice") {
    // A total: click to light up every line it adds up on the bill.
    header.classList.add("shows-lines");
    header.title = "Show these lines on the bill";
    header.addEventListener("click", () => showOnBill(linesInNode(row.id), row.id));
  } else {
    header.setAttribute("role", "button");
    header.tabIndex = 0;
    header.setAttribute("aria-expanded", String(!row.collapsed));
    // A section opens or closes and lights up all its lines on the bill; then a single line can be clicked.
    const toggle = () => { reviewState.toggles.set(row.id, !row.collapsed); renderLines(); if (row.type === "section") showOnBill(linesInNode(row.id), row.id); };
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
  }
  return header;
}

// After an edit or removal: update only the section ticks, so typing is not interrupted.
function refreshTreeHeaders() {
  if (!reviewState.tree) return;
  for (const row of lineTreeRows(reviewState.candidates, reviewState.tree, reviewState.toggles)) {
    if (row.type === "line") continue;
    const header = document.querySelector(`.tree-row[data-node-id="${CSS.escape(row.id)}"]`);
    if (!header) continue;
    header.className = `tree-row tree-${row.type}${row.part ? " tree-part" : ""} status-${row.status || "none"}`;
    const text = row.type === "invoice" && row.status === "ok"
      ? "✓ all lines add up to this (checked by Python)" : row.type === "section" && row.status === "ok" ? "" : STATUS_TEXT[row.status] || "";
    let state = header.querySelector(".tree-status");
    if (!state && text) { state = document.createElement("small"); state.className = "tree-status"; header.querySelector(".tree-label").append(state); }
    if (state) state.textContent = text;
  }
}

// The reader reports the bill's decimal mark; adopt it (visibly) before amounts are formatted for display.
function useBillDecimalMark(mark) {
  if (![".", ","].includes(mark) || mark === elements.decimalSeparator.value) return;
  elements.decimalSeparator.value = mark;
  setDecimalHint(`Switched to ${mark === "," ? "comma" : "point"} because your bill writes amounts that way. Change it if that is wrong.`);
}

function setDecimalHint(text) {
  const hint = document.querySelector("#decimal-hint");
  if (hint) hint.textContent = text;
}

// One AI-read line -> an unconfirmed candidate. area is the drawn table area, or null for a whole page.
// placed is Python's checked plan for the line (section, tick, hint, role for summaries), if any.
function visionCandidate(line, { page, area, sourceKey, outputCurrency, placed, model, id = null, gid = null, wholePage = false }) {
  // A discount printed without a minus that Python counted as a deduction because the printed totals add up that way
  // (owner 2026-10-20). The printed amount stays visible in the note; nothing else is changed.
  const deduction = placed?.signedRaw ? `Printed without a minus sign (${line.raw_amount}). It reduces the bill: Python counted it as a deduction because the printed totals add up exactly that way.` : null;
  if (deduction) line = { ...line, raw_amount: placed.signedRaw };
  const suggestion = visionSuggestion(line);
  // Uniform display: no currency marks, chosen decimal format; unclear values stay as printed with a note.
  const separator = elements.decimalSeparator.value;
  const formatNotes = [];
  const fmt = (value) => { const result = formatAmount(value, separator); if (result.note) formatNotes.push(result.note); return result.text; };
  const amountText = fmt(line.raw_amount);
  const cleaned = line.breakdown ? cleanVisionColumns({
    quantity: line.breakdown.quantity, unitPrice: line.breakdown.unit_price, discount: line.breakdown.discount,
    taxableValue: line.breakdown.taxable_value, taxes: line.breakdown.taxes,
  }) : null;
  if (cleaned) {
    for (const key of ["unitPrice", "discount", "taxableValue"]) cleaned.columns[key] = fmt(cleaned.columns[key]);
    cleaned.columns.taxes = cleaned.columns.taxes.map(fmt);
  }
  // Whole page: the reader finds the right row reliably but not the exact column (tested 2026-10-19), so the
  // evidence is the printed row as a band across the page ("read from this row"), never an exact amount box.
  const row = wholePage && line.bounds ? { x0: 0.02, top: line.bounds.top, x1: 0.98, bottom: line.bounds.bottom } : null;
  if (row) area = row;
  const box = area && !wholePage ? line.bounds : null;
  // Valid crop-relative boxes map back to the page; otherwise the selected table area is the evidence.
  const bounds = box ? {
    x0: area.x0 + box.x0 * (area.x1 - area.x0),
    x1: area.x0 + box.x1 * (area.x1 - area.x0),
    top: area.top + box.top * (area.bottom - area.top),
    bottom: area.top + box.bottom * (area.bottom - area.top),
  } : null;
  return newCandidate({
    id: id || `groq-${crypto.randomUUID()}`, gid, page,
    precision: bounds ? "exact" : area ? "table" : "page", locatedBy: bounds || area ? "groq" : null, bounds,
    region: bounds || !area ? null : { ...area },
    extractor: "groq", rawAmount: amountText, extractedRawAmount: line.raw_amount == null ? null : amountText,
    extractionSourceKey: sourceKey,
    extractionSignature: JSON.stringify({description: line.description, amount: line.raw_amount, role: line.role, group: line.group, currency: line.currency, breakdown: line.breakdown}),
    role: placed && "role" in placed ? placed.role : suggestion.role, group: placed ? placed.group : suggestion.group,
    sectionPath: placed?.path || "", structureVerified: Boolean(placed?.verified), rounding: placed?.rounding || null,
    // Confirmation by exception (owner 2026-10-20): Python checked this line by maths, so it counts without a tick.
    autoVerified: Boolean(placed?.autoVerified), confirmed: Boolean(placed?.autoVerified),
    gapHint: placed?.hint || null,
    reference: placed && placed.role === "" ? { text: referenceText(placed) } : null,
    attention: placed && placed.role === "" ? null : placed?.hint || null,
    breakdown: cleaned ? cleaned.columns : null,
    description: line.description, currency: line.currency || outputCurrency || elements.currency.value,
    originalLabel: line.original_label && line.original_label !== line.description ? line.original_label : "",
    context: `AI reader suggestion (${model || visionName}) · check against the original page${line.original_label && line.original_label !== line.description ? ` · printed as “${line.original_label}”` : ""}${placed?.note ? ` · AI link (unverified): ${placed.note}` : ""}`,
    warning: [deduction, line.warning, ...suggestion.notes, ...(cleaned ? cleaned.notes : []), ...formatNotes, bounds
      ? "Model source box is unverified. Inspect it before confirming."
      : row ? "Read from the highlighted row (found by the AI reader, not verified). Check the amount in that row before confirming."
      : area ? "Read from the dashed table area; the exact position of this amount is not known. Check the amount in that table before confirming."
      : "Read from the whole page; the exact position of this amount is not known. Check it on that page before confirming."].filter(Boolean).join(" "),
  });
}

// Python decided this line is not counted: it repeats a section or total, or it is a zero subtotal.
function referenceText(placed) {
  if (placed.referenceText) return placed.referenceText;
  if (!placed.summaryOf) return placed.hint || "Shown for reference, not counted.";
  return `Repeats “${placed.summaryOf}” — not counted${placed.verified ? " · ✓ amounts agree" : " · ✗ amounts differ: compare them"}`;
}

// A calm, collapsed row for reference lines. "Count it anyway" turns it back into a normal line to classify.
function referenceCard(candidate) {
  const card = document.createElement("article");
  card.className = "candidate-card reference-line";
  card.dataset.cardId = candidate.id;
  const name = document.createElement("div");
  name.className = "reference-name";
  name.textContent = candidate.description || "Reference line";
  const note = document.createElement("small");
  note.textContent = `Page ${candidate.page} · ${candidate.reference.text}`;
  name.append(note);
  const amount = document.createElement("span");
  amount.className = "reference-amount";
  amount.textContent = candidate.rawAmount;
  const count = document.createElement("button");
  count.type = "button";
  count.className = "text-button";
  count.textContent = "Count it anyway";
  count.addEventListener("click", () => {
    const index = reviewState.candidates.findIndex(line => line.id === candidate.id);
    reviewState.candidates[index] = { ...candidate, reference: null, attention: "Choose what this line is. Only count it if it is a separate charge, not a repeat." };
    card.replaceWith(candidateCard(reviewState.candidates[index]));
    invalidatePayload();
    refreshPageControls();
  });
  card.append(name, amount, count);
  return card;
}

function regionKey(page, region) {
  return `${page}:${[region.x0, region.top, region.x1, region.bottom].map((value) => value.toFixed(4)).join(",")}`;
}

function previewGroqArea(page, bounds) {
  const source = reviewState.pageElements.get(page)?.querySelector("canvas, img");
  if (!source) return;
  reviewState.activePage = page;
  reviewState.lastAreas.set(page, {...bounds});
  refreshPageControls();
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const crop = document.createElement("canvas");
  crop.width = Math.max(1, Math.round((bounds.x1 - bounds.x0) * width));
  crop.height = Math.max(1, Math.round((bounds.bottom - bounds.top) * height));
  crop.getContext("2d").drawImage(source, bounds.x0 * width, bounds.top * height, (bounds.x1 - bounds.x0) * width, (bounds.bottom - bounds.top) * height, 0, 0, crop.width, crop.height);
  const dataUrl = crop.toDataURL("image/png");
  pendingGroq = { page, bounds, dataUrl, generation: reviewGeneration };
  document.querySelector("#groq-crop-preview").src = dataUrl;
  groqRedacted.checked = false;
  groqSend.disabled = true;
  flow.reading("preview", page);
  groqDialog.showModal();
}

groqRedacted.addEventListener("change", () => { groqSend.disabled = !groqRedacted.checked || groqRequestRunning; });
document.querySelector("#groq-cancel").addEventListener("click", () => {
  const page = pendingGroq?.page || reviewState.activePage;
  pendingGroq = null; groqDialog.close();
  reviewState.pageElements.get(page)?.startGroqSelection();
});
groqDialog.addEventListener("cancel", () => { pendingGroq = null; flow.reading("select", reviewState.activePage); });
groqSend.addEventListener("click", async () => {
  if (!pendingGroq || !groqRedacted.checked || groqRequestRunning) return;
  const selection = pendingGroq;
  groqRequestRunning = true;
  groqSend.disabled = true;
  groqDialog.close();
  flow.reading("reading", selection.page);
  refreshPageControls();
  setStatus("Reading your approved area. Please wait; we will not send it again automatically.", "busy");
  try {
    const response = await fetch("/api/groq-extract", {
      method: "POST",
      headers: apiHeaders("redacted-crop"),
      // structure: Groq also proposes sections, periods and subtotals; the server's Python checks every sum.
      body: JSON.stringify({ imageBase64: selection.dataUrl.split(",")[1], mime: "image/png", redacted: true,
        structure: true, decimalSeparator: elements.decimalSeparator.value, currency: elements.currency.value }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "Vision request failed");
    if (selection.generation !== reviewGeneration) return;
    const area = selection.bounds;
    if (["EUR", "INR"].includes(result.output.currency) && result.output.currency !== elements.currency.value) {
      elements.currency.value = result.output.currency;
      elements.currency.dispatchEvent(new Event("change"));
    }
    useBillDecimalMark(result.decimalMark);
    // Same table as reading the whole bill (owner): the areas read so far (the latest per page) go through the same
    // Python check of sections and totals, so the lines appear in the bill's hierarchy. Not when a whole-bill
    // reading is already there; then the area's lines are added below it as before.
    const hasWhole = reviewState.candidates.some(line => String(line.extractionSourceKey || "").startsWith("whole:"));
    let linked = null;
    if (!hasWhole) {
      reviewState.areaReads.set(selection.page, { output: result.output, model: result.model, bounds: selection.bounds });
      linked = await linkAreas(selection.generation);
      if (selection.generation !== reviewGeneration) return;
    }
    if (linked) {
      // The checked areas are rebuilt as one set; typed lines and older unchecked area lines stay.
      const kept = reviewState.candidates.filter(line => !String(line.extractionSourceKey || "").startsWith("area:"));
      reviewState.candidates = acceptVerifiedSections([...kept, ...linked.added], linked.added.map(line => line.id));
      reviewState.tree = linked.plan.status === "invalid" ? null : linked.plan.tree || null;
      reviewState.toggles = new Map();
      renderLines();
      invalidatePayload("Area read. Review the lines and check them.");
      drawHighlights();
      refreshPageControls();
      flow.extracted(true);
      setStatus(`${wholeBillNote(linked.plan, linked.added.length, reviewState.areaReads.size).replace(/ The pages were connected[^.]*\./, "")} To add another part of the bill, select an area on another page.`,
        ["mismatch", "invalid"].includes(linked.plan.status) ? "failure" : "");
      return;
    }
    const plan = result.structure && result.structure.status !== "invalid" ? result.structure.lines : {};
    const added = result.output.lines.map((line) => visionCandidate(line, {
      page: selection.page, area: selection.bounds, sourceKey: regionKey(selection.page, selection.bounds),
      outputCurrency: result.output.currency, placed: plan[line.id], model: result.model,
    }));
    const previousIds = new Set(reviewState.candidates.map(line => line.id));
    reviewState.candidates = appendPageCandidates(reviewState.candidates, added, selection.page);
    reviewState.candidates = acceptVerifiedSections(reviewState.candidates, added.map(line => line.id));
    const fresh = reviewState.candidates.filter(line => !previousIds.has(line.id));
    renderLines();
    elements.candidateCount.textContent = `${reviewState.candidates.length} to review`;
    invalidatePayload("Vision suggestions added. Review them and rebuild the safe preview.");
    drawHighlights();
    refreshPageControls();
    flow.extracted(true);
    const repeated = added.length - fresh.length;
    setStatus(`Added ${fresh.length} lines from page ${selection.page}.${repeated ? ` Kept ${repeated} identical earlier line(s) instead of adding them twice.` : ""} ${structureNote(result.structure)} Earlier lines and your corrections are kept. Use the page buttons above the bill to read another relevant page, or check the combined lines.`, result.structure?.status === "mismatch" ? "failure" : "");
  } catch (error) {
    if (selection.generation === reviewGeneration) { flow.reading("select", selection.page); setStatus(error.message, "failure"); }
  } finally { groqRequestRunning = false; pendingGroq = null; refreshPageControls(); }
});

// The areas read so far (latest per page) -> the same Python-verified plan as a whole-bill reading, or null if the
// check could not run (the area's lines are then added the old way).
async function linkAreas(generation) {
  const reads = [...reviewState.areaReads.entries()].sort(([a], [b]) => a - b);
  try {
    const response = await fetch("/api/link-pages", {
      method: "POST", headers: apiHeaders("area-bill"),
      body: JSON.stringify({ decimalSeparator: elements.decimalSeparator.value, currency: elements.currency.value,
        pages: reads.map(([page, read]) => ({ page, output: read.output })) }),
    });
    const answer = await response.json();
    if (!response.ok || answer.error || generation !== reviewGeneration) return null;
    const plan = answer.plan;
    const added = reads.flatMap(([page, read]) => read.output.lines.map(line => {
      const gid = plan.ids[`${page}:${line.id}`];
      return visionCandidate(line, { page, area: read.bounds, sourceKey: `area:${regionKey(page, read.bounds)}`,
        outputCurrency: read.output.currency, placed: plan.lines[gid], model: read.model, id: `area-${gid}`, gid });
    }));
    return { plan, added };
  } catch { return null; }
}

// ---- Whole-bill reading: every page, then one linking pass; Python checks every section. ----

// JPEG of one page for the AI reader. PDFs are rendered again at a higher scale so small digits stay sharp.
async function pageImage(pageNumber, pdf) {
  const canvas = document.createElement("canvas");
  if (pdf) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.2 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  } else {
    const image = reviewState.pageElements.get(pageNumber)?.querySelector("img");
    if (!image) throw new Error(`Page ${pageNumber} is not available.`);
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  for (const quality of [0.85, 0.7, 0.55]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length < 4_200_000) return data;
  }
  throw new Error(`Page ${pageNumber} is too large to send. Draw an area around its price table instead.`);
}

// The PDF's own text per page (exact digits), in reading order. Images have no text layer.
function pageTextLayer(tokens) {
  const byPage = new Map();
  for (const token of tokens) {
    if (!byPage.has(token.page)) byPage.set(token.page, []);
    byPage.get(token.page).push(token);
  }
  const texts = new Map();
  for (const [page, items] of byPage) {
    items.sort((a, b) => Math.round(a.bounds.top * 250) - Math.round(b.bounds.top * 250) || a.bounds.x0 - b.bounds.x0);
    const lines = [];
    let row = -1;
    for (const item of items) {
      const top = Math.round(item.bounds.top * 250);
      if (top !== row) { lines.push([]); row = top; }
      lines[lines.length - 1].push(item.text);
    }
    texts.set(page, lines.map(words => words.join(" ")).join("\n"));
  }
  return texts;
}

function wholeBillNote(plan, count, pages) {
  const lead = `Read ${count} line${count === 1 ? "" : "s"} from ${pages} page${pages === 1 ? "" : "s"}.`;
  const linked = plan.linkedBy === "ai" ? " The pages were connected by the AI reader and checked by Python." : "";
  const status = {
    ok: " Every section adds up to its printed figure.",
    incomplete: " The parts fit together, but some of the bill has no printed total to check against.",
    mismatch: " Something does not add up: open the marked lines to see what may be missing or read twice.",
    invalid: " The proposed structure did not check out, so the lines were added without sections. Check them against the bill.",
  }[plan.status] || "";
  if (plan.linkedBy === "map") {
    return `${lead} The AI made sense of the whole bill and Python checked it: the counted lines add up exactly to the amount due. Repeats, details, earlier bills, payments and empty tables are folded away under “Shown on the bill — not counted”.${autoNote(plan)}`;
  }
  return lead + linked + status + (plan.complex ? ` ${plan.problems.at(-1)}` : "") + autoNote(plan);
}

// The AI's plain summary of the whole bill (bill_map), shown above the lines and labelled as AI.
function showBillSummary(summary) {
  let box = document.querySelector("#bill-summary");
  if (!box) {
    box = document.createElement("section");
    box.id = "bill-summary";
    box.className = "bill-summary";
    // Above the buttons and the table (owner 2026-10-20: inside the table it pushed the lines and buttons apart).
    (document.querySelector(".line-actions") || elements.candidateList).before(box);
  }
  box.hidden = !summary;
  if (!summary) return;
  const text = paragraph(summary, "bill-summary-text clamped");
  const more = document.createElement("button");
  more.type = "button";
  more.className = "link-button bill-summary-more";
  more.textContent = "Show more";
  more.addEventListener("click", () => {
    const open = text.classList.toggle("clamped") === false;
    more.textContent = open ? "Show less" : "Show more";
  });
  box.replaceChildren(paragraph("About this bill · written by AI, can be wrong", "bill-summary-title"), text, more);
  // Only offer "Show more" when the text is actually cut off.
  requestAnimationFrame(() => { more.hidden = text.scrollHeight <= text.clientHeight + 1; });
}

// Text printed on the bill that may explain a charge (PRD_SCALABLE W2): never summed, never confirmed, only given to
// the explanation. Anything that looks personal is dropped here and again on the server.
function billNotes(outputs, plan) {
  return outputs.flatMap(({ page, output }) => (output.notes || []).map(note => ({
    page, quote: note.quote, about: note.about, verified: note.verified === true,
    lineIds: (note.line_ids || []).map(id => plan.ids[`${page}:${id}`]).filter(Boolean).map(gid => `whole-${gid}`),
  }))).filter(note => !containsPossiblePrivateData(note.quote) && !containsPossiblePrivateData(note.about)).slice(0, 12);
}

// "Python checked 8 of 11 lines by maths": the person looks only at the rest (PRD_SCALABLE W4).
function autoNote(plan) {
  const counted = Object.values(plan.lines).filter(entry => entry.role !== "");
  const auto = counted.filter(entry => entry.autoVerified).length;
  if (!auto) return "";
  const rest = counted.length - auto;
  return ` Python checked ${auto} of ${counted.length} lines by maths${rest ? ` — look only at the other ${rest}` : " — nothing left to check line by line"}.`;
}

async function readWholeBill() {
  if (groqRequestRunning) return;
  if (!checkExpectedAmount()) return;
  const all = [...reviewState.pageElements.keys()];
  const pages = pagesToRead(all, reviewState.skippedPages);
  if (!all.length) { setStatus("Open your bill first.", "failure"); return; }
  if (!pages.length) { setStatus("Tick at least one page to read.", "failure"); return; }
  const which = pages.length === all.length ? `All ${pages.length} page${pages.length === 1 ? "" : "s"}` : `Page${pages.length === 1 ? "" : "s"} ${pages.join(", ")}`;
  if (!window.confirm(`${which} will be sent to ${visionName}, including any personal details on them. Continue? (Select an area on a page instead to send less.)`)) return;
  const generation = reviewGeneration;
  groqRequestRunning = true;
  refreshPageControls();
  flow.reading("reading", pages[0]);
  const outputs = [];
  try {
    const files = Array.from(elements.files.files || []);
    let pdf = null, texts = new Map(), pdfTokens = [];
    if (validSelection(files) === "pdf") {
      const pdfjs = await pdfLibrary();
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      pdfTokens = (await extractPdfTokens(bytes.slice(), { loadPdfJs: async () => pdfjs })).tokens;
      texts = pageTextLayer(pdfTokens);
      pdf = await pdfjs.getDocument({ data: bytes }).promise;
    }
    for (const [index, page] of pages.entries()) {
      setStatus(`Reading page ${index + 1} of ${pages.length} with ${visionName}… This can take up to a minute per page.`, "busy");
      const image = await pageImage(page, pdf);
      const response = await fetch("/api/read-page", {
        method: "POST", headers: apiHeaders("whole-page"),
        body: JSON.stringify({ imageBase64: image.split(",")[1], mime: "image/jpeg", wholePage: true, pageText: texts.get(page) || null }),
      });
      const result = await response.json();
      if (generation !== reviewGeneration) return;
      if (!response.ok || result.error) throw new Error(`Page ${page}: ${result.error || "reading failed"}`);
      outputs.push({ page, output: result.output, model: result.model });
    }
    // The bill's own currency before Python reads any amount (seen 2026-10-20: "₹15,800" under the default EUR was
    // refused as unreadable, so a bill that adds up was reported as not checking out).
    const currency = outputs.map(item => item.output.currency).find(value => ["EUR", "INR"].includes(value));
    if (currency && currency !== elements.currency.value) {
      elements.currency.value = currency;
      elements.currency.dispatchEvent(new Event("change"));
    }
    setStatus("Connecting the pages and checking every section with Python…", "busy");
    const response = await fetch("/api/link-pages", {
      method: "POST", headers: apiHeaders("whole-bill"),
      body: JSON.stringify({ decimalSeparator: elements.decimalSeparator.value, currency: elements.currency.value,
        pages: outputs.map(({ page, output }) => ({ page, output })) }),
    });
    const linked = await response.json();
    if (generation !== reviewGeneration) return;
    if (!response.ok || linked.error) throw new Error(linked.error || "The pages could not be connected.");
    let plan = linked.plan;
    // Owner 2026-10-20: ask the AI to make sense of the whole bill — what is counted, what is a repeat, a detail, an
    // earlier bill, a payment or an empty table — and to summarise it, for every bill. Nothing is used unless Python
    // finds that its counted lines add up exactly to the amount due. A bill that already checks out keeps its own
    // structure and only gains the summary; one that does not is replaced by the checked map.
    setStatus(plan.status === "ok" ? "Writing a short summary of your bill; Python checks it…"
      : "Some parts did not add up. Asking the AI to make sense of the whole bill; Python checks its answer…", "busy");
    try {
      const second = await fetch("/api/link-pages", {
        method: "POST", headers: apiHeaders("whole-bill"),
        body: JSON.stringify({ mode: "map", decimalSeparator: elements.decimalSeparator.value, currency: elements.currency.value,
          pages: outputs.map(({ page, output }) => ({ page, output })) }),
      });
      const mapped = second.ok ? (await second.json()).plan : null;
      if (generation !== reviewGeneration) return;
      if (mapped && plan.status !== "ok") plan = mapped;
      else if (mapped?.summary) plan = { ...plan, summary: mapped.summary };
    } catch { /* the first result stays, without a summary */ }
    useBillDecimalMark(plan.decimalMark);
    const added = outputs.flatMap(({ page, output, model }) => output.lines.map(line => {
      const gid = plan.ids[`${page}:${line.id}`];
      return visionCandidate(line, { page, area: null, sourceKey: `whole:${page}`, outputCurrency: output.currency,
        placed: plan.lines[gid], model, id: `whole-${gid}`, gid, wholePage: true });
    }));
    // PDFs: the exact printed position from the PDF's own text replaces any AI box (no guessing, see locate.mjs).
    const positions = locateAmounts(added.map(line => ({ id: line.id, page: line.page, rawAmount: JSON.parse(line.extractionSignature).amount })), pdfTokens);
    for (const line of added) {
      const bounds = positions.get(line.id);
      if (!bounds) continue;
      Object.assign(line, { precision: "exact", locatedBy: "pdf_text", bounds: { ...bounds }, region: null,
        warning: line.warning.replace(/Model source box is unverified\. Inspect it before confirming\.|Read from the whole page;[^.]*\.[^.]*\.|Read from the highlighted row[^.]*\.[^.]*\./, "Located in the PDF text.") });
    }
    // A new whole-bill reading replaces the previous one; drawn areas and typed lines are kept.
    const kept = reviewState.candidates.filter(line => !String(line.extractionSourceKey || "").startsWith("whole:"))
      .map(line => String(line.extractionSourceKey || "").startsWith("area:") ? { ...line, gid: null, structureVerified: false } : line);
    reviewState.areaReads = new Map();
    reviewState.notes = billNotes(outputs, plan);
    showBillSummary(plan.summary || null);
    reviewState.candidates = acceptVerifiedSections([...kept, ...added], added.map(line => line.id));
    reviewState.tree = plan.status === "invalid" ? null : plan.tree || null;
    reviewState.toggles = new Map();
    renderLines();
    invalidatePayload("Whole bill read. Review the lines and check them.");
    drawHighlights();
    refreshPageControls();  // updates the line count first, so the Check chapter can open
    flow.extracted(false);
    setStatus(wholeBillNote(plan, added.length, pages.length), ["mismatch", "invalid"].includes(plan.status) ? "failure" : "");
  } catch (error) {
    if (generation === reviewGeneration) {
      flow.reading("select", reviewState.activePage);
      setStatus(`${error instanceof Error ? error.message : String(error)} You can select an area on a page instead.`, "failure");
    }
  } finally { groqRequestRunning = false; refreshPageControls(); }
}

// The access code is kept only for this browser tab (sessionStorage); it protects the server's Groq key.
let session = null;          // { accessToken, refreshToken, expiresAt } for this browser's anonymous identity
let savingAvailable = true;  // false when the server has no database configured
let savedMessageId = null;

function apiHeaders(purpose) {
  const headers = { "Content-Type": "application/json", "X-BillShield-Review": purpose, "X-BillShield-Access": elements.accessCode.value.trim() };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  return headers;
}

// Anonymous identity so saved reviews stay private to this browser. Saving is optional: failures never block a review.
async function ensureSession() {
  if (!savingAvailable) return;
  if (!session) {
    try { session = JSON.parse(localStorage.getItem("billshield-session") || "null"); } catch { session = null; }
  }
  if (session && session.expiresAt > Date.now() + 60_000) return;
  // The stored pass is this browser's only key to its saved checks. It is replaced only when the database says it
  // can no longer be renewed (410); a missing access code, network or server problem keeps it for the next try.
  const request = (body) => fetch("/api/session", { method: "POST", headers: apiHeaders("session"), body: JSON.stringify(body) });
  try {
    let response = await request(session?.refreshToken ? { refreshToken: session.refreshToken } : {});
    if (response.status === 410) response = await request({});
    if (response.status === 503) { savingAvailable = false; session = null; return; }
    const answer = await response.json();
    if (!response.ok) throw new Error(answer.error || "session failed");
    session = { accessToken: answer.accessToken, refreshToken: answer.refreshToken, expiresAt: Date.now() + (answer.expiresIn || 3600) * 1000 };
    try { localStorage.setItem("billshield-session", JSON.stringify(session)); } catch { /* storage unavailable */ }
  } catch {
    session = null;  // continue without saving this time; the stored pass is left untouched
  }
}

// "Your earlier checks" (Chapter 1). Only a browser that has saved before has a session; listing never creates one.
function storedSession() {
  try { return session || JSON.parse(localStorage.getItem("billshield-session") || "null"); } catch { return null; }
}
const savedChecks = createSavedChecks({
  hasSession: () => Boolean(storedSession()?.refreshToken),
  accessMissing: () => !elements.accessBox.hidden && !elements.accessCode.value.trim(),
  api: async (path, body) => {
    await ensureSession();
    const response = await fetch(path, { method: "POST", headers: apiHeaders("saved-checks"), body: JSON.stringify(body) });
    const answer = await response.json();
    if (!response.ok) throw new Error(answer.error || "Request failed.");
    return answer;
  },
});

function showSaved(output) {
  savedMessageId = output.saved?.messageId || null;
  elements.sentNote.textContent = "";
  elements.markSent.disabled = !savedMessageId;
  if (savedMessageId) savedChecks.load();
  if (savedMessageId) elements.saveNote.textContent = "✓ Saved to your private history (this browser only): the checked lines, the result and this draft. No bill image or OCR text is stored.";
  else if (output.saveError) elements.saveNote.textContent = output.saveError;
  else elements.saveNote.textContent = savingAvailable ? "" : "Saving is not switched on for this server.";
}

async function recordEvent(action, finalText = null) {
  if (!savedMessageId) return null;
  await ensureSession();
  const response = await fetch(`/api/messages/${encodeURIComponent(savedMessageId)}/events`, {
    method: "POST", headers: apiHeaders("message-event"), body: JSON.stringify({ action, finalText, tone: messageTone, draftShown: draftFor(messageTone) }),
  });
  const answer = await response.json();
  if (!response.ok) throw new Error(answer.error || "Could not record this.");
  return answer;
}

async function showAccessBoxIfNeeded() {
  try { elements.accessCode.value = sessionStorage.getItem("billshield-access") || ""; } catch { /* storage unavailable */ }
  try {
    const health = await (await fetch("/api/health")).json();
    elements.accessBox.hidden = !health.accessCodeRequired;
    if (health.visionReader) {
      visionName = health.visionReader;
      document.querySelectorAll(".vision-name").forEach(node => { node.textContent = visionName; });
    }
  } catch { elements.accessBox.hidden = false; }
}

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = `status ${kind}`.trim();
}

function clearObjectUrls() {
  reviewState.objectUrls.forEach((url) => URL.revokeObjectURL(url));
}

function hideResult() {
  savedMessageId = null;
  if (elements.saveNote) { elements.saveNote.textContent = ""; elements.sentNote.textContent = ""; elements.sentText.value = ""; elements.markSent.disabled = true; }
  elements.resultPanel.hidden = true;
  elements.draftText.value = "";
  elements.draftNote.textContent = "";
  elements.resultSuspects.replaceChildren();
  [elements.resultSummary, elements.resultChecks, elements.resultLines, elements.resultMissing, elements.resultGap].forEach((node) => node.replaceChildren());
}

function invalidatePayload(message = "Changes not yet previewed.") {
  flow.invalidated();
  reviewState.payload = null;
  reviewState.rechecked = false;
  elements.downloadPayload.disabled = true;
  elements.analyze.disabled = true;
  elements.payloadOutput.textContent = message;
  hideResult();
}

function resetReview({ keepFiles = false } = {}) {
  reviewGeneration += 1;
  pendingGroq = null;
  groqDialog.close();
  document.querySelector("#manual-line-dialog").close();
  clearObjectUrls();
  reviewState = emptyState();
  showBillSummary(null);
  document.querySelector("#page-progress")?.replaceChildren();
  document.querySelector("#undo-remove").hidden = true;
  document.querySelector("#accept-all-lines").checked = false;
  document.querySelector("#accept-all-lines").indeterminate = false;
  document.querySelector("#accept-all-lines").disabled = true;
  document.querySelector("#accept-all-hint").textContent = "No lines yet. This confirms what was read—not whether the bill adds up.";
  elements.pages.replaceChildren();
  elements.candidateList.replaceChildren();
  reviewState.tree = null;
  elements.review.hidden = true;
  elements.payloadPanel.hidden = true;
  elements.payloadError.textContent = "";
  invalidatePayload("Confirm the relevant lines, then build the preview.");
  if (!keepFiles) {
    elements.files.value = "";
    document.querySelector("#selected-file").textContent = "or click to choose · one bill · up to 10 pages";
    elements.expectedAmount.value = "";
    elements.messageType.value = "automatic";
    elements.earlierPeriodGroup.value = "";
  }
  flow.reset();
}

function validSelection(files) {
  if (!files.length) throw new Error("Choose a masked PDF or image first.");
  const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  const images = files.filter((file) => /^image\/(jpeg|png)$/.test(file.type));
  if (pdfs.length === 1 && files.length === 1) return "pdf";
  if (images.length === files.length) return "images";
  throw new Error("Choose one PDF, or one or more JPEG/PNG pages. Do not mix PDFs and images.");
}

async function pdfLibrary() {
  const pdfjs = await import("./vendor/pdfjs/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";
  return pdfjs;
}

// Rounding (owner 2026-10-19): Python names a 1-2 cent gap and the exact adjustment, written as the bill writes
// amounts. The person adds it with one click as a visible line "Rounding difference (added by you)"; Python checks the
// whole bill again with it on Looks right. Nothing is absorbed silently; at most one rounding line per printed figure.
function roundingButton(candidate) {
  // One rounding line per printed figure (a bill with electricity and gas can be a cent off in each part).
  if (!candidate?.rounding || reviewState.candidates.some(line => line.roundingFor === candidate.gid)) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary rounding-button";
  button.textContent = `Add ${candidate.rounding.raw} rounding`;
  button.addEventListener("click", () => addRounding(candidate));
  return button;
}

function addRounding(candidate) {
  const fields = manualCandidateFields({ page: candidate.page, role: "adjustment", description: "Rounding difference (added by you)",
    rawAmount: candidate.rounding.raw, group: candidate.role === "subtotal" ? candidate.group : "" });
  reviewState.candidates = reviewState.candidates.map(line => line.id === candidate.id ? { ...line, attention: null } : line);
  addCandidate(newCandidate({ ...fields, id: `rounding-${crypto.randomUUID()}`, roundingFor: candidate.gid, confirmed: true,
    context: "Added by you to settle a rounding difference that Python found.", warning: "" }),
    `Rounding line of ${candidate.rounding.raw} added. Python checks the whole bill again when you press Looks right — check it.`);
}

function addCandidate(candidate, message) {
  reviewState.candidates.push(candidate);
  renderLines();
  refreshPageControls();
  flow.extracted();
  elements.candidateCount.textContent = `${reviewState.candidates.length} to review`;
  invalidatePayload();
  drawHighlights();
  setStatus(message);
  document.querySelector(`[data-card-id="${CSS.escape(candidate.id)}"] input[data-field="amount"]`)?.focus();
}

function pageShell(pageNumber) {
  const tools = document.createElement("div");
  tools.className = "page-tools";
  const manual = document.createElement("button");
  manual.type = "button";
  manual.className = "secondary";
  manual.textContent = `Draw a box around a missed amount · page ${pageNumber}`;
  const typed = document.createElement("button");
  typed.type = "button";
  typed.className = "secondary";
  typed.textContent = `Type an amount seen on page ${pageNumber} (no box)`;
  const vision = document.createElement("button");
  vision.type = "button";
  vision.className = "primary";
  vision.textContent = "Select area to read";
  vision.dataset.selectArea = String(pageNumber);
  tools.append(manual, typed);
  const pageToolbar = document.createElement("div");
  pageToolbar.className = "page-read-toolbar";
  pageToolbar.dataset.page = String(pageNumber);
  const retryArea = document.createElement("button");
  retryArea.type = "button";
  retryArea.className = "secondary retry-area";
  retryArea.dataset.page = String(pageNumber);
  retryArea.textContent = "Use last selection";
  retryArea.disabled = true;
  retryArea.addEventListener("click", () => {
    if (groqRequestRunning) { setStatus("Wait for the current reading to finish."); return; }
    const area = reviewState.lastAreas.get(pageNumber);
    if (area) previewGroqArea(pageNumber, area);
  });
  pageToolbar.append(vision, retryArea);
  elements.pages.append(pageToolbar);
  const pageOptions = document.createElement("details");
  pageOptions.className = "page-options";
  pageOptions.dataset.page = String(pageNumber);
  const optionsTitle = document.createElement("summary");
  optionsTitle.textContent = "More options · add a missed line";
  pageOptions.append(optionsTitle, tools);
  elements.pages.append(pageOptions);
  const shell = document.createElement("div");
  shell.className = "page-shell";
  shell.dataset.page = String(pageNumber);
  const label = document.createElement("span");
  label.className = "page-label";
  label.textContent = `Page ${pageNumber}`;
  shell.append(label);
  elements.pages.append(shell);
  reviewState.pageElements.set(pageNumber, shell);
  let selecting = false;
  let selectionMode = "manual";
  let sourceCandidateId = null;
  shell.startGroqSelection = () => vision.click();
  shell.selectSource = (candidateId) => {
    reviewState.activePage = pageNumber;
    refreshPageControls();
    selectionMode = "source";
    sourceCandidateId = candidateId;
    selecting = true;
    shell.classList.add("selecting");
    shell.scrollIntoView({ behavior: "smooth", block: "center" });
    setStatus("Optional: draw a box around this exact amount. The amount and label stay filled in.");
  };
  let start = null;
  let selectionMark = null;
  const point = (event) => {
    const rect = shell.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  manual.addEventListener("click", () => {
    selectionMode = "manual";
    selecting = !selecting;
    shell.classList.toggle("selecting", selecting);
    manual.textContent = selecting ? "Draw a box around the amount · click here to cancel" : `Draw a box around a missed amount · page ${pageNumber}`;
    setStatus(selecting ? "Drag a box around the amount on the bill. Then enter its exact value, label and role in the new card." : "Manual selection cancelled.");
  });
  typed.addEventListener("click", () => {
    addCandidate(newCandidate({
      id: `manual-${crypto.randomUUID()}`, page: pageNumber, extractor: "manual", precision: "page",
      context: `Typed from page ${pageNumber}. Evidence is page-level: no exact position is recorded.`,
      warning: "Type the amount exactly as printed, including its decimal mark and a minus sign for discounts. Omit the currency symbol.",
    }), `Page-level line added for page ${pageNumber}. Keep the page visible while you type the amount, label and role.`);
  });
  vision.addEventListener("click", () => {
    if (groqRequestRunning) { setStatus("Wait for the current vision request to finish."); return; }
    selectionMode = "groq";
    reviewState.activePage = pageNumber;
    refreshPageControls();
    flow.reading("select", pageNumber);
    selecting = true;
    shell.classList.add("selecting");
    setStatus(`Page ${pageNumber}: draw a box around the charge labels and prices. Next, check the preview before reading.`);
  });
  shell.addEventListener("pointerdown", (event) => {
    if (!selecting) return;
    event.preventDefault();
    start = point(event);
    shell.setPointerCapture(event.pointerId);
    selectionMark = document.createElement("div");
    selectionMark.className = "highlight manual-selection";
    shell.append(selectionMark);
  });
  shell.addEventListener("pointermove", (event) => {
    if (!selecting || !start) return;
    const end = point(event);
    Object.assign(selectionMark.style, { left: `${Math.min(start.x, end.x) * 100}%`, top: `${Math.min(start.y, end.y) * 100}%`, width: `${Math.abs(end.x - start.x) * 100}%`, height: `${Math.abs(end.y - start.y) * 100}%` });
  });
  shell.addEventListener("pointerup", (event) => {
    if (!selecting || !start) return;
    const end = point(event);
    const bounds = { x0: Math.min(start.x, end.x), top: Math.min(start.y, end.y), x1: Math.max(start.x, end.x), bottom: Math.max(start.y, end.y) };
    selectionMark?.remove();
    start = null;
    if (bounds.x1 - bounds.x0 < 0.003 || bounds.bottom - bounds.top < 0.003) {
      setStatus("The box was too small. Drag around the full amount.");
      return;
    }
    selecting = false;
    shell.classList.remove("selecting");
    manual.textContent = `Draw a box around a missed amount · page ${pageNumber}`;
    if (selectionMode === "groq") {
      previewGroqArea(pageNumber, bounds);
      return;
    }
    if (selectionMode === "source") {
      // The person drew this box around the amount, so it is now exact evidence located by the user.
      const index = reviewState.candidates.findIndex((item) => item.id === sourceCandidateId);
      reviewState.candidates[index] = { ...reviewState.candidates[index], precision: "exact", locatedBy: "user", bounds, region: null,
        warning: "Exact location marked by you. Check the amount and label, then confirm." };
      document.querySelector(`[data-card-id="${CSS.escape(sourceCandidateId)}"]`)?.replaceWith(candidateCard(reviewState.candidates[index]));
      invalidatePayload();
      drawHighlights();
      setStatus("Exact location added. Check the amount, then confirm the line.");
      return;
    }
    addCandidate(newCandidate({
      id: `manual-${crypto.randomUUID()}`, page: pageNumber, extractor: "manual", precision: "exact", locatedBy: "user", bounds,
      context: "Manually selected source area. Type the amount exactly as printed, including its decimal mark. Omit the currency symbol.",
      warning: "Manual entry: check the value and source box, then confirm.",
    }), "Manual line added. Enter its amount, label and role, check the source box, then confirm it.");
  });
  shell.addEventListener("pointercancel", () => { start = null; selectionMark?.remove(); });
  return shell;
}

async function renderPdf(file, pdfjs) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const shell = pageShell(pageNumber);
    shell.append(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }
}

async function renderImages(files) {
  for (const [index, file] of files.entries()) {
    const page = index + 1;
    const url = URL.createObjectURL(file);
    reviewState.objectUrls.push(url);
    const image = new Image();
    image.alt = `Selected masked bill page ${page}`;
    image.src = url;
    await image.decode();
    const shell = pageShell(page);
    shell.append(image);
  }
}

function localOcrWorker(progress) {
  return async (language) => {
    const { createWorker, OEM } = (await import("./vendor/tesseract/tesseract.esm.min.js")).default;
    return createWorker(language, OEM.LSTM_ONLY, {
      workerPath: "/vendor/tesseract/worker.min.js",
      corePath: "/vendor/tesseract-core",
      langPath: "/vendor/tesseract-eng",
      logger: progress,
    });
  };
}

async function extractImages(files) {
  const tokens = [];
  for (const [index, file] of files.entries()) {
    const page = index + 1;
    setStatus(`Reading image page ${page} of ${files.length} locally…`, "busy");
    if (file.size > 4_000_000) throw new Error("Image is too large; limit is 4000000 bytes");
    const prepared = await prepareImage(file);
    let pageTokens = await extractImageTokens(prepared, {
      createWorker: localOcrWorker((message) => {
        const percent = Number.isFinite(message.progress) ? ` ${Math.round(message.progress * 100)}%` : "";
        setStatus(`Page ${page}: ${message.status || "working"}${percent}`, "busy");
      }),
    });
    if (findAmountCandidates(pageTokens).length === 0) {
      setStatus(`Page ${page}: trying a second local reading for missed amounts…`, "busy");
      const retryTokens = await extractImageTokens(prepared, {
        createWorker: localOcrWorker(() => {}),
        segmentationMode: "11",
      });
      if (findAmountCandidates(retryTokens).length > 0) pageTokens = retryTokens;
    }
    tokens.push(...pageTokens.map((token, tokenIndex) => Object.freeze({
      ...token,
      id: `p${page}-o${tokenIndex + 1}`,
      page,
    })));
  }
  return tokens;
}

function placeBox(node, box) {
  node.style.left = `${box.x0 * 100}%`;
  node.style.top = `${box.top * 100}%`;
  node.style.width = `${(box.x1 - box.x0) * 100}%`;
  node.style.height = `${(box.bottom - box.top) * 100}%`;
}

function drawHighlights() {
  document.querySelectorAll(".highlight, .table-area").forEach((highlight) => highlight.remove());
  const drawnRegions = new Set();
  for (const candidate of reviewState.candidates) {
    const shell = reviewState.pageElements.get(candidate.page);
    if (!shell) continue;
    if (candidate.precision === "table" && candidate.region) {
      // One dashed outline per table area, explicitly labelled as not an amount location.
      const key = regionKey(candidate.page, candidate.region);
      if (drawnRegions.has(key)) continue;
      drawnRegions.add(key);
      const area = document.createElement("div");
      area.className = "table-area";
      area.dataset.regionKey = key;
      area.title = "Read by the AI reader from this area (see the legend above the page)";
      placeBox(area, candidate.region);
      shell.append(area);
      continue;
    }
    if (candidate.precision !== "exact" || !candidate.bounds) continue;
    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = `highlight${candidate.confirmed ? " confirmed" : ""}`;
    mark.dataset.candidateId = candidate.id;
    mark.title = `Candidate amount ${candidate.rawAmount}`;
    mark.setAttribute("aria-label", `Show candidate ${candidate.rawAmount} on page ${candidate.page}`);
    placeBox(mark, candidate.bounds);
    mark.addEventListener("click", () => focusCandidate(candidate.id));
    shell.append(mark);
  }
}

function focusCandidate(candidateId) {
  if (!document.querySelector(`[data-card-id="${CSS.escape(candidateId)}"]`)) {
    const gid = reviewState.candidates.find(line => line.id === candidateId)?.gid;
    const open = (nodes, trail) => nodes.some(node => {
      const path = [...trail, node.id];
      if (node.rows.includes(gid) || node.printedLineId === gid) { path.forEach(id => reviewState.toggles.set(id, false)); return true; }
      return open(node.sections, path);
    });
    if (gid && reviewState.tree) open(reviewState.tree, []);
    if (reviewState.candidates.find(line => line.id === candidateId)?.reference) reviewState.toggles.set("references", false);
    renderLines();
  }
  if (!reviewState.candidates.some((item) => item.id === candidateId)) return;
  showOnBill([candidateId], candidateId);
  document.querySelector(`[data-card-id="${CSS.escape(candidateId)}"] input[data-field="description"]`)?.focus({ preventScroll: true });
}

// Light up these lines on the bill (only these) and bring the first one into view. A section or total lights up
// every line inside it; a single line lights up alone.
function showOnBill(candidateIds, sourceId = null) {
  document.querySelectorAll(".highlight.active, .table-area.active, .page-shell.active").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll("#candidate-list .showing").forEach((node) => node.classList.remove("showing"));
  if (sourceId) document.querySelector(`#candidate-list [data-node-id="${CSS.escape(sourceId)}"], #candidate-list [data-card-id="${CSS.escape(sourceId)}"]`)?.classList.add("showing");
  const lines = candidateIds.map((id) => reviewState.candidates.find((item) => item.id === id)).filter(Boolean);
  if (!lines.length) return;
  const targets = lines.map((candidate) => candidate.precision === "exact"
    ? document.querySelector(`.highlight[data-candidate-id="${CSS.escape(candidate.id)}"]`)
    : candidate.precision === "table" ? document.querySelector(`.table-area[data-region-key="${CSS.escape(regionKey(candidate.page, candidate.region))}"]`)
    : reviewState.pageElements.get(candidate.page));
  targets.forEach((target) => target?.classList.add("active"));
  reviewState.activePage = lines[0].page;
  refreshPageControls();
  const target = targets[0];
  // Scroll only the bill panel, so the line list (where the person clicked) stays where it is.
  const panel = target?.closest(".document-panel");
  if (panel) {
    const box = target.getBoundingClientRect(), view = panel.getBoundingClientRect();
    panel.scrollBy({ top: box.top - view.top - view.height / 2 + box.height / 2, behavior: "smooth" });
  } else target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Every line inside a section or part (its own rows, its sections' rows and its printed figure).
function linesInNode(nodeId) {
  const find = (nodes) => { for (const node of nodes || []) { if (node.id === nodeId) return node; const inner = find(node.sections); if (inner) return inner; } return null; };
  const node = find(reviewState.tree);
  if (!node) return [];
  const gids = new Set();
  const collect = (part) => { [part.printedLineId, ...part.rows].filter(Boolean).forEach((gid) => gids.add(gid)); part.sections.forEach(collect); };
  collect(node);
  return reviewState.candidates.filter((line) => gids.has(line.gid) || (line.roundingFor && gids.has(line.roundingFor))).map((line) => line.id);
}

function updateCandidate(candidateId, field, value) {
  const index = reviewState.candidates.findIndex((candidate) => candidate.id === candidateId);
  const candidate = reviewState.candidates[index];
  const affectsValue = ["rawAmount", "description", "role", "group", "breakdown", "currency"].includes(field);
  reviewState.candidates[index] = { ...candidate, [field]: value, ...(affectsValue ? {confirmed: false, edited: true} : {}),
    ...(affectsValue || field === "confirmed" ? {autoVerified: false} : {}), attention: null };
  if (affectsValue) queueMicrotask(refreshTreeHeaders);
  if (affectsValue && candidate.structureVerified) {
    // Python's tick was for the section as read; after any edit only a new check can confirm it.
    const section = String(candidate.group || "").trim().toLowerCase();
    reviewState.candidates = reviewState.candidates.map(line => line.id === candidateId ||
      (line.structureVerified && String(line.group || "").trim().toLowerCase() === section)
        ? { ...line, structureVerified: false, ...(line.autoVerified ? {autoVerified: false, confirmed: false} : {}) } : line);
    document.querySelectorAll(".line-section.verified").forEach(node => {
      const card = node.closest("[data-card-id]");
      if (!reviewState.candidates.find(line => line.id === card?.dataset.cardId)?.structureVerified) {
        node.classList.remove("verified");
        node.textContent = node.textContent.replace(" · ✓ adds up", "");
      }
    });
  }
  invalidatePayload();
  document.querySelector(`[data-card-id="${CSS.escape(candidateId)}"] .attention`)?.remove();
  const card = document.querySelector(`[data-card-id="${CSS.escape(candidateId)}"]`);
  card?.classList.toggle("confirmed", reviewState.candidates[index].confirmed);
  const lineCheckbox = card?.querySelector(".candidate-top input[type='checkbox']");
  if (lineCheckbox) lineCheckbox.checked = reviewState.candidates[index].confirmed;
  if (card) updateLineOverview(card, reviewState.candidates[index]);
  drawHighlights();
  refreshPrintedCheck();
  if (affectsValue) setStatus("Line changed. Check it against the bill and accept it again before calculating.");
}

function animatedCandidateCard(candidate, index) {
  const card = candidateCard(candidate);
  card.classList.add("new-line");
  card.style.setProperty("--row-delay", `${rowRevealDelay(index)}ms`);
  card.addEventListener("animationend", () => card.classList.remove("new-line"), {once: true});
  return card;
}

function evidenceText(candidate) {
  if (candidate.precision === "exact") return `Exact location on page ${candidate.page} · located by ${LOCATOR_LABELS[candidate.locatedBy] || "unknown"}`;
  if (candidate.precision === "table") return `Table area on page ${candidate.page} · exact position not known`;
  return `Page ${candidate.page} only · no position recorded`;
}

function updateLineOverview(card, candidate) {
  const { title, period } = splitPeriod(candidate.description || "Add a label");
  const name = card.querySelector(".line-name");
  name.textContent = "";
  const titleNode = document.createElement("span");
  titleNode.className = "line-title";
  titleNode.textContent = title;
  name.append(titleNode);
  if (period) {
    const periodNode = document.createElement("small");
    periodNode.className = "line-sub";
    periodNode.textContent = period;
    name.append(periodNode);
  }
  card.querySelector(".line-kind").textContent = PILL_LABELS[candidate.role] || "Choose type";
  card.querySelector(".line-amount").textContent = candidate.rawAmount || "Add amount";
  card.classList.toggle("printed-total", candidate.role === "total" || candidate.role === "subtotal");
  // In the bill's hierarchy the row shows only what the line is (owner): page and section are visible from the
  // tree and the eye. Without a hierarchy (drawn areas, typed lines) the page is still shown.
  if (reviewState.tree) return;
  const pageLabel = document.createElement("small");
  pageLabel.className = "line-page";
  pageLabel.textContent = `Page ${candidate.page}`;
  card.querySelector(".line-name").append(pageLabel);
  if (candidate.sectionPath) {
    // The printed section this line sits in, as Groq proposed it; the tick only when Python verified the section.
    const section = document.createElement("small");
    section.className = `line-section${candidate.structureVerified ? " verified" : ""}`;
    section.textContent = candidate.sectionPath + (candidate.structureVerified ? " · ✓ adds up" : "");
    card.querySelector(".line-name").append(section);
  }
  card.querySelector(".line-kind").textContent = PILL_LABELS[candidate.role] || "Choose type";
  card.querySelector(".line-amount").textContent = candidate.rawAmount || "Add amount";
  card.classList.toggle("printed-total", candidate.role === "total" || candidate.role === "subtotal");
}

function candidateCard(candidate) {
  if (candidate.reference) return referenceCard(candidate);
  const card = document.createElement("article");
  card.className = `candidate-card${candidate.confirmed ? " confirmed" : ""}${candidate.autoVerified ? " auto-verified" : ""}`;
  card.dataset.cardId = candidate.id;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-line";
  remove.textContent = "×";
  remove.title = "Remove this line (Undo available)";
  remove.setAttribute("aria-label", `Remove line from page ${candidate.page}: ${candidate.description || "unlabelled"}`);
  remove.addEventListener("click", () => {
    const removed = removeCandidateById(reviewState.candidates, candidate.id);
    if (!removed.removed) return;
    reviewState.candidates = removed.lines;
    reviewState.removedLines.push({line: removed.removed, index: removed.index});
    card.remove();
    invalidatePayload();
    drawHighlights();
    refreshPageControls();
    refreshTreeHeaders();
    document.querySelector("#undo-remove").hidden = false;
    setStatus("Line removed from this review. Undo remove restores it. Previously saved reviews are unchanged.");
  });
  card.append(remove);
  const top = document.createElement("div");
  top.className = "candidate-top";
  const confirm = document.createElement("label");
  confirm.className = "confirm-control";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = candidate.confirmed;
  checkbox.addEventListener("change", () => updateCandidate(candidate.id, "confirmed", checkbox.checked));
  confirm.append(checkbox, document.createTextNode(candidate.autoVerified ? "✓ Checked by maths" : "I checked this against the bill"));
  const locate = document.createElement("button");
  locate.type = "button";
  locate.className = "page-button";
  locate.textContent = candidate.precision === "page" ? `Show page ${candidate.page}` : `Show on page ${candidate.page}`;
  locate.addEventListener("click", () => focusCandidate(candidate.id));
  top.append(confirm, locate);
  const evidence = document.createElement("p");
  evidence.className = `evidence evidence-${candidate.precision}`;
  evidence.textContent = evidenceText(candidate);
  if (candidate.precision !== "exact") {
    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = "link-button";
    mark.textContent = "Mark exact location (optional)";
    mark.addEventListener("click", () => reviewState.pageElements.get(candidate.page)?.selectSource(candidate.id));
    evidence.append(" ", mark);
  }
  const context = document.createElement("p");
  context.className = "context";
  context.textContent = candidate.context || "No nearby text was detected.";
  const warning = document.createElement("p");
  warning.className = "hint";
  warning.textContent = candidate.autoVerified
    ? "Python checked this line: its part adds up exactly to the figure printed on the bill. Change it only if something looks wrong."
    : candidate.warning || "Check every digit and decimal mark against the source before using this line.";
  const fields = document.createElement("div");
  fields.className = "candidate-fields";
  const amountLabel = document.createElement("label");
  amountLabel.append(document.createTextNode("Amount as printed"));
  const amount = document.createElement("input");
  amount.value = candidate.rawAmount;
  amount.inputMode = "decimal";
  amount.dataset.field = "amount";
  amount.addEventListener("input", () => updateCandidate(candidate.id, "rawAmount", amount.value));
  amountLabel.append(amount);
  const descriptionLabel = document.createElement("label");
  descriptionLabel.append(document.createTextNode("Short charge label"));
  const description = document.createElement("input");
  description.placeholder = "For example: Delivery fee";
  description.value = candidate.description || "";
  description.dataset.field = "description";
  description.addEventListener("input", () => updateCandidate(candidate.id, "description", description.value));
  descriptionLabel.append(description);
  const roleLabel = document.createElement("label");
  roleLabel.append(document.createTextNode("Type of amount"));
  const role = document.createElement("select");
  role.dataset.field = "role";
  role.append(new Option("Choose…", ""), ...Object.entries(ROLE_LABELS).map(([value, text]) => new Option(text, value)));
  role.value = candidate.role;
  role.addEventListener("change", () => updateCandidate(candidate.id, "role", role.value));
  roleLabel.append(role);
  const groupLabel = document.createElement("label");
  groupLabel.append(document.createTextNode("Section name (advanced)"));
  const group = document.createElement("input");
  group.placeholder = "For example: September";
  group.value = candidate.group || "";
  group.addEventListener("input", () => updateCandidate(candidate.id, "group", group.value));
  groupLabel.append(group);
  fields.append(amountLabel, descriptionLabel, roleLabel);
  const sectionEditor = document.createElement("details");
  sectionEditor.className = "section-editor";
  const sectionTitle = document.createElement("summary");
  sectionTitle.textContent = candidate.role === "subtotal" ? "Change which lines belong together" : "Section (advanced)";
  sectionEditor.append(sectionTitle, groupLabel);
  fields.append(sectionEditor);
  if (candidate.role === "subtotal") {
    const picker = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = "Choose the charges and discounts in this part of the bill";
    picker.append(legend);
    const choices = [];
    const suggestedIds = new Set(suggestSection(reviewState.candidates, candidate.id).map(line => line.id));
    for (const line of reviewState.candidates.filter(line => ["charge", "discount", "adjustment"].includes(line.role))) {
      const label = document.createElement("label");
      label.className = "confirm-control";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = sectionAccepted(reviewState.candidates, candidate.id)
        ? sectionMembers(reviewState.candidates, candidate.id).some(member => member.id === line.id)
        : suggestedIds.has(line.id);
      choices.push({box, id: line.id});
      label.append(box, document.createTextNode(`Page ${line.page}: ${line.description} — ${line.rawAmount}`));
      picker.append(label);
    }
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "secondary";
    apply.textContent = "Save these lines";
    apply.addEventListener("click", () => {
      try {
        acceptSection(candidate.id, choices.filter(choice => choice.box.checked).map(choice => choice.id));
      } catch (error) { setStatus(error.message, "failure"); }
    });
    picker.append(apply);
    sectionEditor.append(picker);
  }
  const questioned = document.createElement("label");
  questioned.className = "confirm-control";
  const questionedBox = document.createElement("input");
  questionedBox.type = "checkbox";
  questionedBox.checked = candidate.questioned;
  questionedBox.addEventListener("change", () => updateCandidate(candidate.id, "questioned", questionedBox.checked));
  questioned.append(questionedBox, document.createTextNode("Ask about this line in the message"));
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "secondary";
  retry.textContent = "Retry OCR on this amount";
  retry.disabled = candidate.precision !== "exact" || !candidate.bounds;
  retry.addEventListener("click", async () => {
    retry.disabled = true;
    let worker;
    try {
      const source = reviewState.pageElements.get(candidate.page)?.querySelector("canvas, img");
      if (!source) throw new Error("Source page is unavailable.");
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      const padding = 0.008;
      const left = Math.max(0, candidate.bounds.x0 - padding) * width;
      const top = Math.max(0, candidate.bounds.top - padding) * height;
      const cropWidth = Math.min(width - left, (candidate.bounds.x1 - candidate.bounds.x0 + padding * 2) * width);
      const cropHeight = Math.min(height - top, (candidate.bounds.bottom - candidate.bounds.top + padding * 2) * height);
      const crop = document.createElement("canvas");
      crop.width = Math.ceil(cropWidth * 4);
      crop.height = Math.ceil(cropHeight * 4);
      crop.getContext("2d").drawImage(source, left, top, cropWidth, cropHeight, 0, 0, crop.width, crop.height);
      worker = await localOcrWorker(() => {})("eng");
      await worker.setParameters({ tessedit_pageseg_mode: "7" });
      const result = await worker.recognize(crop);
      const suggestion = String(result.data.text || "").trim();
      warning.textContent = suggestion
        ? `Second OCR reading: ${suggestion}. Compare with the source, then type the correct amount above. Your current amount has not been changed.`
        : "The retry could not read this area. Please type the amount from the source.";
    } catch (error) {
      warning.textContent = `Retry failed: ${error.message}. You can still correct the amount manually.`;
    } finally {
      if (worker) await worker.terminate();
      retry.disabled = false;
    }
  });
  if (candidate.attention) {
    const attention = document.createElement("p");
    attention.className = `attention${candidate.rounding ? " rounding" : ""}`;
    attention.textContent = candidate.attention;
    const fix = roundingButton(candidate);
    if (fix) attention.append(" ", fix);
    card.append(attention);
  }
  const editor = document.createElement("details");
  editor.className = "line-editor";
  editor.open = Boolean(candidate.attention || (!reviewState.tree && (!candidate.role || !candidate.rawAmount || !candidate.description)));
  const overview = document.createElement("summary");
  overview.className = "line-overview";
  // Clicking a line shows where it is on the bill and opens it for fixing (owner: no separate "Where" column).
  overview.addEventListener("click", () => { if (!editor.open) setTimeout(() => focusCandidate(candidate.id), 0); });
  overview.innerHTML = '<span class="line-name"></span><span class="line-kind"></span><span class="line-amount"></span>';
  editor.append(overview, top, fields);
  card.append(editor);
  updateLineOverview(card, candidate);
  const more = document.createElement("details");
  more.className = "line-details";
  more.innerHTML = "<summary>Source &amp; row details</summary>";
  more.append(evidence, context, warning);
  if (candidate.breakdown) more.append(rowColumnsEditor(candidate));
  more.append(questioned, retry);
  editor.append(more);
  return card;
}

// The row's printed columns. Python checks quantity × price − discount (= taxable value) + taxes = row amount.
function rowColumnsEditor(candidate) {
  const box = document.createElement("fieldset");
  box.className = "row-columns";
  const legend = document.createElement("legend");
  legend.textContent = "Row columns as printed (Python checks they add up to the amount)";
  box.append(legend);
  const fields = [["quantity", "Qty"], ["unitPrice", "Unit price"], ["discount", "Discount"], ["taxableValue", "Taxable value"], ["tax0", "Tax 1"], ["tax1", "Tax 2"]];
  for (const [key, name] of fields) {
    const label = document.createElement("label");
    label.append(document.createTextNode(name));
    const input = document.createElement("input");
    input.inputMode = "decimal";
    const taxIndex = key.startsWith("tax") && key !== "taxableValue" ? Number(key.slice(3)) : null;
    input.value = taxIndex === null ? (candidate.breakdown[key] || "") : (candidate.breakdown.taxes[taxIndex] || "");
    input.addEventListener("input", () => {
      const current = reviewState.candidates.find((item) => item.id === candidate.id).breakdown;
      const next = { ...current, taxes: [...current.taxes] };
      if (taxIndex === null) next[key] = input.value; else next.taxes[taxIndex] = input.value;
      updateCandidate(candidate.id, "breakdown", next);
    });
    label.append(input);
    box.append(label);
  }
  return box;
}

function showCandidates(tokens, extractor) {
  const candidates = findAmountCandidates(tokens).map((candidate) => newCandidate({
    id: candidate.id, page: candidate.page, rawAmount: candidate.rawAmount, extractedRawAmount: candidate.rawAmount,
    currency: candidate.currency || elements.currency.value, extractor,
    precision: "exact", locatedBy: extractor, bounds: candidate.bounds,
    warning: candidate.warning || "", context: nearbyText(candidate, tokens),
  }));
  reviewState.tokens = tokens;
  reviewState.extractor = extractor;
  reviewState.candidates = candidates;
  elements.candidateList.replaceChildren(...candidates.map(animatedCandidateCard));
  elements.candidateCount.textContent = `${candidates.length} found`;
  drawHighlights();
  elements.review.hidden = false;
  elements.payloadPanel.hidden = false;
  refreshPageControls();
  flow.opened(candidates.length > 0);
}

function refreshPageControls() {
  let progress = document.querySelector("#page-progress");
  if (!progress) {
    progress = document.createElement("nav");
    progress.id = "page-progress";
    progress.className = "page-progress";
    progress.setAttribute("aria-label", "Bill pages and extracted lines");
    elements.pages.before(progress);
  }
  progress.replaceChildren();
  const pages = [...reviewState.pageElements.keys()];
  flow.linesChanged(reviewState.candidates.length);
  elements.candidateCount.textContent = `${reviewState.candidates.length} lines`;
  document.querySelectorAll(".retry-area").forEach(button => {
    button.disabled = groqRequestRunning || !reviewState.lastAreas.has(Number(button.dataset.page));
  });
  document.querySelectorAll("[data-select-area]").forEach(button => { button.disabled = groqRequestRunning; });
  const wholeButton = document.querySelector("#read-whole-bill");
  const chosen = pagesToRead(pages, reviewState.skippedPages);
  if (wholeButton) {
    wholeButton.disabled = groqRequestRunning || !chosen.length || Boolean(reviewState.pageSelectError);
    wholeButton.textContent = readButtonText(chosen.length, pages.length);
  }
  // "Select pages" (owner sketch): a short field such as "1-2"; only these pages go to the AI reader.
  const choice = document.querySelector("#page-choice");
  if (choice) {
    choice.hidden = pages.length < 2;
    const input = choice.querySelector("#page-select");
    if (document.activeElement !== input && !reviewState.pageSelectError) input.value = formatPageList(chosen);
    input.disabled = groqRequestRunning;
    input.classList.toggle("invalid", Boolean(reviewState.pageSelectError));
    choice.querySelector("#page-select-hint").textContent = reviewState.pageSelectError
      || `This bill has ${pages.length} pages. Type for example 1-${pages.length} or 1.`;
  }
  for (const child of elements.pages.children) {
    if (child.dataset.page) child.hidden = Number(child.dataset.page) !== reviewState.activePage;
  }
  // Page viewer: one page at a time, fitted to the panel; Previous/Next and a zoom toggle.
  const viewer = elements.pages.closest(".document-panel");
  viewer?.classList.toggle("fit", !reviewState.zoom);
  const position = pages.indexOf(reviewState.activePage);
  const step = (offset) => {
    const target = pages[position + offset];
    if (target === undefined || groqRequestRunning) return;
    reviewState.activePage = target;
    refreshPageControls();
    if (document.body.dataset.uiStep === "1") flow.reading("select", target);
    viewer?.scrollTo({ top: 0 });
  };
  const navButton = (text, offset, label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button page-step";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.disabled = groqRequestRunning || pages[position + offset] === undefined;
    button.addEventListener("click", () => step(offset));
    return button;
  };
  if (pages.length > 1) progress.append(navButton("‹ Previous", -1, "Previous page"));
  const where = document.createElement("span");
  where.className = "page-where";
  where.textContent = pages.length > 1 ? `Page ${reviewState.activePage} of ${pages.length}` : "Page 1";
  progress.append(where);
  if (pages.length > 1) progress.append(navButton("Next ›", 1, "Next page"));
  if (pages.length) {
    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.className = "text-button page-zoom";
    zoom.textContent = reviewState.zoom ? "Fit page" : "Zoom";
    zoom.addEventListener("click", () => { reviewState.zoom = !reviewState.zoom; refreshPageControls(); });
    progress.append(zoom);
  }
  refreshPrintedCheck();
}

function acceptSection(subtotalId, memberIds) {
  reviewState.candidates = assignSection(reviewState.candidates, subtotalId, memberIds);
  const subtotal = reviewState.candidates.find(line => line.id === subtotalId);
  subtotal.sectionAcceptedKey = sectionReviewKey(reviewState.candidates, subtotalId);
  invalidatePayload("Lines linked. Check the printed amounts before calculating.");
  renderLines();
  refreshPageControls();
  setStatus("These lines are linked. Python will check their amounts when you choose Looks right — check it.");
}

function refreshPrintedCheck() {
  const selection = allReadyState(reviewState.candidates, elements.currency.value);
  const allLines = document.querySelector("#accept-all-lines");
  const checkAll = document.querySelector("#check-all-lines");
  checkAll.disabled = selection.disabled;
  checkAll.textContent = selection.checked ? "✓ All lines checked" : "Check all lines";
  checkAll.classList.toggle("done", selection.checked);
  allLines.checked = selection.checked;
  allLines.indeterminate = selection.indeterminate;
  allLines.disabled = selection.disabled;
  document.querySelector("#accept-all-hint").textContent = `${selection.selected} of ${selection.ready} ready lines accepted.${selection.blocked ? ` ${selection.blocked} line${selection.blocked === 1 ? " needs" : "s need"} details or a decision and will stay unticked.` : ""} This confirms what was read—not whether the bill adds up.${reviewState.candidates.some(line => line.role === "subtotal") ? " Section links are confirmed separately below." : ""}`;
  const state = printedCheckPresence(reviewState.candidates);
  const verified = Boolean(reviewState.tree?.length) && reviewState.tree.every(invoice => invoice.matches === true);
  document.querySelector(".all-lines-control").hidden = true;  // replaced by the "Check all lines" button
  const text = {
    missing: "No printed total or subtotal captured yet. Add the final total exactly as printed on your bill so we can check the sum.",
    needs_details: "A printed total/subtotal line is incomplete. Fill its amount and label; a subtotal also needs the section it covers.",
    needs_confirmation: "Printed total/subtotal captured. Compare it with your bill before choosing Looks right — check it.",
    confirmed: "Printed total/subtotal included. Code will check it; a subtotal checks only its named section.",
  };
  document.querySelector("#printed-check-message").textContent = text[state];
  document.querySelector(".printed-check-prompt").classList.toggle("missing-check", state === "missing" || state === "needs_details");
  document.querySelector("#add-printed-total").textContent = state === "missing" ? "+ Add printed total" : "Review printed total / subtotal";
  document.querySelector("#section-links").replaceChildren(...reviewState.candidates.filter(line => line.role === "subtotal").map(line => {
    const accepted = sectionAccepted(reviewState.candidates, line.id);
    const members = accepted ? sectionMembers(reviewState.candidates, line.id) : suggestSection(reviewState.candidates, line.id);
    const section = document.createElement("section");
    section.className = "section-review";
    section.dataset.subtotalId = line.id;
    const title = document.createElement("h3");
    title.textContent = accepted ? "✓ These lines are linked" : "Do these lines belong together?";
    const context = document.createElement("p");
    context.textContent = `Printed subtotal · page ${line.page} · ${line.rawAmount || "amount missing"}`;
    const details = document.createElement("details");
    details.open = !accepted;
    const summary = document.createElement("summary");
    summary.textContent = `${members.length} suggested line${members.length === 1 ? "" : "s"}${accepted ? " · view" : " · check against your bill"}`;
    const list = document.createElement("ul");
    for (const member of members) {
      const item = document.createElement("li");
      item.textContent = `Page ${member.page}: ${member.description} — ${member.rawAmount}`;
      list.append(item);
    }
    details.append(summary, list);
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = accepted ? "This confirms the grouping, not the calculation. Python checks the amounts next."
      : members.length ? "Suggested from the table layout or section labels—not from adding the amounts."
      : "We could not suggest the lines safely. Choose Change to select them.";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "secondary";
    yes.textContent = "Yes, these belong together";
    yes.hidden = accepted || !members.length || !line.group?.trim();
    yes.addEventListener("click", () => {
      try { acceptSection(line.id, members.map(member => member.id)); }
      catch (error) { setStatus(error.message, "failure"); }
    });
    const change = document.createElement("button");
    change.type = "button";
    change.className = "text-button";
    change.textContent = "Change";
    change.setAttribute("aria-label", `Change lines for subtotal on page ${line.page}: ${line.description}`);
    change.addEventListener("click", () => {
      // Rebuild the editor so choices include rows added on later pages.
      renderLines();
      const card = document.querySelector(`[data-card-id="${CSS.escape(line.id)}"]`);
      card.querySelector(".line-editor").open = true;
      card.querySelector(".section-editor").open = true;
      card.scrollIntoView({block: "center", behavior: "smooth"});
    });
    section.append(title, context, details, note, yes, change);
    return section;
  }));
  // Only grouping questions that still need a Yes/Change are shown; accepted ones ("✓ These lines are linked") stay
  // hidden, as does the printed-total reminder unless a total is missing (owner: a long list with nothing to do).
  document.querySelectorAll("#section-links .section-review").forEach(box => {
    box.hidden = sectionAccepted(reviewState.candidates, box.dataset.subtotalId);
  });
  document.querySelector("#printed-check-message").hidden = state !== "missing" && state !== "needs_details";
  document.querySelector("#add-printed-total").hidden = document.querySelector("#printed-check-message").hidden;
  const pendingBoxes = [...document.querySelectorAll("#section-links .section-review")].filter(box => !box.hidden);
  document.querySelector(".printed-check-prompt").hidden = document.querySelector("#printed-check-message").hidden && !pendingBoxes.length;
  // Review lines also counts grouping questions that wait for Yes/Change, so it never says "Nothing to review" then.
  const waiting = reviewWaiting();
  const review = document.querySelector("#review-lines");
  review.disabled = !waiting;
  review.classList.toggle("needed", waiting > 0);
  review.textContent = waiting ? `Review ${waiting} item${waiting === 1 ? "" : "s"}` : "Nothing to review";
}

// What "Review N items" counts: lines marked for a look, grouping questions waiting for Yes/Change, and rounding
// differences on a printed figure that has no rounding line yet.
function reviewWaiting() {
  const pendingBoxes = [...document.querySelectorAll("#section-links .section-review")].filter(box => !box.hidden).length;
  const roundingOpen = reviewState.candidates.filter(line => line.reference && line.rounding && !reviewState.candidates.some(other => other.roundingFor === line.gid)).length;
  return reviewState.candidates.filter(line => line.attention && !line.reference).length + pendingBoxes + roundingOpen;
}

function openManualLine(role = "charge") {
  if (!reviewState.pageElements.size) { setStatus("Open a bill first.", "failure"); return; }
  const form = document.querySelector("#manual-line-form");
  form.reset();
  const page = document.querySelector("#manual-page");
  page.replaceChildren(...[...reviewState.pageElements.keys()].map(number => new Option(`Page ${number}`, String(number))));
  page.value = String(reviewState.activePage);
  document.querySelector("#manual-role").value = role;
  document.querySelector("#manual-label").value = role === "total" ? "Printed total" : "";
  document.querySelector("#manual-group").required = role === "subtotal";
  document.querySelector("#manual-error").textContent = "";
  document.querySelector("#manual-line-dialog").showModal();
  document.querySelector(role === "total" ? "#manual-amount" : "#manual-label").focus();
}

document.querySelector("#add-line").addEventListener("click", () => openManualLine());
document.querySelector("#add-printed-total").addEventListener("click", () => {
  const check = reviewState.candidates.find(line => ["total", "subtotal"].includes(line.role));
  if (!check) return openManualLine("total");
  const card = document.querySelector(`[data-card-id="${CSS.escape(check.id)}"]`);
  card.querySelector(".line-editor").open = true;
  card.scrollIntoView({block: "nearest", behavior: "smooth"});
  card.querySelector('input[data-field="amount"]').focus();
});
document.querySelector("#manual-role").addEventListener("change", event => {
  document.querySelector("#manual-group").required = event.target.value === "subtotal";
});
document.querySelector("#manual-cancel").addEventListener("click", () => document.querySelector("#manual-line-dialog").close());
document.querySelector("#manual-line-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const fields = manualCandidateFields({page: Number(document.querySelector("#manual-page").value), role: document.querySelector("#manual-role").value,
      description: document.querySelector("#manual-label").value, rawAmount: document.querySelector("#manual-amount").value, group: document.querySelector("#manual-group").value});
    if (!reviewState.pageElements.has(fields.page)) throw new Error("Choose a page in the current bill");
    addCandidate(newCandidate({...fields, id: `manual-${crypto.randomUUID()}`, context: `Entered by you from page ${fields.page}.`, warning: "Manual entry, page-level evidence. Check every digit before confirming."}), "Your line was added. Check it against the printed bill before calculating.");
    document.querySelector("#manual-line-dialog").close();
  } catch (error) { document.querySelector("#manual-error").textContent = error.message; }
});
document.querySelector("#undo-remove").addEventListener("click", () => {
  const removed = reviewState.removedLines.pop();
  if (!removed) return;
  reviewState.candidates.splice(Math.min(removed.index, reviewState.candidates.length), 0, removed.line);
  renderLines();
  invalidatePayload(); drawHighlights(); refreshPageControls();
  document.querySelector("#undo-remove").hidden = reviewState.removedLines.length === 0;
  setStatus("Line restored. Check the combined lines again before continuing.");
});

async function processSelection() {
  if (!checkExpectedAmount()) return;
  resetReview({ keepFiles: true });
  elements.process.disabled = true;
  try {
    const files = Array.from(elements.files.files || []);
    const kind = validSelection(files);
    let tokens;
    if (kind === "pdf") {
      setStatus("Reading PDF text locally…", "busy");
      const pdfjs = await pdfLibrary();
      const extraction = await extractPdfTokens(files[0], { loadPdfJs: async () => pdfjs });
      tokens = [...extraction.tokens];
      await renderPdf(files[0], pdfjs);
    } else {
      await renderImages(files);
      tokens = await extractImages(files);
    }
    showCandidates(tokens, kind === "pdf" ? "pdf_text" : "local_ocr");
    setStatus(reviewState.candidates.length
      ? `Finished locally: ${tokens.length} text pieces and ${reviewState.candidates.length} possible amounts. Confirm only relevant lines and give each a role. Add anything missing above its page.`
      : `OCR read ${tokens.length} text pieces but did not identify any amounts. Amounts may still be present. Use the buttons above the page to add them.`);
  } catch (error) {
    resetReview({ keepFiles: true });
    setStatus(error instanceof Error ? error.message : String(error), "failure");
  } finally {
    elements.process.disabled = false;
  }
}

function confirmedCandidates() {
  return reviewState.candidates.filter((candidate) => candidate.confirmed).map((candidate) => toContractInput(candidate, elements.currency.value));
}

function previewPayload() {
  elements.payloadError.textContent = "";
  if (!checkExpectedAmount()) return false;
  try {
    const lines = confirmedCandidates();
    if (!lines.length) throw new Error("Confirm at least one relevant line first.");
    if (printedCheckPresence(reviewState.candidates.filter(line => line.confirmed)) !== "confirmed") throw new Error("Add and confirm the printed total, or a printed subtotal with its section, before checking.");
    const payload = buildServerPayload({
      currency: elements.currency.value,
      decimalSeparator: elements.decimalSeparator.value,
      expectedAmount: elements.expectedAmount.value || null,
      messageType: elements.messageType.value,
      earlierPeriodGroup: elements.earlierPeriodGroup.value || null,
      printedFiguresRechecked: reviewState.rechecked,
      lines,
    });
    reviewState.payload = payload;
    elements.payloadOutput.textContent = JSON.stringify(payload, null, 2);
    elements.downloadPayload.disabled = false;
    elements.analyze.disabled = false;
    hideResult();
    return true;
  } catch (error) {
    invalidatePayload("Fix the problem above, then build the preview again.");
    elements.payloadError.textContent = error instanceof Error ? error.message : String(error);
    return false;
  }
}

function downloadPayload() {
  if (!reviewState.payload) return;
  const blob = new Blob([`${JSON.stringify(reviewState.payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `billshield-confirmed-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function listItem(text, className = "") {
  const item = document.createElement("li");
  item.textContent = text;
  if (className) item.className = className;
  return item;
}

const MATCH_TEXT = {
  equals_expected: "exactly what you expected to pay",
  equals_difference: "exactly the difference",
  equals_total_gap: "exactly the gap between the listed charges and the printed total (check whether this line is really part of that total)",
};

function paragraph(text, className = "") {
  const node = document.createElement("p");
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

// ai: { state: "asking" | "done" | "error" | "skipped", explanation?, message? }
function renderGap(result, ai) {
  if (!result.gap.needsExplanation) {
    elements.resultGap.replaceChildren(paragraph("Nothing to explain: the bill matches what you expected."));
    return;
  }
  // Owner layout (chapter 4): one box "Checked by maths, explained by AI" with the AI's short story and what is still
  // unknown; Python's facts fold away under a small "Math explanation" below it. The retry shows only on an error.
  const box = document.createElement("section");
  box.className = "ai-reason";
  box.append(paragraph("Checked by maths, explained by AI", "gap-heading"));
  if (ai.state === "error") {
    box.classList.add("ai-unavailable");
    box.append(paragraph(`The AI explanation is not available right now: ${ai.message || "no answer"} The maths is checked and complete.`, "hint"));
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary";
    retry.textContent = "Try the AI again";
    retry.addEventListener("click", () => {
      retry.disabled = true;
      if (reviewState.payload) explainDifference(reviewState.payload, reviewGeneration);
    });
    box.append(retry);
  } else if (ai.state === "asking") {
    box.append(paragraph("Looking for a likely reason… Only the checked lines and amounts are sent, no picture of your bill.", "hint"));
  } else if (ai.state === "done") {
    const labels = Object.fromEntries(result.lines.map((line) => [line.id, line.description]));
    if (ai.explanation.story) box.append(paragraph(ai.explanation.story, "ai-story"));
    else if (!ai.explanation.likelyCauses.some((cause) => cause.grade)) {
      const causes = document.createElement("ul");
      causes.replaceChildren(...ai.explanation.likelyCauses.map((cause) => listItem(`${cause.lineIds.map((id) => labels[id]).join(" + ")} — ${cause.reason}`)));
      box.append(causes);
    }
    const graded = gradedCauses(ai.explanation, labels);
    if (graded) box.append(graded);
    box.append(paragraph("Written by AI and can be wrong. Every amount comes from Python.", "ai-disclaimer"));
  }
  if (result.missingEvidence?.length) box.append(paragraph(`Still unknown: ${result.missingEvidence.join("; ")}.`, "hint unknown-line"));

  const exact = result.gap.exactMatches.map((match) => listItem(`${match.groupLabel ? match.groupLabel : match.labels.join(" + ")} = ${match.amount}, ${MATCH_TEXT[match.kind]}.`));
  const list = document.createElement("ul");
  list.replaceChildren(...(exact.length ? exact : [listItem("No line or section on the bill equals the difference exactly. The reason may be outside this bill, for example a different price you were quoted.")]));
  if (result.gap.ambiguous) list.append(listItem("Several combinations fit, so the numbers alone cannot show which one it is."));
  const facts = document.createElement("details");
  facts.className = "python-facts math-explanation";
  const summary = document.createElement("summary");
  summary.textContent = "Math explanation";
  facts.append(summary, list, paragraph("Checked by Python. This shows where the amount is on the bill, not why it was charged.", "hint"));
  elements.resultGap.replaceChildren(box, facts);
}

// Every AI cause with Python's check of its evidence (PRD_SCALABLE W5). Causes that failed the check never reach here.
const GRADE_TEXT = {
  full: (cause, difference) => `✓ Checked by Python: accounts for the full difference of ${difference}`,
  part: (cause, difference) => `◐ Checked by Python: accounts for ${cause.covered} of the ${difference} difference`,
  over: (cause, difference) => `◐ Checked by Python: these lines add up to ${cause.covered}, more than the ${difference} difference, so something else on the bill offsets part of them`,
  text: () => "Based on text printed on the bill; the amount cannot be checked",
  lines: () => "Lines on the bill (there is no difference to compare with)",
};
function gradedCauses(explanation, labels) {
  const causes = (explanation.likelyCauses || []).filter((cause) => cause.grade);
  if (!causes.length) return null;
  const list = document.createElement("ul");
  list.className = "graded-causes";
  for (const cause of causes) {
    const item = document.createElement("li");
    item.className = `cause cause-${cause.grade}`;
    const lines = cause.lineIds.map((id) => labels[id]).filter(Boolean);
    const title = document.createElement("strong");
    title.textContent = lines.length ? lines.map((label) => `“${label}”`).join(" + ") : "Text on the bill";
    const grade = document.createElement("small");
    grade.className = "cause-grade";
    grade.textContent = GRADE_TEXT[cause.grade](cause, explanation.difference);
    item.append(title, grade, paragraph(cause.reason, "cause-reason"));
    const where = onTheBill(cause.lineIds);
    if (where) item.append(where);
    for (const index of cause.noteIds || []) {
      const note = explanation.notes?.[index];
      if (!note) continue;
      const quote = document.createElement("blockquote");
      quote.className = "bill-note";
      quote.textContent = `“${note.quote}”`;
      const where = document.createElement("small");
      where.textContent = `${note.page ? `Page ${note.page} · ` : ""}${note.verified ? "found word for word in the PDF text" : "as read by the AI from the page"}${note.about && note.about !== note.quote ? ` · ${note.about}` : ""}`;
      quote.append(where);
      item.append(quote);
    }
    list.append(item);
  }
  // Owner 2026-10-20: say what the coloured bars mean, right under the causes.
  const legend = document.createElement("p");
  legend.className = "cause-legend";
  const lead = document.createElement("strong");
  lead.textContent = "Python's check:";
  legend.append(lead);
  for (const [kind, text] of [["full", "explains it all"], ["part", "explains part"], ["other", "offset, or bill text only"]]) {
    const key = document.createElement("span");
    key.className = `legend-key legend-${kind}`;
    key.textContent = text;
    legend.append(key);
  }
  const wrap = document.createElement("div");
  wrap.className = "graded-wrap";
  wrap.append(list, legend);
  return wrap;
}

// Owner 2026-10-20: show the part of the bill behind a cause. A cut-out of the page around those lines, each marked in
// yellow where the reader found it, and a link to the full page with the same lines lit up. Display only.
function onTheBill(lineIds) {
  const lines = lineIds.map((id) => reviewState.candidates.find((line) => line.id === id))
    .filter((line) => line && (line.bounds || line.region));
  if (!lines.length) return null;
  const page = lines[0].page;
  const onPage = lines.filter((line) => line.page === page);
  const source = null;  // owner 2026-10-20: the cause is marked in The maths, not as a picture of the bill here
  const box = document.createElement("div");
  box.className = "on-the-bill";
  if (source) {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    const boxes = onPage.map((line) => line.bounds || line.region);
    const top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - 0.02);
    const bottom = Math.min(1, Math.max(...boxes.map((b) => b.bottom)) + 0.02);
    if (width && height && bottom > top) {
      const crop = document.createElement("canvas");
      const scale = Math.min(2, 1100 / width);
      crop.width = Math.round(width * scale);
      crop.height = Math.round((bottom - top) * height * scale);
      const context = crop.getContext("2d");
      context.drawImage(source, 0, top * height, width, (bottom - top) * height, 0, 0, crop.width, crop.height);
      context.fillStyle = "rgba(245, 196, 0, 0.32)";
      context.strokeStyle = "rgba(167, 107, 0, 0.9)";
      context.lineWidth = 2;
      for (const b of boxes) {
        const x = b.x0 * crop.width, y = (b.top - top) * height * scale;
        const w = (b.x1 - b.x0) * crop.width, h = (b.bottom - b.top) * height * scale;
        context.fillRect(x, y, w, h);
        context.strokeRect(x, y, w, h);
      }
      crop.setAttribute("role", "img");
      crop.setAttribute("aria-label", `Part of page ${page} of your bill with ${onPage.length === 1 ? "this line" : "these lines"} marked`);
      box.append(crop);
    }
  }
  const show = document.createElement("button");
  show.type = "button";
  show.className = "link-button";
  show.textContent = `Show on page ${page} of the bill`;
  const open = () => { flow.check(); showOnBill(lines.map((line) => line.id)); };
  show.addEventListener("click", open);
  box.querySelector("canvas")?.addEventListener("click", open);
  box.append(show);
  return box;
}

// One re-check problem with the two ways to fix it: look at the lines, or read the page again.
function suspectItem(suspect) {
  const item = listItem(suspect.text, "suspect");
  const actions = document.createElement("div");
  actions.className = "suspect-actions";
  if (suspect.lineIds.length) {
    const show = document.createElement("button");
    show.type = "button";
    show.className = "secondary";
    show.textContent = suspect.lineIds.length === 1 ? "Show this line" : `Show these ${suspect.lineIds.length} lines`;
    show.addEventListener("click", () => {
      flow.check();
      focusCandidate(suspect.lineIds[0]);
      setStatus("The lines to check are marked. Compare them with the bill and correct or add what is different.");
    });
    actions.append(show);
  }
  for (const page of suspect.pages || []) {
    if (!reviewState.pageElements.has(page)) continue;
    const reread = document.createElement("button");
    reread.type = "button";
    reread.className = "text-button";
    reread.textContent = `Read page ${page} again`;
    reread.addEventListener("click", () => {
      reviewState.activePage = page;
      refreshPageControls();
      flow.readPage(page);
      setStatus(`Page ${page}: select the area with these lines and read it again. New lines are added to the ones you have, so remove any that now appear twice.`);
    });
    actions.append(reread);
  }
  if (actions.childElementCount) item.append(actions);
  return item;
}

function markSuspects(suspects) {
  const notes = new Map();
  for (const suspect of suspects) for (const id of suspect.lineIds) notes.set(id, `Check this line: ${suspect.text}`);
  reviewState.candidates = reviewState.candidates.map((candidate) => ({ ...candidate, attention: notes.get(candidate.id) || candidate.attention }));
  renderLines();
}

// Tone of the message (warm / neutral / direct): greeting and closing only; Python's sentences stay as written.
let baseDraft = "";
let messageTone = "neutral";
let toneDrafts = null;      // {tones: {warm, neutral, direct}, source: {...}} from /api/draft-message
const draftFor = (tone) => toneDrafts?.tones?.[tone] || applyTone(baseDraft, tone);
function showDraftSource() {
  const fromAi = toneDrafts?.source?.[messageTone] === "ai";
  elements.draftNote.textContent = fromAi
    ? "Written by AI from the checked facts. Every amount was filled in by Python. Read it before you send it."
    : "Written from the checked facts. Every amount comes from Python.";
}
document.querySelectorAll(".tone-picker [data-tone]").forEach(button => button.addEventListener("click", () => {
  if (!baseDraft) return;
  if (elements.draftText.value !== draftFor(messageTone) && !window.confirm("Changing the tone replaces your edits to the message. Continue?")) return;
  messageTone = button.dataset.tone;
  document.querySelectorAll(".tone-picker [data-tone]").forEach(other => other.setAttribute("aria-pressed", String(other === button)));
  elements.draftText.value = draftFor(messageTone);
  showDraftSource();
}));

// Starts as soon as the result is shown, so all three tones are ready by the time the person reaches the message.
async function prepareToneDrafts(payload) {
  const generation = reviewGeneration;
  try {
    const response = await fetch("/api/draft-message", { method: "POST", headers: apiHeaders("draft-message"), body: JSON.stringify(payload) });
    const answer = await response.json();
    if (!response.ok || answer.error || generation !== reviewGeneration || payload !== reviewState.payload) return;
    const untouched = elements.draftText.value === draftFor(messageTone);
    toneDrafts = answer;
    if (untouched) elements.draftText.value = draftFor(messageTone);
    showDraftSource();
  } catch { /* the template drafts stay; nothing else depends on this */ }
}

function renderResult(result, ai = { state: "skipped" }) {
  const needsRecheck = result.status === "needs_recheck";
  const verdict = document.createElement("p");
  verdict.className = needsRecheck ? "verdict verdict-verified_mismatch" : `verdict verdict-${result.verdict}`;
  const headline = resultHeadline(result);
  verdict.textContent = headline.text;
  if (headline.amount) {
    const amount = document.createElement("mark");
    amount.textContent = headline.amount;
    verdict.append(" ", amount, headline.after ? ` ${headline.after}` : "");
  }
  verdict.title = needsRecheck ? "Check the reading before continuing" : VERDICT_LABELS[result.verdict] || result.verdict;
  elements.recheckBox.hidden = !needsRecheck;
  elements.draftBox.hidden = needsRecheck;
  if (needsRecheck) {
    elements.resultSuspects.replaceChildren(...result.suspects.map(suspectItem));
    markSuspects(result.suspects);
  }
  // The totals are in The maths next to it (owner: no second line repeating them).
  elements.resultSummary.replaceChildren(verdict);
  const table = document.createElement("table");
  table.className = "math-table";
  table.setAttribute("aria-label", "Code-checked bill amounts");
  const tableBody = document.createElement("tbody");
  // Owner 2026-10-20: the lines behind a cause are marked here, in The maths, with the colour of Python's check.
  const causeGrade = new Map();
  for (const cause of ai.state === "done" ? ai.explanation?.likelyCauses || [] : []) {
    for (const id of cause.lineIds) if (cause.grade && !causeGrade.has(id)) causeGrade.set(id, cause.grade);
  }
  for (const row of mathRows(result)) {
    const tr = document.createElement("tr");
    tr.className = `math-${row.kind}`;
    const grade = (row.lineIds || []).map((id) => causeGrade.get(id)).find(Boolean);
    if (grade) {
      tr.classList.add("math-cause", `math-cause-${["full", "part"].includes(grade) ? grade : "other"}`);
      tr.title = "A likely cause of the difference (see Checked by maths, explained by AI)";
    }
    for (const text of [row.label, row.value]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    tableBody.append(tr);
  }
  table.append(tableBody);
  document.querySelector("#math-table").replaceChildren(table);
  document.querySelector("#math-table").hidden = needsRecheck;
  document.querySelector("#math-title").textContent = needsRecheck ? "ON YOUR BILL" : "THE MATHS";
  const sourcePreview = document.querySelector("#recheck-source");
  sourcePreview.hidden = !needsRecheck;
  sourcePreview.replaceChildren();
  if (needsRecheck) {
    const suspectIds = new Set(result.suspects.flatMap(suspect => suspect.lineIds));
    const suspectPage = result.lines.find(line => suspectIds.has(line.id))?.source.page || result.lines[0]?.source.page;
    const source = reviewState.pageElements.get(suspectPage)?.querySelector("canvas, img");
    if (source) {
      const preview = document.createElement("img");
      preview.className = "source-preview";
      preview.alt = `Source bill page ${suspectPage}. Return to the lines to inspect and correct it.`;
      preview.src = source.tagName === "CANVAS" ? source.toDataURL("image/png") : source.src;
      sourcePreview.append(preview, paragraph(`Source page ${suspectPage}. Use Fix the lines to inspect other pages or change amounts. No exact error location is inferred here.`, "hint"));
    }
  }
  if (result.messageTypeNote) {
    const note = document.createElement("p");
    note.className = "error";
    note.textContent = result.messageTypeNote;
    elements.resultSummary.append(note);
  }

  const checks = [listItem(`Sum of charges and discounts: ${result.totalFormula}`)];
  for (const line of result.lines.filter(line => line.summaryOf)) {
    checks.push(listItem(`${line.description}: summary of a detailed section; kept for reference, not added again.`));
  }
  if (result.amounts.printedTotal) {
    checks.push(listItem(`Printed grand total ${result.amounts.printedTotal}: ${result.minor.printedTotal === result.minor.calculatedTotal ? "matches" : "does NOT match"}`));
  }
  for (const group of result.groups) {
    const status = group.checked ? (group.matches ? `matches printed subtotal ${group.printed}` : `does NOT match printed subtotal ${group.printed}`) : "no printed subtotal; calculated only";
    checks.push(listItem(`${group.label}: ${group.formula} — ${status}`));
  }
  for (const row of result.rowChecks) {
    const what = row.what === "taxable_value" ? "taxable value" : "row amount";
    checks.push(listItem(`${row.label} (${what}): ${row.formula} — ${row.matches ? "matches" : `does NOT match printed ${row.printed}`}`));
  }
  if (result.comparisonStatus) checks.push(listItem(`Comparison with your expected amount: ${result.comparisonStatus.replaceAll("_", " ")}`));
  elements.resultChecks.replaceChildren(...checks);

  elements.resultLines.replaceChildren(...result.lines.map((line) => {
    const precision = line.source.precision === "exact" ? `exact location (${LOCATOR_LABELS[line.source.locatedBy] || line.source.locatedBy})`
      : line.source.precision === "table" ? "table area only" : "page only";
    const correction = line.corrected === true ? " · corrected by you" : line.corrected === null ? " · entered by you" : "";
    const row = line.rowDetail ? ` [${line.rowDetail}]` : "";
    return listItem(`${line.inMessage ? "★ " : ""}${line.description} — ${line.amount}${row} — ${line.role}${line.group ? ` (${line.group})` : ""} — page ${line.source.page}, ${precision}${correction}`, line.inMessage ? "in-message" : "");
  }));
  elements.resultMissing.replaceChildren(...(result.missingEvidence.length ? result.missingEvidence : ["Nothing listed."]).map((item) => listItem(item)));
  baseDraft = result.draft ? result.draft.text : "";
  toneDrafts = null;
  elements.draftText.value = baseDraft ? applyTone(baseDraft, messageTone) : "";
  const notes = [];
  if (result.questionedBy === "ai") notes.push("The AI chose which lines the message asks about (you had not ticked any).");
  if (result.aiAppendedQuestion) notes.push("The last sentence was suggested by the AI and contains no amounts.");
  elements.draftNote.textContent = notes.join(" ");
  renderGap(result, ai);
  elements.resultPanel.hidden = false;
  flow.result(result, ai.state === "asking");
}

async function analyzeReview() {
  if (!reviewState.payload) return;
  const generation = reviewGeneration;
  const payload = reviewState.payload;
  elements.analyze.disabled = true;
  elements.payloadError.textContent = "";
  setStatus("Python is checking the confirmed lines…", "busy");
  await ensureSession();
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: apiHeaders("confirmed-lines"),
      body: JSON.stringify(payload),
    });
    const output = await response.json();
    if (generation !== reviewGeneration || payload !== reviewState.payload) return;
    if (!response.ok || output.error) throw new Error(output.error || "Python analysis failed");
    if (output.result.status === "needs_recheck") {
      renderResult(output.result);
      setStatus("The numbers do not add up, so no message was written and nothing was sent to the AI. Fix the marked lines, or confirm that you re-checked them.", "failure");
      return;
    }
    if (!output.result.gap.needsExplanation) {
      renderResult(output.result);
      showSaved(output);
      prepareToneDrafts(payload);
      setStatus("Python finished: no difference to explain. Read the checks, then edit the message if needed. Nothing has been sent.");
      return;
    }
    renderResult(output.result, { state: "asking" });
    await explainDifference(payload, generation);
  } catch (error) {
    if (generation !== reviewGeneration) return;
    elements.payloadError.textContent = error instanceof Error ? error.message : String(error);
    setStatus("This review could not be checked. See the error below the charges.", "failure");
  } finally {
    if (payload === reviewState.payload) elements.analyze.disabled = false;
    if (generation === reviewGeneration) flow.settled();
  }
}

// Explicit bulk confirmation after review: ticks only lines that pass every check; never edits amounts.
function confirmAllReady() {
  reviewState.candidates = confirmReadyLines(reviewState.candidates, elements.currency.value, true);
  const confirmed = reviewState.candidates.filter(candidate => candidate.confirmed).length;
  const attention = reviewState.candidates.filter(candidate => !candidate.confirmed && !candidate.reference).length;
  renderLines();
  invalidatePayload();
  drawHighlights();
  refreshPrintedCheck();
  const parts = [`${confirmed} line${confirmed === 1 ? " is" : "s are"} marked as checked.`];
  if (attention) parts.push(`${attention} line${attention === 1 ? " needs" : "s need"} a decision: open the line${attention === 1 ? "" : "s"} marked in red.`);
  setStatus(parts.join(" "), attention ? "failure" : "");
}

function recommendExtractor() {
  const files = Array.from(elements.files.files || []);
  document.querySelector("#selected-file").textContent = files.length
    ? `${files.length} file${files.length === 1 ? "" : "s"} selected · ${files.map(file => file.name).join(", ")}`
    : "or click to choose · one bill · up to 10 pages";
  const photos = files.length > 0 && files.every((file) => /^image\/(jpeg|png)$/.test(file.type));
  elements.openVision.className = photos ? "primary" : "secondary";
  elements.process.className = photos ? "secondary" : "primary";
  if (files.length) {
    setStatus(photos
      ? "Photos selected. Next: enter what you expected to pay, then press Read my bill."
      : "PDF selected. Next: enter what you expected to pay, then press Read my bill.");
  }
}

elements.files.addEventListener("change", recommendExtractor);
elements.confirmAll.addEventListener("click", confirmAllReady);
document.querySelector("#check-all-lines").addEventListener("click", () => {
  const box = document.querySelector("#accept-all-lines");
  box.checked = !box.checked;
  box.dispatchEvent(new Event("change"));
});
document.querySelector("#review-lines").addEventListener("click", () => {
  const next = reviewState.candidates.find(line => line.attention && !line.reference);
  if (!next) {
    (document.querySelector("#section-links .section-review:not([hidden])") || document.querySelector(".rounding-button"))
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  focusCandidate(next.id);
  const card = document.querySelector(`[data-card-id="${CSS.escape(next.id)}"]`);
  const editor = card?.querySelector(".line-editor");
  if (editor) editor.open = true;
  card?.scrollIntoView({ block: "center", behavior: "smooth" });
});
document.querySelector("#accept-all-lines").addEventListener("change", event => {
  if (event.target.checked) return confirmAllReady();
  reviewState.candidates = confirmReadyLines(reviewState.candidates, elements.currency.value, false);
  renderLines();
  invalidatePayload(); drawHighlights(); refreshPrintedCheck();
  setStatus("Line acceptance cleared. Your lines and amounts are kept; check them before accepting again.");
});
async function explainDifference(payload, generation) {
  setStatus("Python found a difference. Looking for a likely reason… Only the checked lines and amounts are sent, no picture of your bill.", "busy");
  try {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: apiHeaders("explain-difference"),
      body: JSON.stringify({ ...payload, contextNotes: reviewState.notes || [] }),
    });
    const output = await response.json();
    if (generation !== reviewGeneration || payload !== reviewState.payload) return;
    if (!response.ok || output.error) throw new Error(output.error || "Explanation request failed");
    showSaved(output);
    queueMicrotask(() => prepareToneDrafts(payload));
    if (output.explanation) {
      renderResult(output.result, { state: "done", explanation: output.explanation });
      setStatus("Done. Python checked the numbers and the AI suggested likely causes. Check the message, edit it if needed, then copy it. Nothing has been sent.");
    } else {
      renderResult(output.result, { state: "error", message: output.explanationError || output.skipped || "No AI explanation." });
      setStatus("Numbers checked. Your message is ready in Your message.");
    }
  } catch (error) {
    if (generation !== reviewGeneration) return;
    elements.resultGap.querySelector(".hint")?.replaceWith(paragraph(`AI step failed: ${error.message}. The Python result and message are still valid.`, "error"));
    setStatus("Numbers checked. Your message is ready in Your message.");
  }
}

elements.recheckConfirm.addEventListener("click", async () => {
  // The person states they compared the figures with the bill; any later edit clears this again.
  reviewState.rechecked = true;
  if (previewPayload()) await analyzeReview();
});

elements.markSent.addEventListener("click", async () => {
  elements.markSent.disabled = true;
  try {
    // The pasted text if given, otherwise the message as it stands in the box (owner: no paste box in the way).
    const answer = await recordEvent("sent", elements.sentText.value.trim() || elements.draftText.value.trim() || null);
    elements.sentNote.textContent = answer.wordsChanged == null
      ? "Recorded as sent. Paste the exact text you sent to also count the changed words."
      : `Recorded as sent: ${answer.wordsChanged} word${answer.wordsChanged === 1 ? "" : "s"} changed compared with the draft (goal: fewer than 20). Long numbers and e-mail addresses were removed before saving.`;
  } catch (error) {
    elements.sentNote.textContent = error.message;
  } finally {
    elements.markSent.disabled = !savedMessageId;
  }
});

elements.process.addEventListener("click", processSelection);
function checkExpectedAmount() {
  try {
    requireExpectedAmount(elements.expectedAmount.value);
    return true;
  } catch (error) {
    flow.provide();
    setStatus(error.message, "failure");
    elements.expectedAmount.focus();
    elements.expectedAmount.reportValidity();
    return false;
  }
}
document.querySelector("#start-review").addEventListener("click", () => {
  const files = Array.from(elements.files.files || []);
  elements.openVision.click();
});
document.querySelector("#confirm-and-check").addEventListener("click", async (event) => {
  renderLines();
  const pendingSection = reviewState.candidates.find(line => line.role === "subtotal" && !sectionAccepted(reviewState.candidates, line.id));
  if (pendingSection) {
    refreshPrintedCheck();
    document.querySelector(`[data-subtotal-id="${CSS.escape(pendingSection.id)}"]`)?.scrollIntoView({block: "center", behavior: "smooth"});
    setStatus("First confirm which lines belong together below. Choose Yes, or Change if the suggested lines are wrong.", "failure");
    return;
  }
  if (["missing", "needs_details"].includes(printedCheckPresence(reviewState.candidates))) {
    refreshPrintedCheck();
    document.querySelector("#add-printed-total").focus();
    setStatus("The printed total or subtotal is missing or incomplete. Add it from your bill; we will not guess it.", "failure");
    return;
  }
  // Owner: "it says review two items but still calculates". The first press with items still marked goes to the
  // first one and says so; pressing Looks right again (nothing changed) checks anyway — the items are advice.
  const waiting = reviewWaiting();
  if (waiting && reviewState.reviewWarned !== waiting) {
    reviewState.reviewWarned = waiting;
    document.querySelector("#review-lines").click();
    setStatus(`${waiting} item${waiting === 1 ? " is" : "s are"} still marked for review — the first one is open. Fix ${waiting === 1 ? "it" : "them"}, or press Looks right again to check anyway.`, "failure");
    return;
  }
  reviewState.reviewWarned = null;
  const button = event.currentTarget;
  button.disabled = true;
  confirmAllReady();
  // A line that could not be confirmed is never left out silently: Python would then report a gap the bill does
  // not have (owner, Odido bill: "Customer benefit -0,48"). Point to it and say why instead of checking.
  const blocked = reviewState.candidates.find(line => !line.confirmed && line.role && !line.reference);
  if (blocked) {
    button.disabled = false;
    focusCandidate(blocked.id);
    setStatus(`“${blocked.description || "A line"}” is not checked yet, so it would be left out of the sums: ${readiness(blocked, elements.currency.value) || "tick “I checked this against the bill”."} Fix it or remove it with ×, then press Looks right again.`, "failure");
    return;
  }
  try { if (previewPayload()) await analyzeReview(); }
  finally { button.disabled = false; }
});
document.querySelector("#open-vision").addEventListener("click", async () => {
  if (!checkExpectedAmount()) return;
  resetReview({ keepFiles: true });
  const button = document.querySelector("#open-vision");
  button.disabled = true;
  try {
    const files = Array.from(elements.files.files || []);
    const kind = validSelection(files);
    if (files.some((file) => file.size > 4_000_000) || files.length > 10) throw new Error("Use up to ten image pages or one PDF, each below 4 MB.");
    if (kind === "pdf") {
      const pdfjs = await pdfLibrary();
      await extractPdfTokens(files[0], { loadPdfJs: async () => pdfjs });
      await renderPdf(files[0], pdfjs);
    } else { await renderImages(files); }
    showCandidates([], kind === "pdf" ? "pdf_text" : "local_ocr");
    flow.reading("select", 1);
    setStatus("Your bill is open. Choose the pages with prices and press Read.");
  } catch (error) { resetReview({ keepFiles: true }); setStatus(error.message, "failure"); }
  finally { button.disabled = false; }
});
elements.reset.addEventListener("click", () => {
  resetReview();
  setStatus("Cleared from this page. Previously saved reviews have not been deleted.");
});
document.querySelector("#read-whole-bill").addEventListener("click", readWholeBill);
elements.previewPayload.addEventListener("click", previewPayload);
elements.downloadPayload.addEventListener("click", downloadPayload);
elements.analyze.addEventListener("click", analyzeReview);
elements.copyDraft.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.draftText.value);
    flow.copied();
    setStatus("Message copied to your clipboard. Kill Bill has not sent anything; sending is up to you.");
    recordEvent("copied").catch(() => {});
  } catch {
    elements.draftText.select();
    setStatus("Copy was blocked by the browser. The message is selected; press Ctrl+C.", "failure");
  }
});
// Default decimal mark per currency (EUR bills mostly use a comma, INR bills a point) until the person chooses.
let decimalChosen = false;
function decimalFromCurrency() {
  if (decimalChosen) return;
  elements.decimalSeparator.value = elements.currency.value === "INR" ? "." : ",";
  elements.expectedAmount.placeholder = elements.decimalSeparator.value === "," ? "For example 19,50" : "For example 19.50";
  setDecimalHint("Set from the currency. We also check how your bill writes amounts.");
}
elements.decimalSeparator.addEventListener("change", () => { decimalChosen = true; setDecimalHint("Chosen by you."); });
elements.currency.addEventListener("change", decimalFromCurrency);
decimalFromCurrency();
elements.currency.addEventListener("change", () => {
  reviewState.candidates = reviewState.candidates.map((candidate) => candidate.id.startsWith("groq-") ? candidate : ({ ...candidate, currency: elements.currency.value }));
  invalidatePayload();
});
for (const input of [elements.expectedAmount, elements.decimalSeparator, elements.messageType, elements.earlierPeriodGroup]) {
  input.addEventListener("input", () => invalidatePayload());
}
elements.accessCode.addEventListener("input", () => {
  try { sessionStorage.setItem("billshield-access", elements.accessCode.value.trim()); } catch { /* storage unavailable */ }
});
elements.accessCode.addEventListener("change", () => savedChecks.load());
document.querySelector("#page-select").addEventListener("input", (event) => {
  const pages = [...reviewState.pageElements.keys()];
  const { pages: chosen, error } = parsePageList(event.target.value, pages);
  reviewState.pageSelectError = error;
  if (!error) reviewState.skippedPages = new Set(pages.filter(page => !chosen.includes(page)));
  refreshPageControls();
});
showAccessBoxIfNeeded().then(() => savedChecks.load());
window.addEventListener("beforeunload", clearObjectUrls);
