import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function hasArg(name) {
  return args.includes(name);
}

if (hasArg("--help")) {
  console.log(`Usage:
  node scripts/render-exburst-union-arena-card.mjs --number RLY-1-006 --output outputs/ua-rendered/RLY-1-006.png

Options:
  --number <id>       Union Arena card number, e.g. RLY-1-006.
  --url <url>         ExBurst card page URL. Overrides --number.
  --output <file>     Output PNG path. Defaults to outputs/ua-rendered/<number>.png.
  --chrome <file>     Chrome/Edge executable. Defaults to ${DEFAULT_CHROME_PATH}
  --timeoutMs <n>     Wait for the rendered canvas. Defaults to 30000.
`);
  process.exit(0);
}

const chromePath = readArg("--chrome", process.env.CHROME_PATH || DEFAULT_CHROME_PATH);
const timeoutMs = Math.max(5000, Number(readArg("--timeoutMs", "30000")) || 30000);
const settleMs = Math.max(0, Number(readArg("--settleMs", "1500")) || 1500);
const batchPath = readArg("--batch", "");

if (batchPath) {
  const cards = JSON.parse(readFileSync(batchPath, "utf8"));
  const rendered = await renderExBurstCards({
    cards: Array.isArray(cards) ? cards : cards.cards,
    chromePath,
    timeoutMs,
    settleMs,
    includeBase64: false,
  });
  console.log(JSON.stringify({ ok: true, rendered }));
  process.exit(0);
}

const number = String(readArg("--number", "")).trim();
const pageUrl = readArg("--url", number ? `https://exburst.dev/ua/cards/${encodeURIComponent(number)}` : "");
const outputPath = readArg("--output", number ? `outputs/ua-rendered/${safeFileName(number)}.png` : "");

if (!pageUrl) throw new Error("Pass --number <card> or --url <ExBurst card page>.");
if (!outputPath) throw new Error("Pass --output <file> when using --url without --number.");

const rendered = await renderExBurstCard({ pageUrl, chromePath, timeoutMs, settleMs });
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(outputPath, Buffer.from(rendered.base64, "base64"));
console.log(`Rendered ${rendered.width}x${rendered.height} card image to ${outputPath}`);

async function renderExBurstCard({ pageUrl, chromePath, timeoutMs, settleMs }) {
  const [rendered] = await renderExBurstCards({
    cards: [{ url: pageUrl }],
    chromePath,
    timeoutMs,
    settleMs,
    includeBase64: true,
  });
  return rendered;
}

async function renderExBurstCards({ cards, chromePath, timeoutMs, settleMs, includeBase64 = false }) {
  const renderJobs = (Array.isArray(cards) ? cards : [])
    .map((card) => ({
      number: String(card.number || "").trim(),
      name: String(card.name || "").trim(),
      url: String(card.url || card.renderedImagePageUrl || card.detailUrl || "").trim(),
      output: String(card.output || "").trim(),
    }))
    .filter((card) => card.url);
  if (!renderJobs.length) throw new Error("No ExBurst card render jobs were provided.");

  const port = 9300 + Math.floor(Math.random() * 1000);
  const profileDir = resolve(tmpdir(), `deckmanager-chrome-${process.pid}-${Date.now()}`);
  const cacheDir = resolve("outputs", "ua-rendered", ".chrome-cache");
  mkdirSync(cacheDir, { recursive: true });
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--disk-cache-dir=${cacheDir}`,
    "about:blank",
  ], { windowsHide: true, stdio: "ignore" });

  try {
    const webSocketDebuggerUrl = await waitForPageDebuggerUrl(port, timeoutMs);
    const cdp = await connectCdp(webSocketDebuggerUrl);
    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      const rendered = [];
      for (const job of renderJobs) {
        await cdp.send("Page.navigate", { url: job.url });
        await waitForLoad(cdp, timeoutMs);
        const data = await waitForRenderedCanvas(cdp, timeoutMs, settleMs);
        if (job.output) {
          mkdirSync(dirname(resolve(job.output)), { recursive: true });
          writeFileSync(job.output, Buffer.from(data.base64, "base64"));
        }
        const item = {
          number: job.number,
          name: job.name,
          outputPath: job.output,
          width: data.width,
          height: data.height,
        };
        if (includeBase64) item.base64 = data.base64;
        rendered.push(item);
      }
      return rendered;
    } finally {
      cdp.close();
    }
  } finally {
    chrome.kill();
    await waitForProcessExit(chrome, 3000).catch(() => {});
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Chrome to exit.")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForPageDebuggerUrl(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const newPageUrl = `http://127.0.0.1:${port}/json/new?about:blank`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(newPageUrl, { method: "PUT" });
      if (response.ok) {
        const json = await response.json();
        if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(150);
  }
  throw new Error("Timed out waiting for Chrome debugging port.");
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message || JSON.stringify(message.error)));
    else request.resolve(message.result || {});
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        },
        close() {
          for (const request of pending.values()) request.reject(new Error("CDP socket closed."));
          pending.clear();
          socket.close();
        },
      });
    });
    socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools.")));
  });
}

async function waitForLoad(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.result?.value === "complete") return;
    await sleep(250);
  }
  throw new Error("Timed out waiting for ExBurst page load.");
}

async function waitForRenderedCanvas(cdp, timeoutMs, settleMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  let firstReadyAt = 0;
  let lastReady = null;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(() => {
        const candidates = Array.from(document.querySelectorAll("canvas"))
          .map((canvas) => {
            let score = 0;
            try {
              const context = canvas.getContext("2d", { willReadFrequently: true });
              const width = canvas.width;
              const height = canvas.height;
              const stepX = Math.max(1, Math.floor(width / 40));
              const stepY = Math.max(1, Math.floor(height / 56));
              const pixels = context.getImageData(0, 0, width, height).data;
              let seen = 0;
              let visible = 0;
              for (let y = 0; y < height; y += stepY) {
                for (let x = 0; x < width; x += stepX) {
                  const index = (y * width + x) * 4;
                  const r = pixels[index];
                  const g = pixels[index + 1];
                  const b = pixels[index + 2];
                  const a = pixels[index + 3];
                  seen += 1;
                  if (a > 20 && r + g + b > 60) visible += 1;
                }
              }
              score = seen ? visible / seen : 0;
            } catch {
              score = 0;
            }
            return { canvas, area: canvas.width * canvas.height, score };
          })
          .filter((item) => item.canvas.width >= 500 && item.canvas.height >= 700)
          .sort((a, b) => b.score - a.score || b.area - a.area);
        for (const { canvas, score } of candidates) {
          if (score < 0.05) continue;
          try {
            const url = canvas.toDataURL("image/png");
            if (url && url.length > 10000) {
              return {
                ok: true,
                width: canvas.width,
                height: canvas.height,
                dataUrl: url,
              };
            }
          } catch (error) {
            return { ok: false, error: error.message || String(error) };
          }
        }
        return {
          ok: false,
          error: "No rendered card canvas found yet.",
          canvases: candidates.map(({ canvas, score }) => ({ width: canvas.width, height: canvas.height, score })),
        };
      })()`,
    });

    const value = result.result?.value;
    if (value?.ok && value.dataUrl) {
      lastReady = {
        width: value.width,
        height: value.height,
        base64: String(value.dataUrl).replace(/^data:image\/png;base64,/, ""),
      };
      if (!firstReadyAt) firstReadyAt = Date.now();
      if (Date.now() - firstReadyAt >= settleMs) return lastReady;
    }
    lastError = value?.error || "Canvas not ready.";
    await sleep(firstReadyAt ? 250 : 500);
  }
  if (lastReady) return lastReady;
  throw new Error(`Timed out waiting for rendered card canvas. ${lastError}`);
}

function safeFileName(value) {
  return String(value || "card").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
