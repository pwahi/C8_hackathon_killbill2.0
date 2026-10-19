import { readingProgress, readingInstruction } from "./read-flow.mjs";
export const STEPS = ["Your bill", "Read", "Check the lines", "What we found", "Your message"];

// Presence only: Python still parses money and owns every comparison.
export function requireExpectedAmount(value) {
  const amount = value == null ? "" : String(value).trim();
  if (!amount) throw new Error("Enter what you expected to pay before reviewing the bill. Don’t guess if you don’t know.");
  return amount;
}

export function canVisit(step, { opened, complete, busy }) {
  return Number.isInteger(step) && step >= 0 && step < STEPS.length &&
    (step === 0 || ([1, 2].includes(step) && opened) || (step >= 3 && complete && !busy));
}

export function createFlow() {
  const $ = (selector) => document.querySelector(selector);
  const make = (tag, className, html = "") => {
    const node = document.createElement(tag); node.className = className; node.innerHTML = html; return node;
  };
  const state = { opened: false, complete: false, busy: false };
  let current = 0;
  $(".brand-bar").append($("#flow-nav"));
  const status = $("#status");
  $("main").prepend(status);
  $(".setup").dataset.flowPanel = "0";
  $("#review").dataset.flowPanel = "review";
  $("#payload-panel").dataset.flowPanel = "2";
  $("#result-panel").dataset.flowPanel = "3";

  const intro = make("div", "provide-intro");
  intro.append($(".flow-heading"), $(".file-control"));
  const settings = make("div", "provide-settings");
  const controls = $(".control-grid");
  controls.prepend($("#expected-amount").closest("label"));
  settings.append(controls, $("#access-box"), $(".privacy-note"), $(".setup .actions"));
  $(".setup").replaceChildren(intro, settings);

  const readAside = make("aside", "panel read-instructions", '<p class="eyebrow">READ YOUR BILL</p><h2>One step at a time</h2><ol id="reading-steps" class="reading-steps" aria-label="Reading steps"></ol><p id="reading-guidance" role="status" aria-live="polite"></p><details class="reading-privacy"><summary>What leaves my device?</summary><p>Only the area you preview and approve passes through our server to Groq, our AI reader. Exclude names and personal details. The app does not save this as an image.</p></details>');
  const locally = make("button", "secondary", "Read it on this device instead");
  locally.addEventListener("click", () => {
    if (state.hasLines && !window.confirm("Local reading starts a new extraction of all selected pages and clears the current lines and corrections. Start over?")) return;
    $("#process").click();
  });
  const toCheck = make("button", "primary", "Review lines →");
  toCheck.id = "review-read-lines";
  toCheck.disabled = true;
  toCheck.addEventListener("click", () => go(2));
  readAside.append(locally, toCheck);
  $("#review").append(readAside);
  let readingStage = "choose", readingPage = 1, readingCount = 0;
  function paintReading() {
    $("#reading-steps").replaceChildren(...readingProgress(readingStage).map(({label, state}, index) => {
      const item = make("li", state);
      const number = make("span", "reading-number");
      number.textContent = String(index + 1);
      item.append(number, document.createTextNode(label));
      if (state === "current") item.setAttribute("aria-current", "step");
      return item;
    }));
    $("#reading-guidance").textContent = readingInstruction(readingStage, readingPage);
    toCheck.textContent = readingCount ? `Review ${readingCount} line${readingCount === 1 ? "" : "s"} →` : "Review lines →";
    toCheck.disabled = !readingCount || readingStage === "reading";
  }
  paintReading();

  const heading = make("div", "chapter-heading", '<p class="eyebrow" id="chapter-number"></p><h1 id="chapter-title" tabindex="-1"></h1><p id="chapter-description"></p>');
  $("main").insertBefore(heading, $("#review"));
  const advanced = make("details", "advanced-review", "<summary>Message options &amp; data preview</summary>");
  advanced.append($(".message-grid"), $("#preview-payload").parentElement, $("#payload-output"), $(".checkpoint"));
  const check = make("button", "primary", "Looks right — check it");
  check.id = "confirm-and-check";
  $("#payload-panel").append(make("p", "analysis-privacy", "Checking sends confirmed lines to our server. If there is a difference, Groq also receives those lines and the checked result—not your bill image."), check, advanced);
  $(".candidate-panel").append($("#payload-panel"));
  $("#candidate-list").before(make("div", "line-table-heading", "<span>LINE</span><span>WHAT IS IT</span><span>AMOUNT</span>"));
  const lineActions = make("div", "line-actions", '<button id="add-line" class="secondary" type="button">+ Add a line</button><button id="undo-remove" class="text-button" type="button" hidden>Undo remove</button>');
  $(".line-table-heading").before(lineActions);
  const totalPrompt = make("section", "printed-check-prompt", '<p id="printed-check-message"></p><button id="add-printed-total" class="secondary" type="button">Add printed total</button><div id="section-links"></div>');
  $("#payload-panel").prepend(totalPrompt);

  // Real API results only: sample values from the mock-up are never copied.
  const resultBody = make("div", "result-story");
  const math = make("aside", "result-math", '<h2 id="math-title" class="eyebrow">THE MATHS</h2><div id="recheck-source" hidden></div><div id="math-table"></div>');
  const detailed = make("details", "calculation-details", "<summary>Formulas &amp; confirmed sources</summary>");
  detailed.append($("#result-checks"), $("#result-lines"));
  math.append(detailed, make("p", "hint", "Every number comes from code using the lines you checked. A difference is not proof of a mistake."));
  const unknown = make("section", "unknown-summary", "<h2>Still unknown</h2>");
  unknown.append($("#result-missing"));
  const recheckBox = $("#recheck-box");
  resultBody.append($("#result-summary"), recheckBox, $("#result-gap"), unknown);
  const recheckBack = make("button", "primary", "Fix the lines");
  recheckBack.addEventListener("click", () => go(2));
  recheckBox.append(recheckBack);

  const draftPanel = make("section", "message-layout");
  draftPanel.dataset.flowPanel = "4";
  const draft = $("#draft-box");
  const sent = make("aside", "panel sent-panel", '<h2>Sent it?</h2><p id="finish-state">BillShield never sends anything. You choose where and when to send.</p>');
  sent.append(draft.querySelector(".sent-box"));
  const again = make("button", "text-button", "Check another bill");
  again.addEventListener("click", () => $("#reset").click());
  sent.append(again);
  draftPanel.append(draft, sent);
  $("#result-panel").replaceChildren(resultBody, math);
  $("main").append(draftPanel);

  const bar = make("div", "flow-actions");
  const back = make("button", "text-button", "← Back");
  back.addEventListener("click", () => go(current - 1));
  const next = make("button", "primary", "Write my message");
  next.addEventListener("click", () => go(4));
  bar.append(back, next);
  $("main").append(bar);
  const navButtons = STEPS.map((name, index) => {
    const button = make("button", "", `<span>${index + 1}</span> ${name}`);
    button.addEventListener("click", () => go(index));
    $("#flow-nav").append(button);
    return button;
  });
  const descriptions = ["", "Choose a page and follow the steps.", "Do these match your bill? Open a line to change it.", "", "Review the message before you copy or send it."];
  function paint() {
    document.body.dataset.uiStep = String(current);
    heading.hidden = current === 0;
    $("#chapter-number").textContent = `CHAPTER ${current + 1}`;
    $("#chapter-title").textContent = STEPS[current].toUpperCase();
    $("#chapter-description").textContent = descriptions[current];
    if (current === 2) $(".candidate-panel").prepend(heading);
    else if (current === 3) resultBody.prepend(heading);
    else if (current === 4) draft.prepend(heading);
    else $("main").insertBefore(heading, $("#review"));
    navButtons.forEach((button, index) => {
      button.disabled = !canVisit(index, state);
      if (index === current) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    back.hidden = current === 0;
    next.hidden = current !== 3 || !state.complete;
    next.disabled = state.busy;
  }
  function go(step, force = false) {
    if (!force && !canVisit(step, state)) return;
    current = step; paint();
    (current === 0 ? $("#flow-title") : $("#chapter-title")).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  paint();
  return {
    provide() { go(0, true); },
    read() { go(1); },
    reading(stage, page = readingPage) { readingStage = stage; readingPage = page; paintReading(); },
    linesChanged(count) { readingCount = count; state.hasLines = count > 0; paintReading(); },
    opened(hasLines = false) { state.opened = true; state.hasLines = hasLines; readingStage = hasLines ? "review" : "select"; paintReading(); go(hasLines ? 2 : 1); },
    extracted(stayReading = false) { state.opened = true; state.hasLines = readingCount > 0; if (stayReading) { readingStage = readingCount ? "review" : "select"; paintReading(); } go(stayReading ? 1 : 2); },
    invalidated() { state.complete = false; state.busy = false; if (current > 2) go(state.opened ? 2 : 0, true); else paint(); },
    reset() { state.opened = false; state.hasLines = false; state.complete = false; state.busy = false; readingStage = "choose"; readingPage = 1; readingCount = 0; paintReading(); $("#finish-state").textContent = "BillShield never sends anything. You choose where and when to send."; go(0, true); },
    result(result, pending = false) {
      state.complete = result.status === "complete"; state.busy = pending;
      $("#result-gap").hidden = !state.complete; unknown.hidden = !state.complete; go(3, true);
    },
    settled() { state.busy = false; paint(); },
    copied() { $("#finish-state").textContent = "Message copied. It has not been sent by BillShield."; },
  };
}
