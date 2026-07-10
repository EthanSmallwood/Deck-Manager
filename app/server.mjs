#!/usr/bin/env node

import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadCollection, setOwnedQuantity } from "../src/collectionstore.mjs";
import { deleteDeck, loadDecks, upsertDeck } from "../src/deckstore.mjs";
import { detectDecklogGame, fetchDecklogPayload } from "../src/games/decklog.mjs";
import { clearWeissDatabaseCache, importDecklogDeck, importEncoreDeck, loadWeissDatabase, resolveWeissDeck } from "../src/games/weiss.mjs";
import { importHololiveDecklogDeck, importHololiveDecklogPayload } from "../src/games/hololive.mjs";
import { clearRiftboundDatabaseCache, importPiltoverDeck, loadRiftboundDatabase } from "../src/games/riftbound.mjs";
import { clearUnionArenaDatabaseCache, importExburstUnionArenaDeck, loadUnionArenaDatabase } from "../src/games/union-arena.mjs";
import { loadSettings, saveSettings } from "../src/settingsstore.mjs";
import { getCachedTranslation, setCachedTranslation } from "../src/translationstore.mjs";
import { generateHololiveTtsDeck, generateWeissTtsDeck, serveAsset } from "../src/tts/weiss-tts.mjs";

const PORT = Number(portArg() || process.env.PORT || 17777);
let currentPort = PORT;
let weissBuildJob = null;
let hololiveBuildJob = null;
let riftboundBuildJob = null;
let unionArenaBuildJob = null;
let weissSeriesCache = null;
let encoreSeriesListCache = null;
const encoreSeriesCardsCache = new Map();

const publicRoot = resolve("app/public");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${currentPort}`}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const db = loadWeissDatabase();
      sendJson(response, 200, {
        ok: true,
        games: ["Weiss Schwarz (EN)", "Weiss Schwarz (JP)", "Hololive OCG", "Riftbound", "Union Arena (EN)", "Union Arena (JP)"],
        weissCards: db.cards.length,
        weissJpCards: loadWeissDatabase("jp").cards.length,
        hololiveCards: countJsonCards("data/cards/hololive-cards.json"),
        riftboundCards: loadRiftboundDatabase().length,
        unionArenaCards: loadUnionArenaDatabase("en").length,
        unionArenaJpCards: loadUnionArenaDatabase("jp").length,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/decks") {
      sendJson(response, 200, { ok: true, decks: loadDecks() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/collection") {
      sendJson(response, 200, { ok: true, collection: loadCollection() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/collection/cards") {
      const body = await readJsonBody(request);
      const collection = setOwnedQuantity(body.number, body.qty);
      sendJson(response, 200, { ok: true, collection });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/collection/cards/search") {
      sendJson(response, 200, { ok: true, ...collectionCards(url) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/collection/weiss/cards") {
      sendJson(response, 200, { ok: true, ...collectionCards(url, "Weiss Schwarz (EN)") });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/collection/hololive/sets") {
      sendJson(response, 200, { ok: true, sets: listHololiveCardSets() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/collection/riftbound/sets") {
      sendJson(response, 200, { ok: true, sets: listRiftboundCardSets() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/collection/union-arena/sets") {
      sendJson(response, 200, { ok: true, sets: listUnionArenaCardSets(unionArenaLocaleFromUrl(url)) });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/decks/") && url.pathname.endsWith("/missing")) {
      const id = decodeURIComponent(url.pathname.slice("/api/decks/".length, -"/missing".length));
      const deck = loadDecks().find((item) => item.id === id);
      if (!deck) {
        sendJson(response, 404, { ok: false, error: "Deck not found." });
        return;
      }
      sendJson(response, 200, { ok: true, ...deckMissing(deck) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/settings") {
      sendJson(response, 200, { ok: true, settings: loadSettings() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/settings") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, settings: saveSettings(body) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/cache/images") {
      sendJson(response, 200, { ok: true, ...clearImageCache() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/decks") {
      const body = await readJsonBody(request);
      sendJson(response, 200, { ok: true, deck: upsertDeck(body) });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/decks/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/decks/".length));
      sendJson(response, 200, { ok: true, deleted: deleteDeck(id) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weiss/resolve") {
      const body = await readJsonBody(request);
      const result = resolveWeissDeck(body.deckText || "", { locale: body.locale || (body.jp ? "jp" : "en") });
      sendJson(response, 200, { ok: !result.missing.length, ...result });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/weiss/search") {
      const locale = canonicalGame(url.searchParams.get("game") || "") === "Weiss Schwarz (JP)" ? "jp" : "en";
      const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const title = String(url.searchParams.get("title") || "").trim();
      const titleCodes = weissTitleCodes(title);
      const filters = {
        type: String(url.searchParams.get("type") || "").trim().toLowerCase(),
        color: String(url.searchParams.get("color") || "").trim().toLowerCase(),
        trigger: String(url.searchParams.get("trigger") || "").trim().toLowerCase(),
        levelMin: numberParam(url, "levelMin"),
        levelMax: numberParam(url, "levelMax"),
        costMin: numberParam(url, "costMin"),
        costMax: numberParam(url, "costMax"),
        powerMin: numberParam(url, "powerMin"),
        powerMax: numberParam(url, "powerMax"),
        soulMin: numberParam(url, "soulMin"),
        soulMax: numberParam(url, "soulMax"),
        hideAlt: url.searchParams.get("hideAlt") === "1",
      };
      const cards = loadWeissDatabase(locale).cards
        .filter((card) => !titleCodes.length || titleCodes.includes(titleCode(card.number)))
        .filter((card) => matchesWeissFilters(card, filters))
        .filter((card) => {
          if (!q) return true;
          return [
            card.number,
            card.name,
            card.cardType,
            card.color,
            card.level,
            card.rarity,
            card.text,
          ].join(" ").toLowerCase().includes(q);
        });
      sendJson(response, 200, { ok: true, ...pageCards(cards, url, 120) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/weiss/series") {
      const locale = String(url.searchParams.get("locale") || "").toLowerCase() === "jp" || canonicalGame(url.searchParams.get("game") || "") === "Weiss Schwarz (JP)" ? "jp" : "en";
      sendJson(response, 200, { ok: true, series: listWeissSeries(locale) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weiss/encore") {
      const body = await readJsonBody(request);
      const result = await importEncoreDeck(body.url || body.deckId || "");
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weiss/decklog") {
      const body = await readJsonBody(request);
      const result = await importDecklogDeck(body.url || body.deckId || "");
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weiss/translate") {
      const body = await readJsonBody(request);
      const cards = Array.isArray(body.cards) ? body.cards : [];
      const translations = await translateWeissCards(cards);
      sendJson(response, 200, { ok: true, translations });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weiss/proxy-card") {
      const body = await readJsonBody(request);
      const result = await generateWeissProxyCard(body.card || body, {
        boxOpacity: body.boxOpacity,
        blurBox: body.blurBox,
      });
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weiss/proxy-deck") {
      const body = await readJsonBody(request);
      const result = await generateWeissProxyDeck(body.cards || [], body.name || body.deckName || "deck");
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/hololive/decklog") {
      const body = await readJsonBody(request);
      const result = await importHololiveDecklogDeck(body.url || body.deckId || "");
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/riftbound/piltover") {
      const body = await readJsonBody(request);
      const result = await importPiltoverDeck(body.url || body.deckId || "");
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/union-arena/exburst") {
      const body = await readJsonBody(request);
      const result = await importExburstUnionArenaDeck(body.url || body.deckId || "");
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/decklog/import") {
      const body = await readJsonBody(request);
      const decklog = await fetchDecklogPayload(body.url || body.deckId || "");
      const detectedGame = detectDecklogGame(decklog.payload);
      let result;

      if (detectedGame === "Hololive OCG") {
        result = importHololiveDecklogPayload(decklog.deckId, decklog.payload);
      } else if (detectedGame === "Weiss Schwarz") {
        result = await importDecklogDeck(body.url || body.deckId || "");
      } else {
        result = { ok: false, error: "Could not detect Decklog game." };
      }

      sendJson(response, 200, { ...result, detectedGame });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weiss/build-db") {
      const body = await readJsonBody(request);
      const job = startWeissCardDatabaseBuild(body.locale || "en");
      sendJson(response, 202, { ok: true, job });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/weiss/build-db/status") {
      sendJson(response, 200, { ok: true, job: weissBuildJob });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/hololive/build-db") {
      const job = startHololiveCardDatabaseBuild();
      sendJson(response, 202, { ok: true, job });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/hololive/build-db/status") {
      sendJson(response, 200, { ok: true, job: hololiveBuildJob });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/riftbound/build-db") {
      const job = startRiftboundCardDatabaseBuild();
      sendJson(response, 202, { ok: true, job });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/riftbound/build-db/status") {
      sendJson(response, 200, { ok: true, job: riftboundBuildJob });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/union-arena/build-db") {
      const body = await readJsonBody(request);
      const job = startUnionArenaCardDatabaseBuild(body.locale || "en");
      sendJson(response, 202, { ok: true, job });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/union-arena/render-card") {
      const body = await readJsonBody(request);
      const result = renderUnionArenaCardImage(body.card || body);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/union-arena/render-cards") {
      const body = await readJsonBody(request);
      const result = renderUnionArenaCardImages(body.cards || []);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/union-arena/build-db/status") {
      sendJson(response, 200, { ok: true, job: unionArenaBuildJob });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/tts/weiss") {
      const body = await readJsonBody(request);
      const decks = loadDecks();
      const deck = decks.find((item) => item.id === body.deckId);
      if (!deck) {
        sendJson(response, 404, { ok: false, error: "Deck not found." });
        return;
      }
      if (!isWeissGame(deck.game) && deck.game !== "Hololive OCG") {
        sendJson(response, 400, { ok: false, error: "TTS export currently supports Weiss Schwarz and Hololive OCG decks." });
        return;
      }
      const result = deck.game === "Hololive OCG"
        ? await generateHololiveTtsDeck(deck, currentPort, loadSettings())
        : await generateWeissTtsDeck(deck, currentPort, loadSettings());
      sendJson(response, 200, { ok: true, ...result });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
      serveAsset(response, decodeURIComponent(url.pathname.slice("/assets/".length)));
      return;
    }

    if (request.method === "GET") {
      const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      servePublic(response, relativePath);
      return;
    }

    sendText(response, 404, "Not found", "text/plain; charset=utf-8");
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, error: error.message || String(error) });
  }
});

listenWithFallback(PORT);

function servePublic(response, relativePath) {
  const filePath = resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + sep)) {
    sendText(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendText(response, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}

function listenWithFallback(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < PORT + 20) {
      listenWithFallback(port + 1);
      return;
    }
    throw error;
  });

  currentPort = port;
  server.listen(port, "127.0.0.1", () => {
    console.log(`Deckmanager: http://127.0.0.1:${port}/`);
    console.log("Keep this server running while TTS imports/uploads generated sheet assets.");
  });
}

function sendJson(response, status, payload) {
  sendText(response, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

function sendText(response, status, text, contentType) {
  response.writeHead(status, { "content-type": contentType });
  response.end(text);
}

function clearImageCache() {
  const ttsRoot = resolve("outputs", "tts");
  if (!existsSync(ttsRoot)) return { directoriesDeleted: 0, filesDeleted: 0 };

  let directoriesDeleted = 0;
  let filesDeleted = 0;

  for (const entry of readdirSync(ttsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    for (const cacheDirName of ["images", "sheets"]) {
      const cacheDir = resolve(ttsRoot, entry.name, cacheDirName);
      if (!isInside(cacheDir, ttsRoot) || !existsSync(cacheDir)) continue;

      filesDeleted += countFiles(cacheDir);
      rmSync(cacheDir, { recursive: true, force: true });
      directoriesDeleted += 1;
    }
  }

  return { directoriesDeleted, filesDeleted };
}

async function generateWeissProxyCard(card, options = {}) {
  if (!isProxyCandidate(card)) {
    throw new Error("Proxy generation needs a translated JP Weiss card with an official JP image.");
  }

  const outDir = options.outputDir || resolve("outputs", "proxies", "weiss-jp");
  const sourceDir = resolve(outDir, "source");
  const manifestDir = resolve(outDir, "manifest");
  const slug = safeFileName(card.number || card.name || "card");
  const version = Date.now().toString(36);
  const basePath = resolve(sourceDir, `${slug}.png`);
  const outputPath = resolve(outDir, `${slug}-${version}.png`);
  const manifestPath = resolve(manifestDir, `${slug}-${version}.json`);

  if (!existsSync(basePath)) await downloadFile(card.imageUrl, basePath);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify({
    basePath,
    outputPath,
    number: card.number || "",
    name: card.name || "",
    cardType: card.cardType || card.section || "",
    traits: card.tags || "",
    color: card.color || "",
    text: proxyImageText(card.text || ""),
    boxOpacity: options.boxOpacity ?? 0.70,
    blurBox: options.blurBox ?? true,
  }, null, 2)}\n`);

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts/make-weiss-proxy.ps1"), "-Manifest", manifestPath],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`Proxy generation failed: ${result.stderr || result.stdout || result.status}`);
  }

  return {
    number: card.number || "",
    name: card.name || "",
    outputPath,
    outputUrl: new URL(relativeAssetPath(outputPath), `http://127.0.0.1:${currentPort}/assets/`).toString(),
  };
}

async function generateWeissProxyDeck(cards, deckName) {
  const uniqueCards = [];
  const seen = new Set();
  for (const card of Array.isArray(cards) ? cards : []) {
    const key = String(card?.number || card?.name || "").trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueCards.push(card);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const debugDir = resolve("outputs", "debug", "proxy-deck", `${safeFileName(deckName)}-${timestamp}`);
  const generated = [];
  const skipped = [];

  for (const card of uniqueCards) {
    if (!isProxyCandidate(card)) {
      skipped.push({
        number: card?.number || "",
        name: card?.name || "",
        reason: proxySkipReason(card),
      });
      continue;
    }

    try {
      generated.push(await generateWeissProxyCard(card, { outputDir: debugDir, boxOpacity: 1, blurBox: false }));
    } catch (error) {
      skipped.push({
        number: card?.number || "",
        name: card?.name || "",
        reason: error.message || String(error),
      });
    }
  }

  return {
    outputDir: debugDir,
    generated,
    skipped,
    generatedCount: generated.length,
    skippedCount: skipped.length,
  };
}

function isProxyCandidate(card) {
  return isWeissGame(card?.game)
    && String(card.translationUrl || "").trim()
    && String(card.text || "").trim()
    && /^https:\/\/ws-tcg\.com\//i.test(String(card.imageUrl || ""))
    && !/-E\d/i.test(String(card.number || ""));
}

function proxySkipReason(card) {
  if (!isWeissGame(card?.game)) return "Not a Weiss Schwarz card.";
  if (!String(card?.translationUrl || "").trim() || !String(card?.text || "").trim()) return "Card has no translated text.";
  if (!/^https:\/\/ws-tcg\.com\//i.test(String(card?.imageUrl || ""))) return "Card does not have an official JP image URL.";
  if (/-E\d/i.test(String(card?.number || ""))) return "Card appears to be an English print.";
  return "Not eligible for proxy generation.";
}

function renderUnionArenaCardImage(card) {
  if (!isUnionArenaJpCard(card)) {
    throw new Error("Rendered ExBurst images are only available for Union Arena (JP) cards.");
  }

  const number = String(card.number || "").trim();
  const url = String(card.renderedImagePageUrl || card.detailUrl || "").trim();
  if (!number || !url) throw new Error("Union Arena JP card needs a number and ExBurst card page URL.");

  const outputDir = resolve("outputs", "ua-rendered");
  const outputPath = resolve(outputDir, `${safeFileName(number)}.png`);

  if (!existsSync(outputPath)) {
    const result = spawnSync(process.execPath, [
      "scripts/render-exburst-union-arena-card.mjs",
      "--url",
      url,
      "--output",
      outputPath,
    ], {
      cwd: resolve("."),
      encoding: "utf8",
      windowsHide: true,
      timeout: 60000,
    });

    if (result.status !== 0) {
      throw new Error(`Union Arena render failed: ${result.stderr || result.stdout || result.status}`);
    }
  }

  return {
    number,
    name: card.name || "",
    outputPath,
    outputUrl: new URL(relativeAssetPath(outputPath), `http://127.0.0.1:${currentPort}/assets/`).toString(),
  };
}

function renderUnionArenaCardImages(cards) {
  const requested = Array.isArray(cards) ? cards : [];
  const outputDir = resolve("outputs", "ua-rendered");
  mkdirSync(outputDir, { recursive: true });

  const rendered = [];
  const jobs = [];
  const seen = new Set();
  for (const card of requested) {
    if (!isUnionArenaJpCard(card)) continue;
    const number = String(card.number || "").trim();
    const url = String(card.renderedImagePageUrl || card.detailUrl || "").trim();
    if (!number || !url) continue;
    const key = number.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const outputPath = resolve(outputDir, `${safeFileName(number)}.png`);
    if (existsSync(outputPath)) {
      rendered.push({
        number,
        name: card.name || "",
        outputPath,
        outputUrl: new URL(relativeAssetPath(outputPath), `http://127.0.0.1:${currentPort}/assets/`).toString(),
        cached: true,
      });
      continue;
    }

    jobs.push({
      number,
      name: card.name || "",
      url,
      output: outputPath,
    });
  }

  if (jobs.length) {
    const batchPath = resolve(outputDir, `.render-batch-${process.pid}-${Date.now()}.json`);
    writeFileSync(batchPath, JSON.stringify(jobs, null, 2));
    try {
      const result = spawnSync(process.execPath, [
        "scripts/render-exburst-union-arena-card.mjs",
        "--batch",
        batchPath,
      ], {
        cwd: resolve("."),
        encoding: "utf8",
        windowsHide: true,
        timeout: Math.max(60000, jobs.length * 20000),
      });

      if (result.status !== 0) {
        throw new Error(`Union Arena batch render failed: ${result.stderr || result.stdout || result.status}`);
      }

      const payload = parseLastJsonLine(result.stdout);
      for (const item of payload.rendered || []) {
        const outputPath = resolve(String(item.outputPath || ""));
        rendered.push({
          number: item.number || "",
          name: item.name || "",
          outputPath,
          outputUrl: new URL(relativeAssetPath(outputPath), `http://127.0.0.1:${currentPort}/assets/`).toString(),
          cached: false,
        });
      }
    } finally {
      rmSync(batchPath, { force: true });
    }
  }

  return {
    rendered,
    requested: requested.length,
    generated: jobs.length,
    cached: rendered.filter((item) => item.cached).length,
  };
}

function parseLastJsonLine(value) {
  const lines = String(value || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning for the script's final JSON payload.
    }
  }
  return {};
}

function isUnionArenaJpCard(card) {
  return canonicalGame(card?.game) === "Union Arena (JP)" || String(card?.locale || "").toLowerCase() === "jp" && /exburst\.dev\/ua\/cards\//i.test(String(card?.renderedImagePageUrl || card?.detailUrl || ""));
}

async function downloadFile(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function relativeAssetPath(path) {
  return relative(resolve("."), path).split(sep).map(encodeURIComponent).join("/");
}

function safeFileName(value) {
  return String(value || "card").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim() || "card";
}

function proxyImageText(text) {
  return String(text || "")
    .replaceAll("\u3010", "[")
    .replaceAll("\u3011", "]")
    .replaceAll("\u2460", "(1)")
    .replaceAll("\u2461", "(2)")
    .replaceAll("\u2462", "(3)")
    .replace(/\?((?:AUTO|CONT|ACT|CXCOMBO))\?/gi, (_, label) => `[${label}]`)
    .replace(/\?([A-Za-z][A-Za-z0-9 /-]{1,40})\?/g, "\u300A$1\u300B");
}

function countFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) return 1;
  if (!stats.isDirectory()) return 0;

  let count = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    count += countFiles(resolve(path, entry.name));
  }
  return count;
}

function isInside(child, parent) {
  return child !== parent && child.startsWith(parent + sep);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function portArg() {
  const index = process.argv.indexOf("--port");
  return index >= 0 ? process.argv[index + 1] : "";
}

function numberParam(url, key) {
  const value = String(url.searchParams.get(key) || "").trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerParam(url, key, fallback) {
  const raw = url.searchParams.get(key);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function pageCards(cards, url, defaultLimit = 120) {
  const total = cards.length;
  const offset = integerParam(url, "offset", 0);
  const requestedLimit = integerParam(url, "limit", defaultLimit);
  const limit = Math.min(Math.max(requestedLimit, 1), 500);
  const page = cards.slice(offset, offset + limit);
  return {
    cards: page,
    total,
    offset,
    limit,
    hasMore: offset + page.length < total,
  };
}

function matchesWeissFilters(card, filters) {
  if (filters.type && String(card.cardType || "").toLowerCase() !== filters.type) return false;
  if (filters.color && String(card.color || "").toLowerCase() !== filters.color) return false;
  if (filters.trigger && !String(card.trigger || "").toLowerCase().includes(filters.trigger)) return false;
  if (filters.hideAlt && isAltWeissCard(card.number)) return false;
  if (!inRange(card.level, filters.levelMin, filters.levelMax)) return false;
  if (!inRange(card.cost, filters.costMin, filters.costMax)) return false;
  if (!inRange(card.power, filters.powerMin, filters.powerMax)) return false;
  if (!inRange(card.soul, filters.soulMin, filters.soulMax, soulValue)) return false;
  return true;
}

function collectionCards(url, fallbackGame = "") {
  const game = canonicalGame(url.searchParams.get("game") || fallbackGame || "Weiss Schwarz (EN)");
  if (game === "Hololive OCG") return collectionHololiveCards(url);
  if (game === "Riftbound") return collectionRiftboundCards(url);
  if (game === "Union Arena (EN)") return collectionUnionArenaCards(url, "en");
  if (game === "Union Arena (JP)") return collectionUnionArenaCards(url, "jp");
  if (game === "Weiss Schwarz (JP)") return collectionWeissCards(url, "jp");
  return collectionWeissCards(url, "en");
}

function collectionWeissCards(url, locale = "en") {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const title = String(url.searchParams.get("title") || "").trim();
  const view = String(url.searchParams.get("view") || "all").trim().toLowerCase();
  const sort = String(url.searchParams.get("sort") || "series").trim().toLowerCase();
  const titleCodes = weissTitleCodes(title);
  const owned = loadCollection().cards;
  const filters = collectionFilters(url);

  const cards = loadWeissDatabase(locale).cards
    .filter((card) => !titleCodes.length || titleCodes.includes(titleCode(card.number)))
    .filter((card) => matchesWeissFilters(card, filters))
    .map((card) => ({ ...card, ownedQty: Number(owned[card.number] || 0), series: titleCode(card.number) }))
    .filter((card) => view !== "owned" || card.ownedQty > 0)
    .filter((card) => view !== "unowned" || card.ownedQty <= 0)
    .filter((card) => {
      if (!q) return true;
      return [card.number, card.name, card.cardType, card.color, card.level, card.rarity, card.text]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  sortCollectionCards(cards, sort);
  return pageCards(cards, url);
}

function collectionHololiveCards(url) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const cardSet = String(url.searchParams.get("cardSet") || url.searchParams.get("title") || "").trim();
  const view = String(url.searchParams.get("view") || "all").trim().toLowerCase();
  const sort = String(url.searchParams.get("sort") || "series").trim().toLowerCase();
  const owned = loadCollection().cards;
  const filters = collectionFilters(url);

  const cards = loadHololiveDatabase()
    .filter((card) => !cardSet || hololiveCardSets(card).includes(cardSet))
    .filter((card) => matchesHololiveFilters(card, filters))
    .map((card) => ({ ...card, ownedQty: Number(owned[card.number] || 0), series: hololiveCardSets(card)[0] || card.cardSet || "" }))
    .filter((card) => view !== "owned" || card.ownedQty > 0)
    .filter((card) => view !== "unowned" || card.ownedQty <= 0)
    .filter((card) => {
      if (!q) return true;
      return [
        card.number,
        card.name,
        card.cardType,
        card.color,
        card.rarity,
        card.cardSet,
        card.abilityText,
        card.life,
        ...(card.oshiSkills || []).flatMap((skill) => [skill.label, skill.name, skill.text]),
        card.extraText,
        card.tags,
      ].join(" ").toLowerCase().includes(q);
    });
  sortCollectionCards(cards, sort);
  return pageCards(cards, url);
}

function canonicalGame(value) {
  const game = String(value || "").trim();
  if (game === "Weiss Schwarz" || game === "Weiss Schwarz (EN)") return "Weiss Schwarz (EN)";
  if (game === "Weiss Schwarz JP" || game === "Weiss Schwarz (JP)") return "Weiss Schwarz (JP)";
  if (game === "Union Arena" || game === "Union Arena (EN)") return "Union Arena (EN)";
  if (game === "Union Arena JP" || game === "Union Arena (JP)") return "Union Arena (JP)";
  return game || "Weiss Schwarz (EN)";
}

function isWeissGame(value) {
  const game = canonicalGame(value);
  return game === "Weiss Schwarz (EN)" || game === "Weiss Schwarz (JP)";
}

function collectionRiftboundCards(url) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const cardSet = String(url.searchParams.get("cardSet") || url.searchParams.get("title") || "").trim();
  const view = String(url.searchParams.get("view") || "all").trim().toLowerCase();
  const sort = String(url.searchParams.get("sort") || "series").trim().toLowerCase();
  const owned = loadCollection().cards;
  const filters = collectionFilters(url);

  const cards = loadRiftboundDatabase()
    .filter((card) => !cardSet || riftboundCardSets(card).includes(cardSet))
    .filter((card) => matchesRiftboundFilters(card, filters))
    .map((card) => ({ ...card, ownedQty: Number(owned[card.number] || 0), series: card.setCode || card.cardSet || "" }))
    .filter((card) => view !== "owned" || card.ownedQty > 0)
    .filter((card) => view !== "unowned" || card.ownedQty <= 0)
    .filter((card) => {
      if (!q) return true;
      return [
        card.number,
        card.name,
        card.cardType,
        card.supertype,
        card.color,
        card.rarity,
        card.cardSet,
        card.setCode,
        card.variantType,
        card.artist,
        card.energy,
        card.might,
        card.power,
        card.text,
        card.tags,
      ].join(" ").toLowerCase().includes(q);
    });
  sortCollectionCards(cards, sort);
  return pageCards(cards, url);
}

function collectionUnionArenaCards(url, locale = "en") {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const cardSet = String(url.searchParams.get("cardSet") || url.searchParams.get("title") || "").trim();
  const view = String(url.searchParams.get("view") || "all").trim().toLowerCase();
  const sort = String(url.searchParams.get("sort") || "series").trim().toLowerCase();
  const owned = loadCollection().cards;
  const filters = collectionFilters(url);

  const cards = loadUnionArenaDatabase(locale)
    .filter((card) => !cardSet || unionArenaCardSets(card).includes(cardSet))
    .filter((card) => matchesUnionArenaFilters(card, filters))
    .map((card) => ({ ...card, ownedQty: Number(owned[card.number] || 0), series: card.series || card.seriesName || card.cardSet || "" }))
    .filter((card) => view !== "owned" || card.ownedQty > 0)
    .filter((card) => view !== "unowned" || card.ownedQty <= 0)
    .filter((card) => {
      if (!q) return true;
      return [
        card.number,
        card.name,
        card.cardType,
        card.color,
        card.rarity,
        card.cardSet,
        card.series,
        card.seriesName,
        card.abbreviation,
        card.power,
        card.ap,
        card.cost,
        card.generatedEnergy,
        card.trigger,
        card.text,
        card.features,
      ].join(" ").toLowerCase().includes(q);
    });
  sortCollectionCards(cards, sort);
  return pageCards(cards, url);
}

function sortCollectionCards(cards, sort) {
  const bySeries = (a, b) => String(a.series || "").localeCompare(String(b.series || ""))
    || String(a.number || "").localeCompare(String(b.number || ""))
    || String(a.rarity || "").localeCompare(String(b.rarity || ""));
  const byNumber = (a, b) => String(a.number || "").localeCompare(String(b.number || ""))
    || String(a.name || "").localeCompare(String(b.name || ""));
  const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""))
    || String(a.number || "").localeCompare(String(b.number || ""));
  const byOwnedDesc = (a, b) => Number(b.ownedQty || 0) - Number(a.ownedQty || 0)
    || bySeries(a, b);

  if (sort === "number") cards.sort(byNumber);
  else if (sort === "name") cards.sort(byName);
  else if (sort === "owned-desc") cards.sort(byOwnedDesc);
  else cards.sort(bySeries);
}

function collectionFilters(url) {
  return {
    type: String(url.searchParams.get("type") || "").trim().toLowerCase(),
    color: String(url.searchParams.get("color") || "").trim().toLowerCase(),
    trigger: String(url.searchParams.get("trigger") || "").trim().toLowerCase(),
    levelMin: numberParam(url, "levelMin"),
    levelMax: numberParam(url, "levelMax"),
    costMin: numberParam(url, "costMin"),
    costMax: numberParam(url, "costMax"),
    powerMin: numberParam(url, "powerMin"),
    powerMax: numberParam(url, "powerMax"),
    soulMin: numberParam(url, "soulMin"),
    soulMax: numberParam(url, "soulMax"),
    hideAlt: url.searchParams.get("hideAlt") === "1",
  };
}

function matchesHololiveFilters(card, filters) {
  if (filters.type && !String(card.cardType || "").toLowerCase().includes(filters.type)) return false;
  if (filters.color && String(card.color || "").toLowerCase() !== filters.color) return false;
  if (!inRange(card.bloomLevel, filters.levelMin, filters.levelMax, hololiveBloomValue)) return false;
  return true;
}

function matchesRiftboundFilters(card, filters) {
  if (filters.type && !String(card.cardType || "").toLowerCase().includes(filters.type)) return false;
  if (filters.color && !String(card.color || "").toLowerCase().split(/\s*\/\s*/).includes(filters.color)) return false;
  if (!inRange(card.energy, filters.levelMin, filters.levelMax)) return false;
  if (!inRange(card.energy, filters.costMin, filters.costMax)) return false;
  if (!inRange(card.power, filters.powerMin, filters.powerMax)) return false;
  return true;
}

function matchesUnionArenaFilters(card, filters) {
  if (filters.type && !String(card.cardType || "").toLowerCase().includes(filters.type)) return false;
  if (filters.color && String(card.color || "").toLowerCase() !== filters.color) return false;
  if (filters.trigger && !String(card.trigger || "").toLowerCase().includes(filters.trigger)) return false;
  if (filters.hideAlt && card.isAlternate) return false;
  if (!inRange(card.energyCost || card.cost, filters.levelMin, filters.levelMax)) return false;
  if (!inRange(card.energyCost || card.cost, filters.costMin, filters.costMax)) return false;
  if (!inRange(card.power || card.bp, filters.powerMin, filters.powerMax)) return false;
  return true;
}

function loadHololiveDatabase() {
  try {
    const cards = JSON.parse(readFileSync("data/cards/hololive-cards.json", "utf8"));
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
}

function listHololiveCardSets() {
  const counts = new Map();
  for (const card of loadHololiveDatabase()) {
    for (const set of hololiveCardSets(card)) counts.set(set, (counts.get(set) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, cards]) => ({ id: name, name, cards }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listRiftboundCardSets() {
  const sets = new Map();
  for (const card of loadRiftboundDatabase()) {
    const id = card.setCode || card.set || card.cardSet;
    if (!id) continue;
    const current = sets.get(id) || { id, code: card.setCode || id, name: card.set || card.cardSet || id, cards: 0 };
    current.cards += 1;
    sets.set(id, current);
  }
  return [...sets.values()].sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name)));
}

function listUnionArenaCardSets(locale = "en") {
  const sets = new Map();
  for (const card of loadUnionArenaDatabase(locale)) {
    const id = card.series || card.seriesName || card.cardSet || card.abbreviation;
    if (!id) continue;
    const current = sets.get(id) || {
      id,
      code: card.series || card.abbreviation || id,
      name: card.seriesName || card.cardSet || id,
      cards: 0,
    };
    current.cards += 1;
    sets.set(id, current);
  }
  return [...sets.values()].sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name)));
}

function unionArenaCardSets(card) {
  return [card.series, card.seriesName, card.cardSet].map((set) => String(set || "").trim()).filter(Boolean);
}

function riftboundCardSets(card) {
  return [card.setCode, card.set, card.cardSet].map((set) => String(set || "").trim()).filter(Boolean);
}

function hololiveCardSets(card) {
  return String(card.cardSet || "")
    .split(/\r?\n/)
    .map((set) => set.trim())
    .filter(Boolean);
}

function deckMissing(deck) {
  const owned = loadCollection().cards;
  const missing = (deck.cards || [])
    .map((card) => {
      const required = Number(card.qty || 0);
      const ownedQty = Number(owned[card.number] || 0);
      return { ...card, required, ownedQty, missingQty: Math.max(0, required - ownedQty) };
    })
    .filter((card) => card.missingQty > 0)
    .sort((a, b) => a.number.localeCompare(b.number));

  return {
    missing,
    missingCards: missing.reduce((sum, card) => sum + card.missingQty, 0),
    missingUnique: missing.length,
  };
}

function inRange(value, min, max, normalize = numericValue) {
  if (min === null && max === null) return true;
  const number = normalize(value);
  if (!Number.isFinite(number)) return false;
  if (min !== null && number < min) return false;
  if (max !== null && number > max) return false;
  return true;
}

function numericValue(value) {
  return Number(String(value || "").replace(/[^\d.-]/g, ""));
}

function soulValue(value) {
  const text = String(value || "");
  const icons = text.match(/soul/gi);
  if (icons) return icons.length;
  if (text.trim() === "-" || !text.trim()) return 0;
  return numericValue(text);
}

function hololiveBloomValue(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return NaN;
  if (text.includes("debut")) return 0;
  if (text.includes("1st")) return 1;
  if (text.includes("2nd")) return 2;
  if (text.includes("spot")) return 3;
  return numericValue(text);
}

function isAltWeissCard(number) {
  return /(SSP|OFR|SP|S|R)$/i.test(String(number || "").trim());
}

function titleCode(number) {
  return String(number || "").split("/")[0].toUpperCase();
}

function listWeissSeries(locale = "en") {
  const codeCounts = new Map();

  for (const card of loadWeissDatabase(locale).cards) {
    const code = titleCode(card.number);
    if (!code) continue;
    const current = codeCounts.get(code) || { cards: 0, characterCards: 0, climaxCards: 0 };
    current.cards += 1;
    if (String(card.cardType || "").toLowerCase() === "climax") current.climaxCards += 1;
    if (String(card.cardType || "").toLowerCase() === "character") current.characterCards += 1;
    codeCounts.set(code, current);
  }

  const official = loadWeissSeriesMap()
    .map((series) => {
      const counts = series.codes.reduce((totals, code) => {
        const count = codeCounts.get(code) || {};
        totals.cards += count.cards || 0;
        totals.characterCards += count.characterCards || 0;
        totals.climaxCards += count.climaxCards || 0;
        return totals;
      }, { cards: 0, characterCards: 0, climaxCards: 0 });

      return { ...series, ...counts };
    })
    .filter((series) => series.cards > 0);

  const mappedCodes = new Set(official.flatMap((series) => series.codes));
  const orphanCodes = [...codeCounts.entries()]
    .filter(([code]) => !mappedCodes.has(code))
    .map(([code, counts]) => ({ id: code, code, name: code, side: "", codes: [code], ...counts }));

  return [...official, ...orphanCodes]
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
}

function weissTitleCodes(title) {
  if (!title) return [];
  const normalized = String(title).trim();
  const series = loadWeissSeriesMap().find((item) => item.id === normalized || item.codes.includes(normalized.toUpperCase()));
  return series?.codes || [normalized.toUpperCase()];
}

function loadWeissSeriesMap() {
  if (weissSeriesCache) return weissSeriesCache;

  try {
    const series = JSON.parse(readFileSync("data/cards/weiss-series.json", "utf8"));
    weissSeriesCache = Array.isArray(series)
      ? series.map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || item.id || ""),
        side: String(item.side || ""),
        codes: Array.isArray(item.codes) ? item.codes.map((code) => String(code).toUpperCase()) : [],
      })).filter((item) => item.id && item.name && item.codes.length)
      : [];
  } catch {
    weissSeriesCache = [];
  }

  return weissSeriesCache;
}

function startWeissCardDatabaseBuild(locale = "en") {
  if (weissBuildJob?.status === "running") return weissBuildJob;
  const isJp = String(locale || "").toLowerCase() === "jp";
  const outputPath = isJp ? "data/cards/weiss-jp-cards.json" : "data/cards/weiss-cards.json";

  weissBuildJob = {
    id: new Date().toISOString(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    weissCards: 0,
    locale: isJp ? "jp" : "en",
    log: `Starting ${isJp ? "Japanese " : ""}Weiss card database build...`,
    error: "",
  };

  const args = [
    "scripts/scrape-weiss-cards.mjs",
    "--output",
    outputPath,
    "--fresh",
    "--delayMs",
    "50",
    "--flushEvery",
    "25",
    "--concurrency",
    "8",
  ];
  if (isJp) args.push("--locale", "jp");

  const child = spawn(process.execPath, args, {
    cwd: resolve("."),
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => appendBuildLog(chunk.toString()));
  child.stderr.on("data", (chunk) => appendBuildLog(chunk.toString()));
  child.on("error", (error) => {
    weissBuildJob.status = "failed";
    weissBuildJob.error = error.message || String(error);
    weissBuildJob.finishedAt = new Date().toISOString();
    appendBuildLog(weissBuildJob.error);
  });
  child.on("close", (code) => {
    weissBuildJob.finishedAt = new Date().toISOString();
    if (code !== 0) {
      weissBuildJob.status = "failed";
      weissBuildJob.error = `Weiss scraper exited with code ${code}.`;
      appendBuildLog(weissBuildJob.error);
      return;
    }

    clearWeissDatabaseCache(isJp ? "jp" : "en");
    const db = loadWeissDatabase(isJp ? "jp" : "en");
    weissBuildJob.status = "complete";
    weissBuildJob.weissCards = db.cards.length;
    appendBuildLog(`Build complete: ${db.cards.length} cards.`);
  });

  return weissBuildJob;
}

function appendBuildLog(text) {
  if (!weissBuildJob) return;
  const lines = `${weissBuildJob.log}\n${text}`.trim().split(/\r?\n/);
  weissBuildJob.log = lines.slice(-40).join("\n");
}

function startHololiveCardDatabaseBuild() {
  if (hololiveBuildJob?.status === "running") return hololiveBuildJob;

  hololiveBuildJob = {
    id: new Date().toISOString(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    hololiveCards: 0,
    log: "Starting Hololive card database build...",
    error: "",
  };

  const child = spawn(process.execPath, [
    "scripts/scrape-hololive-cards.mjs",
    "--output",
    "data/cards/hololive-cards.json",
    "--fresh",
    "--delayMs",
    "50",
    "--flushEvery",
    "25",
    "--concurrency",
    "8",
  ], {
    cwd: resolve("."),
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => appendHololiveBuildLog(chunk.toString()));
  child.stderr.on("data", (chunk) => appendHololiveBuildLog(chunk.toString()));
  child.on("error", (error) => {
    hololiveBuildJob.status = "failed";
    hololiveBuildJob.error = error.message || String(error);
    hololiveBuildJob.finishedAt = new Date().toISOString();
    appendHololiveBuildLog(hololiveBuildJob.error);
  });
  child.on("close", (code) => {
    hololiveBuildJob.finishedAt = new Date().toISOString();
    if (code !== 0) {
      hololiveBuildJob.status = "failed";
      hololiveBuildJob.error = `Hololive scraper exited with code ${code}.`;
      appendHololiveBuildLog(hololiveBuildJob.error);
      return;
    }

    hololiveBuildJob.status = "complete";
    hololiveBuildJob.hololiveCards = countJsonCards("data/cards/hololive-cards.json");
    appendHololiveBuildLog(`Build complete: ${hololiveBuildJob.hololiveCards} cards.`);
  });

  return hololiveBuildJob;
}

function appendHololiveBuildLog(text) {
  if (!hololiveBuildJob) return;
  const lines = `${hololiveBuildJob.log}\n${text}`.trim().split(/\r?\n/);
  hololiveBuildJob.log = lines.slice(-40).join("\n");
}

function startRiftboundCardDatabaseBuild() {
  if (riftboundBuildJob?.status === "running") return riftboundBuildJob;

  riftboundBuildJob = {
    id: new Date().toISOString(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    riftboundCards: 0,
    log: "Starting Riftbound card database build...",
    error: "",
  };

  const child = spawn(process.execPath, [
    "scripts/scrape-riftbound-piltover-cards.mjs",
    "--output",
    "data/cards/riftbound-cards.json",
  ], {
    cwd: resolve("."),
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => appendRiftboundBuildLog(chunk.toString()));
  child.stderr.on("data", (chunk) => appendRiftboundBuildLog(chunk.toString()));
  child.on("error", (error) => {
    riftboundBuildJob.status = "failed";
    riftboundBuildJob.error = error.message || String(error);
    riftboundBuildJob.finishedAt = new Date().toISOString();
    appendRiftboundBuildLog(riftboundBuildJob.error);
  });
  child.on("close", (code) => {
    riftboundBuildJob.finishedAt = new Date().toISOString();
    if (code !== 0) {
      riftboundBuildJob.status = "failed";
      riftboundBuildJob.error = `Riftbound scraper exited with code ${code}.`;
      appendRiftboundBuildLog(riftboundBuildJob.error);
      return;
    }

    clearRiftboundDatabaseCache();
    riftboundBuildJob.status = "complete";
    riftboundBuildJob.riftboundCards = countRiftboundCards();
    appendRiftboundBuildLog(`Build complete: ${riftboundBuildJob.riftboundCards} cards.`);
  });

  return riftboundBuildJob;
}

function appendRiftboundBuildLog(text) {
  if (!riftboundBuildJob) return;
  const lines = `${riftboundBuildJob.log}\n${text}`.trim().split(/\r?\n/);
  riftboundBuildJob.log = lines.slice(-40).join("\n");
}

function startUnionArenaCardDatabaseBuild(locale = "en") {
  const normalizedLocale = normalizeUnionArenaLocale(locale);
  if (unionArenaBuildJob?.status === "running") return unionArenaBuildJob;

  unionArenaBuildJob = {
    id: new Date().toISOString(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    locale: normalizedLocale,
    unionArenaCards: 0,
    log: `Starting Union Arena ${normalizedLocale === "jp" ? "JP" : "EN"} card database build...`,
    error: "",
  };

  const child = spawn(process.execPath, [
    "scripts/scrape-exburst-union-arena-cards.mjs",
    "--locale",
    normalizedLocale,
    "--output",
    normalizedLocale === "jp" ? "data/cards/union-arena-jp-cards.json" : "data/cards/union-arena-cards.json",
  ], {
    cwd: resolve("."),
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => appendUnionArenaBuildLog(chunk.toString()));
  child.stderr.on("data", (chunk) => appendUnionArenaBuildLog(chunk.toString()));
  child.on("error", (error) => {
    unionArenaBuildJob.status = "failed";
    unionArenaBuildJob.error = error.message || String(error);
    unionArenaBuildJob.finishedAt = new Date().toISOString();
    appendUnionArenaBuildLog(unionArenaBuildJob.error);
  });
  child.on("close", (code) => {
    unionArenaBuildJob.finishedAt = new Date().toISOString();
    if (code !== 0) {
      unionArenaBuildJob.status = "failed";
      unionArenaBuildJob.error = `Union Arena scraper exited with code ${code}.`;
      appendUnionArenaBuildLog(unionArenaBuildJob.error);
      return;
    }

    clearUnionArenaDatabaseCache(normalizedLocale);
    unionArenaBuildJob.status = "complete";
    unionArenaBuildJob.unionArenaCards = countUnionArenaCards(normalizedLocale);
    appendUnionArenaBuildLog(`Build complete: ${unionArenaBuildJob.unionArenaCards} cards.`);
  });

  return unionArenaBuildJob;
}

function appendUnionArenaBuildLog(text) {
  if (!unionArenaBuildJob) return;
  const lines = `${unionArenaBuildJob.log}\n${text}`.trim().split(/\r?\n/);
  unionArenaBuildJob.log = lines.slice(-40).join("\n");
}

function countJsonCards(path) {
  try {
    if (!existsSync(path)) return 0;
    const cards = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(cards) ? cards.length : 0;
  } catch {
    return 0;
  }
}

function countRiftboundCards() {
  try {
    if (!existsSync("data/cards/riftbound-cards.json")) return 0;
    const payload = JSON.parse(readFileSync("data/cards/riftbound-cards.json", "utf8"));
    if (Array.isArray(payload)) return payload.length;
    if (Array.isArray(payload.cards)) return payload.cards.length;
    return Number(payload.counts?.cards || 0);
  } catch {
    return 0;
  }
}

function countUnionArenaCards(locale = "en") {
  try {
    const path = normalizeUnionArenaLocale(locale) === "jp" ? "data/cards/union-arena-jp-cards.json" : "data/cards/union-arena-cards.json";
    if (!existsSync(path)) return 0;
    const payload = JSON.parse(readFileSync(path, "utf8"));
    if (Array.isArray(payload)) return payload.length;
    if (Array.isArray(payload.cards)) return payload.cards.length;
    return Number(payload.counts?.cards || 0);
  } catch {
    return 0;
  }
}

function unionArenaLocaleFromUrl(url) {
  return canonicalGame(url.searchParams.get("game") || "") === "Union Arena (JP)" || String(url.searchParams.get("locale") || "").toLowerCase() === "jp" ? "jp" : "en";
}

function normalizeUnionArenaLocale(value) {
  const locale = String(value || "").trim().toLowerCase();
  return locale === "jp" || locale === "ja" ? "jp" : "en";
}

async function translateWeissCards(cards) {
  const uniqueNumbers = [...new Set(cards.map((card) => String(card?.number || "").trim()).filter(Boolean))];
  const translations = [];

  for (const number of uniqueNumbers) {
    const cached = getCachedTranslation(number);
    if (cached?.ok && !shouldRefreshCachedTranslation(cached, number)) {
      translations.push(addClimaxTriggerReminder({ ...cached, number, cacheHit: true }, number));
      continue;
    }

    const encoreTranslation = await translateWeissCardFromEncore(number);
    if (encoreTranslation.ok) {
      const enriched = addClimaxTriggerReminder(encoreTranslation, number);
      setCachedTranslation(number, enriched);
      translations.push(enriched);
      continue;
    }

    const translation = await translateWeissCard(number);
    const enriched = translation.ok ? addClimaxTriggerReminder(translation, number) : translation;
    if (enriched.ok) setCachedTranslation(number, enriched);
    translations.push(enriched);
    if (translation.throttled) break;
    await sleep(5000);
  }

  return translations;
}

function shouldRefreshCachedTranslation(translation, number = "") {
  const officialCard = findWeissCardByNumber(number || translation?.number, "jp") || findWeissCardByNumber(number || translation?.number, "en");
  const cardType = String(translation?.cardType || officialCard?.cardType || "").toLowerCase();

  if (translation?.source === "EncoreDecks") {
    return cardType.includes("character") && !String(translation?.traits || "").trim();
  }
  if (translation?.source === "Heart of the Cards" || /heartofthecards\.com/i.test(String(translation?.url || ""))) {
    const attributes = Array.isArray(translation?.attributes) ? translation.attributes : String(translation?.traits || "").split(/\s*\/\s*/).filter(Boolean);
    return (cardType.includes("character") && !String(translation?.traits || "").trim())
      || (cardType.includes("character") && attributes.length < 2)
      || /\bnone\b/i.test(String(translation?.traits || ""))
      || /《|》/.test(String(translation?.traits || ""))
      || hasJapaneseCharacters(String(translation?.traits || ""));
  }
  return false;
}

function addClimaxTriggerReminder(translation, number) {
  if (!translation?.ok) return translation;

  const officialCard = findWeissCardByNumber(number, "jp") || findWeissCardByNumber(number, "en");
  const cardType = String(translation.cardType || officialCard?.cardType || "").toLowerCase();
  if (!cardType.includes("climax")) return translation;

  const trigger = String(translation.trigger || officialCard?.trigger || "");
  const reminder = climaxTriggerReminder(trigger);
  if (!reminder) return translation;

  const text = String(translation.text || "").trim();
  if (text.toLowerCase().includes("when this card triggers")) return { ...translation, text };
  return {
    ...translation,
    trigger: translation.trigger || officialCard?.trigger || "",
    text: [text, reminder].filter(Boolean).join("\n"),
  };
}

function findWeissCardByNumber(number, locale) {
  const normalized = String(number || "").trim().toUpperCase();
  if (!normalized) return null;
  try {
    return loadWeissDatabase(locale).cards.find((card) => String(card.number || "").trim().toUpperCase() === normalized) || null;
  } catch {
    return null;
  }
}

function climaxTriggerReminder(trigger) {
  const key = climaxTriggerKey(trigger);
  const reminders = {
    treasure: "(【treasure】: When this card triggers, return this card to your hand. You may put the top card of your deck into your stock.)",
    choice: "(【choice】: When this card triggers, you may choose a character with 【soul】 in its trigger icon in your waiting room, and return it to your hand or put it into your stock)",
    standby: "(【standby】: When this card triggers, you may choose 1 character in your waiting room with a level equal to or lower than your level +1, and put it on any position of your stage as 【REST】)",
    comeback: "(【comeback】: When this card triggers, you may choose 1 character in your waiting room, and return it to your hand)",
    draw: "(【draw】: When this card triggers, you may draw 1 card)",
    gate: "(【gate】: When this card triggers, you may choose 1 climax in your waiting room, and return it to your hand)",
    return: "(【return】: When this card triggers, you may choose one of your opponent's characters, and return it to your opponent's hand.)",
  };
  return reminders[key] || "";
}

function climaxTriggerKey(trigger) {
  const text = String(trigger || "")
    .toLowerCase()
    .replace(/[【】\[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.includes("treasure")) return "treasure";
  if (text.includes("choice")) return "choice";
  if (text.includes("standby")) return "standby";
  if (text.includes("salvage") || text.includes("comeback")) return "comeback";
  if (text.includes("draw")) return "draw";
  if (text.includes("gate")) return "gate";
  if (text.includes("bounce") || text.includes("return")) return "return";
  return "";
}

async function translateWeissCardFromEncore(number) {
  const lookup = parseEncoreWeissNumber(number);
  if (!lookup) return { ok: false, number, error: "Could not parse Weiss card number for EncoreDecks." };

  try {
    const series = await findEncoreSeries(lookup);
    if (!series) return { ok: false, number, error: "No matching EncoreDecks series." };

    const cards = await fetchEncoreSeriesCards(series._id);
    const card = cards.find((item) => normalizeEncoreCardCode(item.cardcode) === lookup.cardcode);
    if (!card) return { ok: false, number, error: "Card was not found in EncoreDecks series." };

    const english = card.locale?.EN || {};
    const name = cleanEncoreString(english.name);
    const attributes = encoreAttributes(card, english);
    const traits = attributes.join(" / ");
    const ability = Array.isArray(english.ability) ? english.ability.map(cleanEncoreString).filter(Boolean).join("\n") : "";
    if (!name && !traits && !ability) return { ok: false, number, error: "EncoreDecks has no English translation for this card." };
    if (hasJapaneseCharacters([name, ability].join(" "))) {
      return { ok: false, number, error: "EncoreDecks translation is incomplete." };
    }

    return {
      ok: true,
      source: "EncoreDecks",
      number,
      url: `https://www.encoredecks.com/api/series/${encodeURIComponent(series._id)}/cards`,
      name,
      traits,
      attributes,
      text: ability,
      cardType: encoreCardType(card.cardtype),
      color: encoreColor(card.colour),
      level: encoreStat(card.level),
      cost: encoreStat(card.cost),
      power: encoreStat(card.power),
      soul: encoreSoulText(card.soul),
      trigger: encoreTriggerText(card.trigger),
      rarity: cleanEncoreString(card.rarity),
    };
  } catch (error) {
    return { ok: false, number, error: `EncoreDecks lookup failed: ${error.message || error}` };
  }
}

function parseEncoreWeissNumber(number) {
  const cardcode = normalizeEncoreCardCode(number);
  const match = cardcode.match(/^([^/]+)\/([A-Z])([A-Z0-9]+)-(.+)$/i);
  if (!match) return null;
  return {
    cardcode,
    set: match[1].toUpperCase(),
    side: match[2].toUpperCase(),
    release: match[3].toUpperCase(),
  };
}

function normalizeEncoreCardCode(number) {
  return String(number || "")
    .trim()
    .replace(/^WS_/i, "")
    .replace(/\/([A-Z][A-Z0-9]*)-E(\d)/i, "/$1-$2")
    .toUpperCase();
}

async function findEncoreSeries(lookup) {
  const seriesList = await fetchEncoreSeriesList();
  return seriesList.find((series) => (
    series.game === "WS"
    && series.lang === "JP"
    && String(series.set || "").toUpperCase() === lookup.set
    && String(series.side || "").toUpperCase() === lookup.side
    && String(series.release || "").toUpperCase() === lookup.release
  )) || null;
}

async function fetchEncoreSeriesList() {
  if (encoreSeriesListCache) return encoreSeriesListCache;
  const response = await fetch("https://www.encoredecks.com/api/serieslist/JP");
  if (!response.ok) throw new Error(`EncoreDecks series list HTTP ${response.status}`);
  encoreSeriesListCache = await response.json();
  return encoreSeriesListCache;
}

async function fetchEncoreSeriesCards(seriesId) {
  if (encoreSeriesCardsCache.has(seriesId)) return encoreSeriesCardsCache.get(seriesId);
  const response = await fetch(`https://www.encoredecks.com/api/series/${encodeURIComponent(seriesId)}/cards`);
  if (!response.ok) throw new Error(`EncoreDecks cards HTTP ${response.status}`);
  const cards = await response.json();
  encoreSeriesCardsCache.set(seriesId, cards);
  return cards;
}

function cleanEncoreString(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u300A\s+/g, "\u300A")
    .replace(/\s+\u300B/g, "\u300B")
    .trim();
}

function encoreAttributes(card, english) {
  const englishAttributes = cleanEncoreAttributes(english?.attributes);
  const jpAttributes = cleanEncoreAttributes(card?.locale?.JP?.attributes || card?.attributes || card?.attribute);
  const fallbackAttributes = cleanEncoreAttributes(card?.traits || card?.trait);
  const base = englishAttributes.length ? englishAttributes : fallbackAttributes;

  if (base.length && jpAttributes.length === base.length) {
    return base.map((attribute, index) => {
      const jp = jpAttributes[index];
      return jp && jp !== attribute ? `${attribute} \u300A${jp}\u300B` : attribute;
    });
  }

  return base.length ? base : jpAttributes;
}

function cleanEncoreAttributes(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(/\s*(?:\/|\||,)\s*/);
  return list.map(cleanEncoreString).filter(Boolean);
}

function hasJapaneseCharacters(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(String(value || ""));
}

function encoreCardType(value) {
  const text = String(value || "").toUpperCase();
  if (text === "CX" || text === "3") return "Climax";
  if (text === "EV" || text === "2") return "Event";
  if (text === "CH" || text === "1") return "Character";
  return cleanEncoreString(value);
}

function encoreColor(value) {
  const text = cleanEncoreString(value).toLowerCase();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function encoreStat(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function encoreSoulText(value) {
  const count = Number(value || 0);
  return count > 0 ? Array.from({ length: count }, () => "\u3010soul\u3011").join(" ") : "";
}

function encoreTriggerText(value) {
  const triggers = Array.isArray(value) ? value : [value].filter(Boolean);
  return triggers.map(encoreTriggerName).filter(Boolean).map((trigger) => `\u3010${trigger}\u3011`).join(" ");
}

function encoreTriggerName(value) {
  const trigger = String(value || "").trim().toUpperCase();
  const names = {
    COMEBACK: "salvage",
    RETURN: "bounce",
    TREASURE: "treasure",
    SOUL: "soul",
    SHOT: "shot",
    CHOICE: "choice",
    GATE: "gate",
    STOCK: "stock",
    STANDBY: "standby",
    DRAW: "draw",
  };
  return names[trigger] || trigger.toLowerCase();
}

async function translateWeissCard(number) {
  const urls = heartOfTheCardsUrls(number);
  let lastError = "";

  for (const url of urls) {
    for (const requestOptions of heartOfTheCardsRequestOptions(url)) {
      try {
        const html = requestOptions.useHelper
          ? await fetchHeartOfTheCardsHtml(url)
          : await fetchHeartOfTheCardsHtmlDirect(url, requestOptions);
        const parsed = parseHeartOfTheCards(html);
        if (isHeartOfTheCardsGenericPage(html)) {
          const error = new Error(`Heart of the Cards asked us to go slower. Wait a bit and press Translate again; already translated cards will be skipped. Snippet: ${hotcDebugSnippet(html)}`);
          error.throttled = true;
          throw error;
        }
        if (!parsed.name && !parsed.text) {
          throw new Error(`No translation found on returned page. Snippet: ${hotcDebugSnippet(html)}`);
        }
        return { ok: true, source: "Heart of the Cards", number, url, ...parsed };
    } catch (error) {
      lastError = error.message || String(error);
      if (error.throttled) return { ok: false, number, url, triedUrls: urls, error: lastError, throttled: true };
    }
  }
  }

  return { ok: false, number, url: urls[0], triedUrls: urls, error: lastError || "No translation found." };
}

function heartOfTheCardsUrls(number) {
  const hotcNumber = heartOfTheCardsNumber(number);
  return [
    `https://heartofthecards.com/code/cardlist.html?card=${encodeURIComponent(hotcNumber)}&short=1`,
    `https://www.heartofthecards.com/code/cardlist.html?card=${encodeURIComponent(hotcNumber)}&short=1`,
  ];
}

function heartOfTheCardsRequestOptions() {
  return [
    { useHelper: true },
    {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    },
    {
      headers: {
        "user-agent": "Deckmanager/0.3",
      },
    },
  ];
}

function fetchHeartOfTheCardsHtml(url) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["scripts/fetch-hotc-card.mjs", url], {
      cwd: resolve("."),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", () => {
      try {
        const result = JSON.parse(stdout.trim() || "{}");
        if (!result.ok) throw new Error(result.error || `HTTP ${result.status || 0}`);
        resolvePromise(String(result.html || ""));
      } catch (error) {
        reject(new Error(error.message || stderr || "HOTC helper failed."));
      }
    });
  });
}

async function fetchHeartOfTheCardsHtmlDirect(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function hotcDebugSnippet(html) {
  return cleanHotcText(String(html || "").slice(0, 700)).replace(/\s+/g, " ").slice(0, 240) || "[blank response]";
}

function isHeartOfTheCardsGenericPage(html) {
  const text = String(html || "");
  return /Heart of the Cards - Card Translations/i.test(text) && !/Reference Card/i.test(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function heartOfTheCardsNumber(number) {
  const withoutEnglishMarker = String(number || "").trim().replace(/\/([A-Z]{1,3}\d{2,4})-E(\d)/i, "/$1-$2");
  return withoutEnglishMarker.startsWith("WS_") ? withoutEnglishMarker : `WS_${withoutEnglishMarker}`;
}

function parseHeartOfTheCards(html) {
  const titleBlock = html.match(/<td[^>]*\bcolspan\s*=\s*["']?2["']?[^>]*>\s*<b>([\s\S]*?)<\/b>/i)?.[1] || "";
  const titleLines = cleanHotcText(titleBlock).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = titleLines.length >= 3 ? titleLines[titleLines.length - 1] : "";

  const traitRow = hotcTraitRow(html);
  const attributes = parseHotcTraits(traitRow);
  const traits = attributes.join(" / ");
  const englishRow = [...html.matchAll(/<tr[^>]*>\s*<t[dh][^>]*\bcolspan\s*=\s*["']?2["']?[^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/gi)].pop()?.[1] || "";
  const text = normalizeHotcCardText(cleanHotcText(englishRow));

  return { name, traits, attributes, text };
}

function hotcTraitRow(html) {
  for (const row of String(html || "").matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)) {
    const text = cleanHotcText(row[0]);
    if (/Trait\s+\d+\s*:/i.test(text) || /Traits?\s*:/i.test(text)) return row[0];
  }
  return "";
}

function parseHotcTraits(html) {
  const text = cleanHotcText(html).replace(/\s+/g, " ");
  const traits = [];

  for (const match of text.matchAll(/Trait\s+\d+:\s*([^()]*?)\s*\(([^)]+)\)/gi)) {
    const jp = (match[1] || "").trim();
    const english = (match[2] || "").trim();
    const trait = cleanHotcTrait(english || jp);
    if (trait) traits.push(trait);
  }

  if (traits.length) return traits.filter(Boolean);

  for (const match of text.matchAll(/Trait\s+\d+:\s*([^\s()]+)/gi)) {
    const trait = cleanHotcTrait(match[1]);
    if (trait) traits.push(trait);
  }

  if (!traits.length) {
    const match = text.match(/Traits:\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
    if (match) {
      const jp = (match[1] || "").trim();
      const english = (match[2] || "").trim();
      const trait = cleanHotcTrait(english || jp);
      if (trait) traits.push(trait);
    }
  }
  return traits.filter(Boolean);
}

function cleanHotcTrait(value) {
  const trait = String(value || "").trim();
  if (!trait || /^none$/i.test(trait) || trait === "-") return "";
  return trait;
}

function normalizeHotcCardText(text) {
  return String(text || "")
    .replace(/\[C\]/g, "【CONT】")
    .replace(/\[A\]/g, "【AUTO】")
    .replace(/\[S\]/g, "【ACT】")
    .replace(/::(.+?)::/g, "《$1》")
    .replace(/\bthis is in the Front Row Center Slot\b/gi, "this card is in the middle position of your center stage")
    .replace(/\bWhen this is\b/g, "When this card is")
    .replace(/\bwhen this is\b/g, "when this card is")
    .replace(/\bthis gains ([+-]?\d+) Power\b/gi, "this card gets $1 power")
    .replace(/\bDiscard a Climax card from your hand to the Waiting Room\b/gi, "Put 1 climax from your hand into your waiting room")
    .replace(/\bplaced from hand to the Stage\b/gi, "placed on the stage from your hand")
    .replace(/\bplaced from your hand to the Stage\b/gi, "placed on the stage from your hand")
    .replace(/\bpay cost\b/gi, "pay the cost")
    .replace(/\bIf so\b/g, "If you do")
    .replace(/\bClimax card\b/g, "climax")
    .replace(/\bWaiting Room\b/g, "waiting room")
    .replace(/\bLibrary\b/g, "library")
    .replace(/\bOpponent\b/g, "opponent")
    .replace(/\bCharacters\b/g, "characters")
    .replace(/\bCharacter\b/g, "Character");
}

function cleanHotcText(html) {
  return decodeHotcHtml(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

function decodeHotcHtml(text) {
  const decoded = String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&#47;/g, "/")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
