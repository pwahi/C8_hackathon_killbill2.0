import { readingProgress, readingInstruction } from "./read-flow.mjs";
export const STEPS = ["Your bill", "Read", "Check the lines", "What we found", "Your message"];

// Stranger test 2026-10-19: people looked for a progress bar and were unsure what to do next. Every chapter says
// where you are and what to do now, in one sentence.
export const STEP_GUIDANCE = [
  "Upload your bill and tell us what you expected to pay.",
  "Press Read the whole bill. The AI reads every price; untick pages you don't want to send.",
  "Compare these lines with your bill. ✓ means Python checked the sums. Click a line to fix it, then press Looks right — check it.",
  "Here is what Python found. Next: write the message to the company.",
  "Copy this message and send it to the company yourself. Then come back and press I sent it.",
];
export const stepLabel = (index) => `STEP ${index + 1} OF ${STEPS.length}`;

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
  const INTRO = -1;  // the landing page (what it is, how to use it, the data workflow) comes before step 1
  let current = INTRO;
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
  // Owner sketch 2026-10-19: Chapter 1 is the form, with earlier checks in a column on the right.
  const provide = make("div", "provide-layout");
  $(".setup").before(provide);
  provide.append($(".setup"), $("#saved-checks"));
  $("#start-checking").addEventListener("click", () => go(0));
  $("#home-link").addEventListener("click", (event) => { event.preventDefault(); go(INTRO, true); });

  const readAside = make("aside", "panel read-instructions", '<p class="eyebrow">READ YOUR BILL</p><h2>Let the AI read your bill</h2><p class="read-lead">It finds every price and groups them the way your bill does. Python then checks every sum. About 20 seconds per page.</p>');
  // Owner decision 2026-10-19: reading every page is the main route; drawing an area stays the fallback.
  const whole = make("button", "primary", "Read the whole bill");
  whole.id = "read-whole-bill";
  const wholeHint = make("p", "hint", "The pages you tick go to our AI reader (<span class=\"vision-name\">Groq</span>). Your bill image is never saved.");
  // Other ways to read (draw an area, read on this device) stay available but out of the way; opening them shows
  // the area tools on the page and the step-by-step guide for drawing.
  const otherWays = make("details", "other-ways", '<summary>Other ways to read</summary><p>Select an area: draw a box around the prices on a page and check the picture before it is sent.</p><ol id="reading-steps" class="reading-steps" aria-label="Reading steps"></ol><p id="reading-guidance" role="status" aria-live="polite"></p><details class="reading-privacy"><summary>What leaves my device?</summary><p>Only the area you preview and approve passes through our server to <span class="vision-name">Groq</span>, our AI reader. Exclude names and personal details. The app does not save this as an image.</p></details>');
  otherWays.addEventListener("toggle", () => document.body.classList.toggle("area-mode", otherWays.open));
  // Filled by review-app.mjs when the bill has more than one page: untick a page to keep it on this device.
  const pageChoice = make("fieldset", "page-choice", "<legend>Pages to send</legend><div id=\"page-choice-boxes\"></div>");
  pageChoice.id = "page-choice";
  pageChoice.hidden = true;
  readAside.append(pageChoice);
  const locally = make("button", "secondary", "Read it on this device instead");
  locally.addEventListener("click", () => {
    if (state.hasLines && !window.confirm("Local reading starts a new extraction of all selected pages and clears the current lines and corrections. Start over?")) return;
    $("#process").click();
  });
  const toCheck = make("button", "primary", "Review lines →");
  toCheck.id = "review-read-lines";
  toCheck.disabled = true;
  toCheck.addEventListener("click", () => go(2));
  otherWays.append(locally);
  readAside.append(pageChoice, whole, toCheck, wholeHint, otherWays);
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
    toCheck.hidden = !readingCount;  // appears once there are lines, so Read has one main button
  }
  paintReading();

  const heading = make("div", "chapter-heading", '<p class="eyebrow" id="chapter-number"></p><div class="step-progress" aria-hidden="true"><span id="step-progress-bar"></span></div><h1 id="chapter-title" tabindex="-1"></h1><p id="chapter-description"></p>');
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
  const allLines = make("div", "all-lines-control", '<label><input id="accept-all-lines" type="checkbox" disabled aria-describedby="accept-all-hint"> I checked all ready lines against the bill</label><p id="accept-all-hint">No lines yet. This confirms what was read—not whether the bill adds up.</p>');
  $(".line-table-heading").before(allLines);
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
  const sent = make("aside", "panel sent-panel", '<h2>After you send it</h2><p id="finish-state">Kill Bill never sends anything. You choose where and when to send.</p>');
  sent.append(draft.querySelector(".sent-box"));
  const again = make("button", "text-button", "Check another bill");
  again.addEventListener("click", () => $("#reset").click());
  sent.append(again);
  // Message chapter: say plainly what the message is for and how to send it (stranger test, step 5).
  const sendGuide = make("ol", "send-guide", "<li>Pick a tone and edit the text if you like.</li><li>Press <strong>Copy message</strong>.</li><li>Paste it into an e-mail, chat or contact form to the company that sent the bill.</li><li>Come back and press <strong>I sent it</strong>, so we know it helped.</li>");
  sendGuide.setAttribute("aria-label", "How to send it");
  draft.querySelector(".tone-picker").before(sendGuide);
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
  function paint() {
    document.body.dataset.uiStep = current === INTRO ? "intro" : String(current);
    heading.hidden = current <= 0;
    if (current === INTRO) {
      navButtons.forEach((button, index) => { button.disabled = !canVisit(index, state); button.removeAttribute("aria-current"); });
      back.hidden = true; next.hidden = true;
      return;
    }
    $("#chapter-number").textContent = stepLabel(current);
    $("#step-progress-bar").style.width = `${((current + 1) / STEPS.length) * 100}%`;
    $("#chapter-title").textContent = STEPS[current].toUpperCase();
    $("#chapter-description").textContent = STEP_GUIDANCE[current];
    if (current === 2) $(".candidate-panel").prepend(heading);
    else if (current === 3) resultBody.prepend(heading);
    else if (current === 4) draft.prepend(heading);
    else $("main").insertBefore(heading, $("#review"));
    navButtons.forEach((button, index) => {
      button.disabled = !canVisit(index, state);
      if (index === current) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    back.hidden = false;  // on step 1, Back returns to the landing page
    next.hidden = current !== 3 || !state.complete;
    next.disabled = state.busy;
  }
  function go(step, force = false) {
    if (step !== INTRO && !force && !canVisit(step, state)) return;
    current = step; paint();
    (current === INTRO ? $("#landing-title") : current === 0 ? $("#flow-title") : $("#chapter-title")).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  paint();
  return {
    provide() { go(0, true); },
    read() { go(1); },
    check() { go(2, true); },
    readPage(page) { readingStage = "select"; readingPage = page; paintReading(); go(1, true); },
    reading(stage, page = readingPage) { readingStage = stage; readingPage = page; paintReading(); },
    linesChanged(count) { readingCount = count; state.hasLines = count > 0; paintReading(); },
    opened(hasLines = false) { state.opened = true; state.hasLines = hasLines; readingStage = hasLines ? "review" : "select"; paintReading(); go(hasLines ? 2 : 1); },
    extracted(stayReading = false) { state.opened = true; state.hasLines = readingCount > 0; if (stayReading) { readingStage = readingCount ? "review" : "select"; paintReading(); } go(stayReading ? 1 : 2); },
    invalidated() { state.complete = false; state.busy = false; if (current > 2) go(state.opened ? 2 : 0, true); else paint(); },
    reset() { state.opened = false; state.hasLines = false; state.complete = false; state.busy = false; readingStage = "choose"; readingPage = 1; readingCount = 0; paintReading(); $("#finish-state").textContent = "Kill Bill never sends anything. You choose where and when to send."; go(0, true); },
    result(result, pending = false) {
      state.complete = result.status === "complete"; state.busy = pending;
      $("#result-gap").hidden = !state.complete; unknown.hidden = !state.complete; go(3, true);
    },
    settled() { state.busy = false; paint(); },
    copied() { $("#finish-state").textContent = "Message copied. It has not been sent by Kill Bill."; },
  };
}
