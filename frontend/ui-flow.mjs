export const STEPS = ["Provide", "Confirm", "Understand", "Draft", "Finish"];

// Presence only: Python still parses money and owns every comparison.
export function requireExpectedAmount(value) {
  const amount = value == null ? "" : String(value).trim();
  if (!amount) throw new Error("Enter what you expected to pay before reviewing the bill. Don’t guess if you don’t know.");
  return amount;
}

// A completed result is required before exposing a draft; edits revoke it.
export function canVisit(step, { opened, complete, busy }) {
  return Number.isInteger(step) && step >= 0 && step < STEPS.length &&
    (step === 0 || (step === 1 && opened) || (step >= 2 && complete && !busy));
}

export function createFlow() {
  const $ = (selector) => document.querySelector(selector);
  const state = { opened: false, complete: false, busy: false };
  let current = 0;
  const copy = [
    ["Let’s check your bill.", "See what adds up, what needs explaining, and what to say next."],
    ["A quick check, together.", "Compare the charges with your bill. You have the final say."],
    ["Make sense of the difference.", "Checked numbers first. Possible explanations clearly labelled."],
    ["Your words. Backed by the bill.", "Review the message, make it yours, and copy it when you’re ready."],
    ["You’re in control from here.", "BillShield never contacts the provider. Sending is always your choice."],
  ];
  const panels = [$(".setup"), $("#review"), $("#result-panel")];
  panels.forEach((panel, index) => { panel.dataset.flowPanel = String(index); });

  const draftPanel = document.createElement("section");
  draftPanel.className = "panel draft-step";
  draftPanel.dataset.flowPanel = "3";
  draftPanel.setAttribute("aria-label", "Your message");
  draftPanel.append($("#draft-box"));
  const finishPanel = document.createElement("section");
  finishPanel.className = "panel finish-step";
  finishPanel.dataset.flowPanel = "4";
  finishPanel.innerHTML = '<div class="finish-symbol" aria-hidden="true">✓</div><h2>Bill checked. Next move is yours.</h2><p id="finish-state">Your message is ready. Copying does not mean it has been sent.</p>';
  finishPanel.append(draftPanel.querySelector(".sent-box"));
  const again = document.createElement("button");
  again.className = "secondary";
  again.textContent = "Check another bill";
  again.addEventListener("click", () => $("#reset").click());
  finishPanel.append(again);
  $("main").append(draftPanel, finishPanel);

  // Move noisy debugging and message settings behind one optional disclosure.
  const advanced = document.createElement("details");
  advanced.className = "advanced-review";
  advanced.innerHTML = "<summary>More options &amp; data preview</summary>";
  advanced.append($(".message-grid"), $("#preview-payload").parentElement, $("#payload-output"), $(".checkpoint"));
  $("#payload-panel").append(advanced);
  $("#payload-panel").dataset.flowPanel = "1";
  const check = document.createElement("button");
  check.id = "confirm-and-check";
  check.className = "primary";
  check.textContent = "Confirm and check charges →";
  $("#payload-panel").insertBefore(check, advanced);

  const resultDetails = document.createElement("details");
  resultDetails.innerHTML = "<summary>See the calculations and confirmed lines</summary>";
  const results = $(".result-grid > div");
  const unknown = document.createElement("section");
  unknown.className = "unknown-summary";
  unknown.innerHTML = "<h3>What’s still unknown</h3>";
  unknown.append($("#result-missing"));
  const gapHeading = results.querySelector("h3");
  gapHeading.textContent = "What might explain it?";
  $("#result-panel").append(gapHeading, $("#result-gap"), unknown);
  results.querySelectorAll("h3").forEach((h) => { if (h.textContent === "Still unknown") h.remove(); });
  resultDetails.append(results);
  $(".result-grid").replaceWith(resultDetails);
  const recheckBack = document.createElement("button");
  recheckBack.className = "primary";
  recheckBack.textContent = "Back to the charges";
  recheckBack.addEventListener("click", () => go(1));
  $("#recheck-box").append(recheckBack);

  const bar = document.createElement("div");
  bar.className = "flow-actions";
  const back = document.createElement("button");
  back.className = "text-button";
  back.textContent = "← Back";
  back.addEventListener("click", () => go(current - 1));
  const next = document.createElement("button");
  next.className = "primary";
  next.addEventListener("click", () => go(current + 1));
  bar.append(back, next);
  $("main").append(bar);
  const status = $("#status");
  $(".flow-heading").after(status);

  const navButtons = STEPS.map((name, index) => {
    const button = document.createElement("button");
    button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span> ${name}`;
    button.addEventListener("click", () => go(index));
    $("#flow-nav").append(button);
    return button;
  });

  function paint() {
    document.body.dataset.uiStep = String(current);
    $("#flow-kicker").textContent = `${String(current + 1).padStart(2, "0")} / ${STEPS[current].toUpperCase()}`;
    $("#flow-title").textContent = copy[current][0];
    $("#flow-description").textContent = copy[current][1];
    navButtons.forEach((button, index) => {
      button.disabled = !canVisit(index, state);
      if (index === current) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    back.hidden = current === 0;
    next.hidden = current < 2 || current === 4 || !state.complete;
    next.disabled = state.busy;
    next.textContent = current === 2 ? "Review my message →" : "Finish review →";
  }
  function go(step, force = false) {
    if (!force && !canVisit(step, state)) return;
    current = step;
    paint();
    $("#flow-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  paint();
  return {
    provide() { go(0, true); },
    opened() { state.opened = true; go(1); },
    invalidated() { state.complete = false; state.busy = false; if (current > 1) go(state.opened ? 1 : 0, true); else paint(); },
    reset() { state.opened = false; state.complete = false; state.busy = false; $("#finish-state").textContent = "Your message is ready. Copying does not mean it has been sent."; go(0, true); },
    result(result, pending = false) {
      state.complete = result.status === "complete";
      state.busy = pending;
      gapHeading.hidden = !state.complete;
      $("#result-gap").hidden = !state.complete;
      unknown.hidden = !state.complete;
      go(2, true);
    },
    settled() { state.busy = false; paint(); },
    copied() { $("#finish-state").textContent = "Message copied. It has not been sent by BillShield."; },
  };
}
