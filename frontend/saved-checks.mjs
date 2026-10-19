// "Your earlier checks": this browser's saved reviews, shown read-only. Every amount is Python's saved, formatted
// value from the server; nothing is calculated here. A saved check is never changed: checking again saves a new one.

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

export const ROLE_TEXT = { charge: "Charge", discount: "Discount", adjustment: "Adjustment", subtotal: "Subtotal", total: "Total" };

const make = (tag, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

// api(path, body) -> parsed JSON or throws; hasSession() -> whether this browser has saved anything before.
export function createSavedChecks({ api, hasSession, accessMissing }) {
  const list = document.querySelector("#saved-list");
  const empty = document.querySelector("#saved-empty");
  const section = document.querySelector("#saved-checks");
  const dialog = document.querySelector("#saved-dialog");
  const body = document.querySelector("#saved-dialog-body");

  async function load() {
    list.replaceChildren();
    section.hidden = false;
    if (!hasSession()) { empty.textContent = "No saved checks in this browser yet. Each check you complete is saved here."; return; }
    if (accessMissing()) { empty.textContent = "Enter the access code above to see your earlier checks."; return; }
    empty.textContent = "Loading your earlier checks…";
    try {
      const { reviews } = await api("/api/reviews", {});
      empty.textContent = reviews.length ? "" : "No saved checks in this browser yet. Each check you complete is saved here.";
      list.replaceChildren(...reviews.map(row));
    } catch (error) {
      empty.textContent = `Your earlier checks could not be loaded: ${error.message}`;
    }
  }

  function row(review) {
    const item = make("li");
    const button = make("button", "saved-row");
    button.type = "button";
    const outcome = outcomeText(review);
    button.append(make("span", "saved-when", whenText(review.createdAt)), make("span", "saved-name", review.name),
      make("span", "saved-total", review.total), make("span", `saved-outcome ${outcome.tone}`, outcome.text),
      make("span", "saved-message", MESSAGE_TEXT[review.messageStatus] || ""));
    button.addEventListener("click", () => open(review.id));
    item.append(button);
    return item;
  }

  async function open(id) {
    body.replaceChildren(make("p", "hint", "Opening…"));
    if (!dialog.open) dialog.showModal();
    try {
      const { review } = await api("/api/reviews/open", { billId: id });
      body.replaceChildren(...detail(review));
    } catch (error) {
      body.replaceChildren(make("p", "error", error.message), closeButton());
    }
  }

  function closeButton() {
    const close = make("button", "secondary", "Close");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    return close;
  }

  function detail(review) {
    const head = make("div", "saved-dialog-head");
    head.append(make("p", "eyebrow", `SAVED CHECK · ${whenText(review.createdAt).toUpperCase()}`),
      make("h2", "", review.verdictText), make("p", "hint", "Saved checks can't be changed. To correct something, check the bill again: that saves a new check."));
    const top = make("button", "text-button saved-close", "Close ×");
    top.type = "button";
    top.addEventListener("click", () => dialog.close());
    head.prepend(top);

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
    text.rows = 8;
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

  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  return { load, open };
}
