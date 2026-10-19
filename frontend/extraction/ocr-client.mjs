export async function extractImageTokens(image, options = {}) {
  const maxBytes = options.maxBytes ?? 4_000_000;
  if (Number.isFinite(image?.size) && image.size > maxBytes) {
    throw new Error(`image is too large; limit is ${maxBytes} bytes`);
  }
  let createWorker = options.createWorker;
  if (!createWorker) {
    const tesseract = (await import("../vendor/tesseract/tesseract.esm.min.js")).default;
    createWorker = tesseract.createWorker;
  }
  const language = options.language || "eng";
  const worker = await createWorker(language);
  try {
    if (options.segmentationMode != null) {
      await worker.setParameters({ tessedit_pageseg_mode: String(options.segmentationMode) });
    }
    const result = await worker.recognize(image, {}, { blocks: true });
    const words = result.data.words || (result.data.blocks || []).flatMap((block) =>
      (block.paragraphs || []).flatMap((paragraph) =>
        (paragraph.lines || []).flatMap((line) => line.words || [])));
    let sourceWidth = image.width;
    let sourceHeight = image.height;
    if ((!sourceWidth || !sourceHeight) && typeof createImageBitmap === "function" && image instanceof Blob) {
      const bitmap = await createImageBitmap(image);
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
      bitmap.close();
    }
    const width = result.data.imageSize?.width || sourceWidth || 1;
    const height = result.data.imageSize?.height || sourceHeight || 1;
    return Object.freeze(words.map((word, index) => Object.freeze({
      id: `p1-o${index + 1}`,
      page: 1,
      text: String(word.text || "").trim(),
      confidence: Number(word.confidence ?? 0) / 100,
      bounds: Object.freeze({
        x0: word.bbox.x0 / width,
        top: word.bbox.y0 / height,
        x1: word.bbox.x1 / width,
        bottom: word.bbox.y1 / height,
      }),
    })).filter((token) => token.text));
  } finally {
    await worker.terminate();
  }
}
