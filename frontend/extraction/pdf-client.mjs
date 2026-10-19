export async function extractPdfTokens(data, options = {}) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  const maxBytes = options.maxBytes ?? 4_000_000;
  if (bytes.byteLength > maxBytes) throw new Error(`PDF is too large; limit is ${maxBytes} bytes`);
  const loadPdfJs = options.loadPdfJs || (() => import("../node_modules/pdfjs-dist/build/pdf.mjs"));
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const maxPages = options.maxPages ?? 10;
  if (pdf.numPages > maxPages) throw new Error(`PDF has ${pdf.numPages} pages; limit is ${maxPages}`);

  const tokens = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    content.items.forEach((item, index) => {
      const text = String(item.str || "").trim();
      if (!text) return;
      const x = item.transform[4];
      const height = Math.max(Number(item.height) || 1, 1);
      const top = viewport.height - item.transform[5] - height;
      const width = Math.max(Number(item.width) || 1, 1);
      tokens.push(Object.freeze({
        id: `p${pageNumber}-t${index + 1}`,
        page: pageNumber,
        text,
        bounds: Object.freeze({
          x0: Math.max(0, x / viewport.width),
          top: Math.max(0, top / viewport.height),
          x1: Math.min(1, (x + width) / viewport.width),
          bottom: Math.min(1, (top + height) / viewport.height),
        }),
      }));
    });
  }
  return Object.freeze({ pageCount: pdf.numPages, tokens: Object.freeze(tokens) });
}
