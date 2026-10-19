// UI progress only. A completed reading step is not a verified bill calculation.
export const READING_STEPS = ["Choose page", "Select prices", "Check preview", "Read", "Review lines"];
export const READING_STAGES = ["choose", "select", "preview", "reading", "review"];

export function readingProgress(stage) {
  const current = READING_STAGES.indexOf(stage);
  if (current < 0) throw new Error("Unknown reading step");
  return READING_STEPS.map((label, index) => ({label, state: index < current ? "done" : index === current ? "current" : "next"}));
}

export function readingInstruction(stage, page = 1) {
  if (!Number.isInteger(page) || page < 1) throw new Error("Choose a valid page");
  readingProgress(stage);
  return {
    choose: "Choose the page that shows the prices.",
    select: `Page ${page}: choose Select area to read, then draw around the charge labels and prices.`,
    preview: "Check the selected picture. If it is wrong, choose a different area. Nothing is sent until you approve it.",
    reading: "Reading your approved area. Please wait; we will not send it again automatically.",
    review: "Your lines are ready to review. Read another area or page if needed; earlier lines are kept.",
  }[stage];
}

// Which pages "Read" sends: every page except the ones the person unticked, in page order.
export function pagesToRead(pages, skipped = new Set()) {
  return [...pages].filter(page => !skipped.has(page)).sort((a, b) => a - b);
}

export function readButtonText(chosen, total) {
  if (total <= 1) return "Read my bill";
  if (chosen === 0) return "Choose at least one page";
  return chosen === total ? `Read all ${total} pages` : `Read ${chosen === 1 ? "1 page" : `${chosen} pages`}`;
}

// "Select pages" field (owner sketch 2026-10-19): the person types "1-2", "1, 3" or "2".
export function formatPageList(pages) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let end = i;
    while (sorted[end + 1] === sorted[end] + 1) end += 1;
    parts.push(end > i ? `${sorted[i]}-${sorted[end]}` : String(sorted[i]));
    i = end;
  }
  return parts.join(", ");
}

export function parsePageList(text, available) {
  const allowed = new Set(available);
  const pages = new Set();
  const tokens = String(text || "").split(/[,;\s]+/).filter(Boolean);
  if (!tokens.length) return { pages: [], error: "Type the pages to read, for example 1-2." };
  for (const token of tokens) {
    const match = /^(\d+)(?:[-–](\d+))?$/.exec(token);
    if (!match) return { pages: [], error: `"${token}" is not a page number. Use for example 1-2 or 1, 3.` };
    const from = Number(match[1]), to = Number(match[2] || match[1]);
    if (to < from) return { pages: [], error: `Write the range low to high, for example ${to}-${from}.` };
    for (let page = from; page <= to; page += 1) {
      if (!allowed.has(page)) return { pages: [], error: `This bill has page${available.length === 1 ? "" : "s"} ${formatPageList(available)} only.` };
      pages.add(page);
    }
  }
  return { pages: [...pages].sort((a, b) => a - b), error: null };
}
