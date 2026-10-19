// Message tone. Twin of backend/billshield_core/tone.py (same texts, tested on both sides).
// Only the greeting and closing change; the sentences with amounts stay exactly as Python wrote them.

export const TONES = ["warm", "neutral", "direct"];
const WARM_OPENING = "Hello, I hope you are doing well. ";
const WARM_CLOSING = " Thank you very much for your help, I appreciate it.";
const DIRECT_CLOSING = " I would like a clear answer and, if a charge turns out to be incorrect, an adjustment. Please reply as soon as possible.";

export function applyTone(text, tone) {
  if (!TONES.includes(tone)) throw new Error("unknown tone");
  if (tone === "neutral") return text;
  let body = text.startsWith("Hello, ") ? text.slice("Hello, ".length) : text;
  body = body.charAt(0).toUpperCase() + body.slice(1);
  return tone === "warm" ? WARM_OPENING + body + WARM_CLOSING : body + DIRECT_CLOSING;
}
