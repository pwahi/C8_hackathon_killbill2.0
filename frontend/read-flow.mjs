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
  if (total <= 1 || chosen === total) return "Read the whole bill";
  if (chosen === 0) return "Choose at least one page";
  return `Read ${chosen} of ${total} pages`;
}
