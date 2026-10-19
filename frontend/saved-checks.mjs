// "My previous bills": this browser's saved reviews, shown read-only. Every amount is Python's saved, formatted
// value from the server; nothing is calculated here. A saved check is never changed: checking again saves a new one.
// Layout (owner sketch 2026-10-19): a quiet button under "Read my bill" opens a window with the list of bills on the
// left and the chosen bill on the right.

export function whenText(iso, locale = "en-GB") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function outcomeText(review) {
  if (review.verdict === "checks_passed") return { text: "✓ Matches what you expected", tone: "ok" };
  if (review.verdict === "verified_mismatch") return { text: "✗ The bill's numbers don't add up", tone: "bad" };
  return { text: review.difference ? `Difference ${review.difference}` : "Difference found", tone: "warn" };
}

export const MESSAGE_TEXT = { "sent": "Message sent", "copied": "Message copied", "not sent yet": "Message not sent yet" };
const MESSAGE_SHORT = { "sent": "Sent", "copied": "Copied", "not sent yet": "Not sent" };

export const ROLE_TEXT = { charge: "Charge", discount: "Discount", adjustment: "Adjustment", subtotal: "Subtotal", total: "Total" };

// One short line per bill: "Claude Pro" / "19 Oct · EUR 21.78 · +EUR 3.78 · Not sent".
export function rowSummary(review, locale = "en-GB") {
  const date = new Date(review.createdAt);
  const day = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const result = review.verdict === "checks_passed" ? "Matches" : review.verdict === "verified_mismatch" ? "Doesn't add up"
    : review.difference ? `+${review.difference}` : "Difference";
  const title = (review.name || "Bill").split(" · ")[0].replace(/\s*\([^)]*\)\s*$/, "") || "Bill";
  return { title, meta: [day, review.total, result, MESSAGE_SHORT[review.messageStatus] || ""].filter(Boolean).join(" · "),
    tone: outcomeText(review).tone };
}

const make = (tag, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

// api(path, body) -> parsed JSON or throws; hasSession() -> whether this browser has saved anything before.
export function createSavedChecks({ api, hasSession, accessMissing }) {
  const button = document.querySelector("#open-history");
  const dialog = document.querySelector("#saved-dialog");
  const list = document.querySelector("#saved-list");
  const body = document.querySelector("#saved-dialog-body");
  let reviews = [];
  let selected = null;

  // Refresh the count on the button (and the list, if the window is open). Hidden when there is nothing to show.
  async function load() {
    reviews = [];
    if (hasSession() && !accessMissing()) {
      try { reviews = (await api("/api/reviews", {})).reviews; } catch { reviews = []; }
    }
    // Always visible next to Read my bill; greyed out until this browser has a saved bill.
    button.disabled = !reviews.length;
    button.textContent = reviews.length ? `My previous bills (${reviews.length})` : "My previous bills";
    button.title = reviews.length ? "" : "Bills you check are saved here, in this browser only.";
    if (dialog.open) renderList();
  }

  function renderList() {
    list.replaceChildren(...reviews.map(review => {
      const item = make("li");
      const row = make("button", `history-row${review.id === selected ? " selected" : ""}`);
      row.type = "button";
      const summary = rowSummary(review);
      row.append(make("span", "history-title", summary.title), make("span", `history-meta ${summary.tone}`, summary.meta));
      row.addEventListener("click", () => open(review.id));
      item.append(row);
      return item;
    }));
  }

  function show() {
    if (!dialog.open) dialog.showModal();
    renderList();
    if (reviews.length) open(selected && reviews.some(review => review.id === selected) ? selected : reviews[0].id);
  }

  async function open(id) {
    selected = id;
    renderList();
    body.replaceChildren(make("p", "hint", "Opening…"));
    try {
      const { review } = await api("/api/reviews/open", { billId: id });
      if (selected === id) body.replaceChildren(...detail(review));
    } catch (error) {
      body.replaceChildren(make("p", "error", error.message));
    }
  }

  function detail(review) {
    const head = make("div", "saved-dialog-head");
    head.append(make("p", "eyebrow", whenText(review.createdAt).toUpperCase()), make("h2", "", review.verdictText),
      make("p", "hint", "Saved bills can't be changed. To correct something, check the bill again."));

    const maths = make("dl", "saved-maths");
    for (const [label, value] of [["Sum of the confirmed lines", review.calculatedTotal], ["Total printed on the bill", review.printedTotal],
      ["You expected", review.expected], ["Difference", review.difference]]) {
      if (!value) continue;
      maths.append(make("dt", "", label), make("dd", "", value));
    }

    const table = make("table", "saved-lines");
    const header = make("tr");
    ["Line", "Type", "Page", "Amount"].forEach(text => header.append(make("th", "", text)));
    table.append(header);
    for (const line of review.lines) {
      const tr = make("tr", line.role === "total" || line.role === "subtotal" ? "printed" : "");
      tr.append(make("td", "", line.group ? `${line.description} (${line.group})` : line.description),
        make("td", "", ROLE_TEXT[line.role] || line.role), make("td", "", String(line.page)), make("td", "amount", line.amount));
      table.append(tr);
    }

    const parts = [head, maths, make("h3", "", `The ${review.lines.length} lines you checked`), table];
    if (review.stillUnknown.length) {
      const unknown = make("ul", "saved-unknown");
      review.stillUnknown.forEach(text => unknown.append(make("li", "", text)));
      parts.push(make("h3", "", "Still unknown"), unknown);
    }
    parts.push(...messagePart(review.message));
    return parts;
  }

  function messagePart(message) {
    const shown = message.sentText || message.draft;
    const text = make("textarea", "saved-message-text");
    text.value = shown;
    text.rows = 7;
    text.setAttribute("aria-label", "Saved message");
    const note = make("p", "hint saved-message-note");
    const history = message.events.map(event => `${event.action === "sent" ? "Sent" : "Copied"} ${whenText(event.at)}`).join(" · ");
    const copy = make("button", "primary", "Copy message");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(text.value); note.textContent = "Copied. Kill Bill has not sent anything."; }
      catch { text.select(); note.textContent = "Copy was blocked by the browser. The message is selected; press Ctrl+C."; }
      if (message.id) api(`/api/messages/${encodeURIComponent(message.id)}/events`, { action: "copied" }).catch(() => {});
    });
    const sent = make("button", "secondary", message.status === "sent" ? "Sent again" : "I sent it");
    sent.type = "button";
    sent.disabled = !message.id;
    sent.addEventListener("click", async () => {
      sent.disabled = true;
      try {
        const answer = await api(`/api/messages/${encodeURIComponent(message.id)}/events`,
          { action: "sent", finalText: text.value.trim() || null, tone: "neutral", draftShown: shown });
        note.textContent = answer.wordsChanged == null ? "Recorded as sent."
          : `Recorded as sent: ${answer.wordsChanged} word${answer.wordsChanged === 1 ? "" : "s"} changed compared with the saved text.`;
        load();
      } catch (error) { note.textContent = error.message; sent.disabled = false; }
    });
    note.textContent = history ? `History: ${history}` : "Not copied or sent yet.";
    const actions = make("div", "actions");
    actions.append(copy, sent);
    return [make("h3", "", message.sentText ? "What you sent (long numbers and e-mail addresses removed)" : "Your message"), text, actions, note];
  }

  button.addEventListener("click", show);
  document.querySelector("#history-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  return { load, open: show };
}
