import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const host = "127.0.0.1";
const port = Number(process.env.BILLSHIELD_PORT || 4173);
const types = {
  ".css": "text/css; charset=utf-8",
  ".gz": "application/gzip",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

function localPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
  return target;
}

function trustedPost(request, purpose) {
  return request.method === "POST" && request.headers.origin === `http://${host}:${port}`
    && request.headers["x-billshield-review"] === purpose
    && String(request.headers["content-type"]).startsWith("application/json");
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function runPython(script, body, timeoutMs) {
  const python = resolve(root, "..", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  return new Promise((done, reject) => {
    const child = spawn(python, [resolve(root, "../scripts", script)], { windowsHide: true });
    let stdout = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, timeoutMs);
    child.on("error", reject);
    child.stdout.setEncoding("utf8"); // keep multi-byte characters intact across chunks
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 1_000_000) child.kill(); });
    child.stderr.on("data", () => {});
    child.on("close", () => { clearTimeout(timer); try { done(JSON.parse(stdout)); } catch { reject(new Error("invalid bridge response")); } });
    child.stdin.on("error", () => {});
    child.stdin.end(body);
  });
}

let groqBusy = false;
const server = createServer(async (request, response) => {
  const jsonResponse = (status, body) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (request.url === "/api/groq-extract") {
    if (!trustedPost(request, "redacted-crop")) {
      jsonResponse(403, { error: "Open this review at the local 127.0.0.1 address and confirm a redacted crop." });
      return;
    }
    if (groqBusy) { jsonResponse(429, { error: "One vision request is already running. Please wait." }); return; }
    groqBusy = true;
    try {
      const body = await readBody(request, 5_500_000);
      if (!body) { jsonResponse(413, { error: "Crop is too large. Select a smaller area." }); return; }
      const output = await runPython("groq_browser_bridge.py", body, 70000);
      jsonResponse(output.error ? 422 : 200, output);
    } catch {
      jsonResponse(502, { error: "Local vision bridge failed or timed out. Check that the Python environment is installed." });
    } finally { groqBusy = false; }
    return;
  }
  // Confirmed structured lines only -> local Python calculations and required draft. No network use.
  if (request.url === "/api/analyze") {
    if (!trustedPost(request, "confirmed-lines")) {
      jsonResponse(403, { error: "Open this review at the local 127.0.0.1 address." });
      return;
    }
    try {
      const body = await readBody(request, 200_000);
      if (!body) { jsonResponse(413, { error: "Confirmed review is too large." }); return; }
      const output = await runPython("analyze_confirmed_review.py", body, 20000);
      jsonResponse(output.error ? 422 : 200, output);
    } catch {
      jsonResponse(502, { error: "Local Python analysis failed. Check that the Python environment is installed." });
    }
    return;
  }
  // Confirmed lines -> Python recalculates -> only if there is a difference, Groq text model suggests causes.
  if (request.url === "/api/explain") {
    if (!trustedPost(request, "explain-difference")) {
      jsonResponse(403, { error: "Open this review at the local 127.0.0.1 address." });
      return;
    }
    if (groqBusy) { jsonResponse(429, { error: "One Groq request is already running. Please wait." }); return; }
    groqBusy = true;
    try {
      const body = await readBody(request, 200_000);
      if (!body) { jsonResponse(413, { error: "Confirmed review is too large." }); return; }
      const output = await runPython("explain_difference.py", body, 70000);
      jsonResponse(output.error ? 422 : 200, output);
    } catch {
      jsonResponse(502, { error: "Local explanation step failed or timed out. The Python result above is still valid." });
    } finally { groqBusy = false; }
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") { jsonResponse(405, { error: "Method not allowed" }); return; }
  const target = localPath(request.url || "/");
  if (!target || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": types[extname(target).toLowerCase()] || "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  createReadStream(target).pipe(response);
});

server.listen(port, host, () => {
  console.log(`BillShield local review: http://${host}:${port}`);
  console.log("Press Ctrl+C to stop. Bill files are selected in the browser and are not served by this process.");
});
