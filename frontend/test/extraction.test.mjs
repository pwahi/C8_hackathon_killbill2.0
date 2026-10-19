import assert from "node:assert/strict";
import test from "node:test";

import { findAmountCandidates } from "../extraction/amount-candidates.mjs";
import { extractImageTokens } from "../extraction/ocr-client.mjs";
import { extractPdfTokens } from "../extraction/pdf-client.mjs";

function candidatesFor(text) {
  return findAmountCandidates([{ id: "test", page: 1, text, bounds: { x0: 0, top: 0, x1: 0.5, bottom: 0.1 } }]);
}

test("date ranges never become partial monetary amounts", () => {
  assert.deepEqual(candidatesFor("27.07.2026 - 07.08.2026"), []);
});

test("comma grouped prices retain all digits", () => {
  assert.deepEqual(candidatesFor("1,499 1,299").map((item) => item.rawAmount), ["1,499", "1,299"]);
});

test("letter identifiers do not become monetary substrings", () => {
  assert.deepEqual(candidatesFor("B297"), []);
});

test("European decimal comma is preserved", () => {
  assert.equal(candidatesFor("33,75")[0].rawAmount, "33,75");
});

test("bank and tax identifiers are excluded while tax charges remain eligible", () => {
  for (const text of ["IBAN 123.45", "VAT NO. 123.45", "BANK CODE 123.45", "Account 123.45"]) {
    assert.deepEqual(candidatesFor(text), []);
  }
  assert.equal(candidatesFor("Tax 12.50")[0].rawAmount, "12.50");
});

test("finds amount candidates without calculating", () => {
  const candidates = findAmountCandidates([
    { id: "p1-t1", text: "EUR 19.90", page: 1, bounds: { x0: 0, top: 0, x1: 0.2, bottom: 0.1 } },
  ]);
  assert.equal(candidates[0].rawAmount, "EUR 19.90");
  assert.equal(candidates[0].confirmed, false);
  assert.equal("amountMinor" in candidates[0], false);
});

test("does not treat ordinary whole numbers as money without a currency marker", () => {
  const candidates = findAmountCandidates([
    { id: "p1-t1", text: "Order 20261018 item 4", page: 1, bounds: { x0: 0, top: 0, x1: 0.2, bottom: 0.1 } },
  ]);
  assert.deepEqual(candidates, []);
});

test("whole-number amount is proposed only when its line has a money clue", () => {
  const bounds = { x0: 0.1, top: 0.2, x1: 0.2, bottom: 0.23 };
  const candidates = findAmountCandidates([
    { id: "p1-t1", text: "Grand total", page: 1, bounds },
    { id: "p1-t2", text: "392", page: 1, bounds: { ...bounds, x0: 0.7, x1: 0.8 } },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].rawAmount, "392");
  assert.equal(candidates[0].confirmed, false);
});

test("PDF extraction happens through an injected browser reader", async () => {
  const fakePdfJs = {
    getDocument() {
      return { promise: Promise.resolve({
        numPages: 1,
        async getPage() {
          return {
            getViewport: () => ({ width: 200, height: 400 }),
            getTextContent: async () => ({ items: [{ str: "Total 33.75", transform: [1, 0, 0, 1, 20, 40], width: 60, height: 10 }] }),
          };
        },
      }) };
    },
  };
  const result = await extractPdfTokens(new Uint8Array([1, 2]), { loadPdfJs: async () => fakePdfJs });
  assert.equal(result.tokens[0].text, "Total 33.75");
  assert.equal(result.tokens[0].page, 1);
  assert.equal(result.tokens[0].bounds.x0, 0.1);
});

test("PDF page limit is enforced before extraction", async () => {
  const fakePdfJs = { getDocument: () => ({ promise: Promise.resolve({ numPages: 11 }) }) };
  await assert.rejects(
    extractPdfTokens(new Uint8Array([1]), { loadPdfJs: async () => fakePdfJs, maxPages: 10 }),
    /limit/,
  );
});

test("local file-size limits are enforced before PDF parsing", async () => {
  await assert.rejects(
    extractPdfTokens(new Uint8Array([1, 2]), { loadPdfJs: async () => ({ getDocument: () => { throw new Error("must not parse"); } }), maxBytes: 1 }),
    /too large/,
  );
});

test("OCR worker is local, returns word boxes, and is terminated", async () => {
  let terminated = false;
  const worker = {
    recognize: async () => ({ data: {
      imageSize: { width: 100, height: 200 },
      words: [{ text: "59.90", confidence: 95, bbox: { x0: 10, y0: 20, x1: 30, y1: 40 } }],
    } }),
    terminate: async () => { terminated = true; },
  };
  const tokens = await extractImageTokens({ width: 100, height: 200 }, { createWorker: async () => worker });
  assert.equal(tokens[0].text, "59.90");
  assert.equal(tokens[0].confidence, 0.95);
  assert.equal(tokens[0].bounds.x0, 0.1);
  assert.equal(terminated, true);
});

test("real Tesseract block output is flattened into positioned words", async () => {
  const worker = {
    recognize: async () => ({ data: {
      blocks: [{ paragraphs: [{ lines: [{ words: [
        { text: "12.50", confidence: 90, bbox: { x0: 20, y0: 40, x1: 60, y1: 60 } },
      ] }] }] }],
    } }),
    terminate: async () => {},
  };
  const tokens = await extractImageTokens({ width: 200, height: 400 }, { createWorker: async () => worker });
  assert.equal(tokens[0].text, "12.50");
  assert.equal(tokens[0].bounds.x0, 0.1);
  assert.equal(tokens[0].bounds.bottom, 0.15);
});

test("local image-size limits are enforced before OCR", async () => {
  await assert.rejects(extractImageTokens({ size: 2 }, { maxBytes: 1 }), /too large/);
});

test("optional second reading configures segmentation before recognition", async () => {
  const calls = [];
  await extractImageTokens({ width: 10, height: 10 }, {
    segmentationMode: "11",
    createWorker: async () => ({
      setParameters: async (parameters) => calls.push(parameters.tessedit_pageseg_mode),
      recognize: async () => { calls.push("recognize"); return { data: { words: [] } }; },
      terminate: async () => calls.push("terminate"),
    }),
  });
  assert.deepEqual(calls, ["11", "recognize", "terminate"]);
});
