import { findAmountCandidates } from "./extraction/amount-candidates.mjs";
import { nearbyText } from "./extraction/candidate-context.mjs";
import { extractImageTokens } from "./extraction/ocr-client.mjs";
import { extractPdfTokens } from "./extraction/pdf-client.mjs";
import { buildServerPayload } from "./extraction/privacy.mjs";
import { prepareImage } from "./extraction/image-preparation.mjs";
import { cleanVisionColumns, formatAmount, readiness, toContractInput, visionSuggestion } from "./extraction/bulk-confirm.mjs";
import { createFlow, requireExpectedAmount } from "./ui-flow.mjs";
import { resultHeadline, mathRows } from "./result-display.mjs";

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
const flow = createFlow();
const LOCATOR_LABELS = { pdf_text: "PDF text", local_ocr: "local OCR", groq: "Groq (unverified)", user: "you" };
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
  return { tokens: [], candidates: [], pageElements: new Map(), objectUrls: [], payload: null, extractor: null, rechecked: false };
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

function regionKey(page, region) {
  return `${page}:${[region.x0, region.top, region.x1, region.bottom].map((value) => value.toFixed(4)).join(",")}`;
}

function previewGroqArea(page, bounds) {
  const source = reviewState.pageElements.get(page)?.querySelector("canvas, img");
  if (!source) return;
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
  groqDialog.showModal();
}

groqRedacted.addEventListener("change", () => { groqSend.disabled = !groqRedacted.checked || groqRequestRunning; });
document.querySelector("#groq-cancel").addEventListener("click", () => { pendingGroq = null; groqDialog.close(); });
groqSend.addEventListener("click", async () => {
  if (!pendingGroq || !groqRedacted.checked || groqRequestRunning) return;
  const selection = pendingGroq;
  groqRequestRunning = true;
  groqSend.disabled = true;
  groqDialog.close();
  setStatus("Sending the previewed charge area to Groq. Please wait; no automatic retries.", "busy");
  try {
    const response = await fetch("/api/groq-extract", {
      method: "POST",
      headers: apiHeaders("redacted-crop"),
      body: JSON.stringify({ imageBase64: selection.dataUrl.split(",")[1], mime: "image/png", redacted: true }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "Vision request failed");
    if (selection.generation !== reviewGeneration) return;
    const area = selection.bounds;
    if (["EUR", "INR"].includes(result.output.currency) && result.output.currency !== elements.currency.value) {
      elements.currency.value = result.output.currency;
      elements.currency.dispatchEvent(new Event("change"));
    }
    const added = result.output.lines.map((line) => {
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
      const box = line.bounds;
      // Valid crop-relative boxes map back to the page; otherwise the selected table area is the evidence.
      const bounds = box ? {
        x0: area.x0 + box.x0 * (area.x1 - area.x0),
        x1: area.x0 + box.x1 * (area.x1 - area.x0),
        top: area.top + box.top * (area.bottom - area.top),
        bottom: area.top + box.bottom * (area.bottom - area.top),
      } : null;
      return newCandidate({
        id: `groq-${crypto.randomUUID()}`, page: selection.page,
        precision: bounds ? "exact" : "table", locatedBy: "groq", bounds, region: bounds ? null : { ...area },
        extractor: "groq", rawAmount: amountText, extractedRawAmount: line.raw_amount == null ? null : amountText,
        role: suggestion.role, group: suggestion.group,
        breakdown: cleaned ? cleaned.columns : null,
        description: line.description, currency: line.currency || result.output.currency || elements.currency.value,
        context: "Groq vision suggestion · check against the original page",
        warning: [line.warning, ...suggestion.notes, ...(cleaned ? cleaned.notes : []), ...formatNotes, bounds
          ? "Model source box is unverified. Inspect it before confirming."
          : "Read from the dashed table area; the exact position of this amount is not known. Check the amount in that table before confirming."].filter(Boolean).join(" "),
      });
    });
    reviewState.candidates.push(...added);
    elements.candidateList.append(...added.map(candidateCard));
    elements.candidateCount.textContent = `${reviewState.candidates.length} to review`;
    invalidatePayload("Vision suggestions added. Review them and rebuild the safe preview.");
    drawHighlights();
    flow.extracted();
    setStatus(`Groq filled in ${added.length} lines. Compare them with your bill, open anything that needs fixing, then choose Looks right — check it.`);
  } catch (error) {
    if (selection.generation === reviewGeneration) setStatus(error.message, "failure");
  } finally { groqRequestRunning = false; pendingGroq = null; }
});

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
  try {
    const response = await fetch("/api/session", { method: "POST", headers: apiHeaders("session"), body: JSON.stringify(session?.refreshToken ? { refreshToken: session.refreshToken } : {}) });
    if (response.status === 503) { savingAvailable = false; session = null; return; }
    const answer = await response.json();
    if (!response.ok) throw new Error(answer.error || "session failed");
    session = { accessToken: answer.accessToken, refreshToken: answer.refreshToken, expiresAt: Date.now() + (answer.expiresIn || 3600) * 1000 };
  } catch {
    session = null;  // a stale refresh token or network problem: continue without saving
  }
  try { localStorage.setItem("billshield-session", JSON.stringify(session)); } catch { /* storage unavailable */ }
}

function showSaved(output) {
  savedMessageId = output.saved?.messageId || null;
  elements.sentNote.textContent = "";
  elements.markSent.disabled = !savedMessageId;
  if (savedMessageId) elements.saveNote.textContent = "✓ Saved to your private history (this browser only): the checked lines, the result and this draft. No bill image or OCR text is stored.";
  else if (output.saveError) elements.saveNote.textContent = output.saveError;
  else elements.saveNote.textContent = savingAvailable ? "" : "Saving is not switched on for this server.";
}

async function recordEvent(action, finalText = null) {
  if (!savedMessageId) return null;
  await ensureSession();
  const response = await fetch(`/api/messages/${encodeURIComponent(savedMessageId)}/events`, {
    method: "POST", headers: apiHeaders("message-event"), body: JSON.stringify({ action, finalText }),
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
  clearObjectUrls();
  reviewState = emptyState();
  elements.pages.replaceChildren();
  elements.candidateList.replaceChildren();
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

function addCandidate(candidate, message) {
  reviewState.candidates.push(candidate);
  elements.candidateList.append(candidateCard(candidate));
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
  vision.textContent = `Select charge table for Groq · page ${pageNumber}`;
  tools.append(manual, typed, vision);
  const pageOptions = document.createElement("details");
  pageOptions.className = "page-options";
  const optionsTitle = document.createElement("summary");
  optionsTitle.textContent = `Page ${pageNumber} · Add a line or read another area`;
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
    selecting = true;
    shell.classList.add("selecting");
    setStatus("Draw one box around the charge table, including labels and prices. You will preview it before sending anything to Groq.");
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
      const tag = document.createElement("span");
      tag.textContent = "Table area · not an exact amount location";
      area.append(tag);
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
  document.querySelectorAll(".highlight.active, .table-area.active, .page-shell.active").forEach((node) => node.classList.remove("active"));
  const candidate = reviewState.candidates.find((item) => item.id === candidateId);
  if (!candidate) return;
  let target;
  if (candidate.precision === "exact") target = document.querySelector(`.highlight[data-candidate-id="${CSS.escape(candidateId)}"]`);
  else if (candidate.precision === "table") target = document.querySelector(`.table-area[data-region-key="${CSS.escape(regionKey(candidate.page, candidate.region))}"]`);
  else target = reviewState.pageElements.get(candidate.page);
  target?.classList.add("active");
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  document.querySelector(`[data-card-id="${CSS.escape(candidateId)}"] input[data-field="description"]`)?.focus({ preventScroll: true });
}

function updateCandidate(candidateId, field, value) {
  const index = reviewState.candidates.findIndex((candidate) => candidate.id === candidateId);
  const candidate = reviewState.candidates[index];
  reviewState.candidates[index] = { ...candidate, [field]: value, attention: null };
  invalidatePayload();
  document.querySelector(`[data-card-id="${CSS.escape(candidateId)}"] .attention`)?.remove();
  const card = document.querySelector(`[data-card-id="${CSS.escape(candidateId)}"]`);
  card?.classList.toggle("confirmed", field === "confirmed" ? value : reviewState.candidates[index].confirmed);
  if (card) updateLineOverview(card, reviewState.candidates[index]);
  drawHighlights();
}

function evidenceText(candidate) {
  if (candidate.precision === "exact") return `Exact location on page ${candidate.page} · located by ${LOCATOR_LABELS[candidate.locatedBy] || "unknown"}`;
  if (candidate.precision === "table") return `Table area on page ${candidate.page} · exact position not known`;
  return `Page ${candidate.page} only · no position recorded`;
}

function updateLineOverview(card, candidate) {
  card.querySelector(".line-name").textContent = candidate.description || "Add a label";
  card.querySelector(".line-kind").textContent = ROLE_LABELS[candidate.role] || "Choose type";
  card.querySelector(".line-amount").textContent = candidate.rawAmount || "Add amount";
  card.classList.toggle("printed-total", candidate.role === "total" || candidate.role === "subtotal");
}

function candidateCard(candidate) {
  const card = document.createElement("article");
  card.className = `candidate-card${candidate.confirmed ? " confirmed" : ""}`;
  card.dataset.cardId = candidate.id;
  const top = document.createElement("div");
  top.className = "candidate-top";
  const confirm = document.createElement("label");
  confirm.className = "confirm-control";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = candidate.confirmed;
  checkbox.addEventListener("change", () => updateCandidate(candidate.id, "confirmed", checkbox.checked));
  confirm.append(checkbox, document.createTextNode("I checked this against the bill"));
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
  warning.textContent = candidate.warning || "Check every digit and decimal mark against the source before using this line.";
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
  groupLabel.append(document.createTextNode("Section / period (needed for subtotals)"));
  const group = document.createElement("input");
  group.placeholder = "For example: September";
  group.value = candidate.group || "";
  group.addEventListener("input", () => updateCandidate(candidate.id, "group", group.value));
  groupLabel.append(group);
  fields.append(amountLabel, descriptionLabel, roleLabel, groupLabel);
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
    attention.className = "attention";
    attention.textContent = candidate.attention;
    card.append(attention);
  }
  const editor = document.createElement("details");
  editor.className = "line-editor";
  editor.open = Boolean(candidate.attention || !candidate.role || !candidate.rawAmount || !candidate.description);
  const overview = document.createElement("summary");
  overview.className = "line-overview";
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
  elements.candidateList.replaceChildren(...candidates.map(candidateCard));
  elements.candidateCount.textContent = `${candidates.length} found`;
  drawHighlights();
  elements.review.hidden = false;
  elements.payloadPanel.hidden = false;
  flow.opened(candidates.length > 0);
}

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
  equals_expected: "exactly your expected amount",
  equals_difference: "exactly the difference from your expected amount",
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
  const nodes = [];
  if (!result.gap.needsExplanation) {
    elements.resultGap.replaceChildren(paragraph("No difference to explain, so nothing was sent to the AI."));
    return;
  }
  nodes.push(paragraph("✅ Checked by Python (exact arithmetic)", "gap-heading"));
  const exact = result.gap.exactMatches.map((match) => listItem(`${match.groupLabel ? `Group "${match.groupLabel}"` : match.labels.join(" + ")} adds up to ${match.amount}: ${MATCH_TEXT[match.kind]}.`));
  const list = document.createElement("ul");
  list.replaceChildren(...(exact.length ? exact : [listItem("No line or group adds up exactly to the difference. The cause may be outside this bill (for example a different original quote).")]));
  if (result.gap.ambiguous) list.append(listItem("Several combinations fit, so the arithmetic alone cannot single out one cause."));
  nodes.push(list, paragraph("An exact match shows where the amount sits on the bill; it does not prove why it was charged.", "hint"));

  nodes.push(paragraph("💡 AI suggestion (not verified)", "gap-heading"));
  if (ai.state === "asking") nodes.push(paragraph("Asking Groq (gpt-oss-20b). Only confirmed labels, amounts and Python's results are sent; no image.", "hint"));
  if (ai.state === "error") nodes.push(paragraph(ai.message, "error"));
  if (ai.state === "done") {
    const labels = Object.fromEntries(result.lines.map((line) => [line.id, line.description]));
    const causes = document.createElement("ul");
    causes.replaceChildren(...ai.explanation.likelyCauses.map((cause) => listItem(`${cause.lineIds.map((id) => labels[id]).join(" + ")} — ${cause.likelihood} likelihood — ${cause.reason}`)));
    nodes.push(causes);
    if (ai.explanation.unexplained) nodes.push(paragraph(`Still unexplained: ${ai.explanation.unexplained}`));
    if (ai.explanation.evidenceToRequest.length) nodes.push(paragraph(`Evidence that would settle it: ${ai.explanation.evidenceToRequest.join("; ")}`));
    nodes.push(paragraph(`Model: ${ai.explanation.model}. Its text contains no amounts; every number on this page comes from Python.`, "hint"));
  }
  const facts = document.createElement("section");
  facts.className = "python-facts";
  const suggestion = document.createElement("section");
  suggestion.className = "ai-reason";
  let target = facts;
  for (const node of nodes) {
    if (node.classList.contains("gap-heading") && node.textContent.includes("AI suggestion")) target = suggestion;
    target.append(node);
  }
  elements.resultGap.replaceChildren(facts, suggestion);
}

function markSuspects(suspects) {
  const notes = new Map();
  for (const suspect of suspects) for (const id of suspect.lineIds) notes.set(id, `Check this line: ${suspect.text}`);
  reviewState.candidates = reviewState.candidates.map((candidate) => ({ ...candidate, attention: notes.get(candidate.id) || candidate.attention }));
  elements.candidateList.replaceChildren(...reviewState.candidates.map(candidateCard));
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
    verdict.append(" ", amount);
  }
  verdict.title = needsRecheck ? "Check the reading before continuing" : VERDICT_LABELS[result.verdict] || result.verdict;
  elements.recheckBox.hidden = !needsRecheck;
  elements.draftBox.hidden = needsRecheck;
  if (needsRecheck) {
    elements.resultSuspects.replaceChildren(...result.suspects.map((suspect) => listItem(suspect.text)));
    markSuspects(result.suspects);
  }
  const totals = document.createElement("p");
  const parts = [`Calculated total: ${result.amounts.calculatedTotal}`];
  if (result.amounts.printedTotal) parts.push(`printed total: ${result.amounts.printedTotal}`);
  if (result.amounts.expected) parts.push(`you expected: ${result.amounts.expected}`, `difference: ${result.amounts.difference}`);
  totals.textContent = parts.join(" · ");
  elements.resultSummary.replaceChildren(verdict, totals);
  const table = document.createElement("table");
  table.className = "math-table";
  table.setAttribute("aria-label", "Code-checked bill amounts");
  const tableBody = document.createElement("tbody");
  for (const row of mathRows(result)) {
    const tr = document.createElement("tr");
    tr.className = `math-${row.kind}`;
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
  elements.draftText.value = result.draft ? result.draft.text : "";
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
  let confirmed = 0;
  let attention = 0;
  let noRole = 0;
  reviewState.candidates = reviewState.candidates.map((candidate) => {
    if (candidate.confirmed) return candidate;
    if (!candidate.role) { noRole += 1; return candidate; }
    const reason = readiness(candidate, elements.currency.value);
    if (reason) { attention += 1; return { ...candidate, attention: `Not confirmed: ${reason}` }; }
    confirmed += 1;
    return { ...candidate, confirmed: true, attention: null };
  });
  elements.candidateList.replaceChildren(...reviewState.candidates.map(candidateCard));
  invalidatePayload();
  drawHighlights();
  const parts = [`Confirmed ${confirmed} line${confirmed === 1 ? "" : "s"}.`];
  if (attention) parts.push(`${attention} need your attention (red note on the card).`);
  if (noRole) parts.push(`${noRole} without a role were left unticked; that is fine if they are not bill amounts.`);
  parts.push("When the selected charges are correct, continue with Looks right — check it.");
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
      ? "Photos selected. Recommended: Read with Groq. You will draw a box around the charge table and check it before anything is sent."
      : "PDF selected. Recommended: Read bill locally. Nothing is uploaded.");
  }
}

elements.files.addEventListener("change", recommendExtractor);
elements.confirmAll.addEventListener("click", confirmAllReady);
async function explainDifference(payload, generation) {
  setStatus("Python found a difference. Asking Groq (gpt-oss-20b) which lines likely cause it… Only confirmed labels and amounts are sent.", "busy");
  try {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: apiHeaders("explain-difference"),
      body: JSON.stringify(payload),
    });
    const output = await response.json();
    if (generation !== reviewGeneration || payload !== reviewState.payload) return;
    if (!response.ok || output.error) throw new Error(output.error || "Explanation request failed");
    showSaved(output);
    if (output.explanation) {
      renderResult(output.result, { state: "done", explanation: output.explanation });
      setStatus("Done. Python checked the numbers and the AI suggested likely causes. Check the message, edit it if needed, then copy it. Nothing has been sent.");
    } else {
      renderResult(output.result, { state: "error", message: output.explanationError || output.skipped || "No AI explanation." });
      setStatus("Numbers checked. The AI explanation was unavailable; your checked draft is ready in Your message.");
    }
  } catch (error) {
    if (generation !== reviewGeneration) return;
    elements.resultGap.querySelector(".hint")?.replaceWith(paragraph(`AI step failed: ${error.message}. The Python result and message are still valid.`, "error"));
    setStatus("Numbers checked. The AI explanation failed; your checked draft is ready in Your message.", "failure");
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
    const answer = await recordEvent("sent", elements.sentText.value.trim() || null);
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
  const photos = files.length && files.every((file) => /^image\/(jpeg|png)$/.test(file.type));
  (photos ? elements.openVision : elements.process).click();
});
document.querySelector("#confirm-and-check").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  confirmAllReady();
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
    reviewState.pageElements.get(1)?.startGroqSelection();
    const more = reviewState.pageElements.size > 1 ? " Afterwards, use the Groq button above each other page that has charges." : "";
    setStatus(`Bill opened locally. Draw one box around the charge table on page 1 (labels and prices). You will see the exact image before anything is sent.${more}`);
  } catch (error) { resetReview({ keepFiles: true }); setStatus(error.message, "failure"); }
  finally { button.disabled = false; }
});
elements.reset.addEventListener("click", () => {
  resetReview();
  setStatus("Cleared from this page. Previously saved reviews have not been deleted.");
});
elements.previewPayload.addEventListener("click", previewPayload);
elements.downloadPayload.addEventListener("click", downloadPayload);
elements.analyze.addEventListener("click", analyzeReview);
elements.copyDraft.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.draftText.value);
    flow.copied();
    setStatus("Message copied to your clipboard. BillShield has not sent anything; sending is up to you.");
    recordEvent("copied").catch(() => {});
  } catch {
    elements.draftText.select();
    setStatus("Copy was blocked by the browser. The message is selected; press Ctrl+C.", "failure");
  }
});
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
showAccessBoxIfNeeded();
window.addEventListener("beforeunload", clearObjectUrls);
