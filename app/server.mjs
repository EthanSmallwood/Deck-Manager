#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { deleteDeck, loadDecks, upsertDeck } from "../src/deckstore.mjs";
import { detectDecklogGame, fetchDecklogPayload } from "../src/games/decklog.mjs";
import { clearWeissDatabaseCache, importDecklogDeck, importEncoreDeck, loadWeissDatabase, resolveWeissDeck } from "../src/games/weiss.mjs";
import { importHololiveDecklogDeck, importHololiveDecklogPayload } from "../src/games/hololive.mjs";
import { loadSettings, saveSettings } from "../src/settingsstore.mjs";
import { generateWeissTtsDeck, serveAsset } from "../src/tts/weiss-tts.mjs";

const PORT = Number(portArg() || process.env.PORT || 17777);
let currentPort = PORT;
let weissBuildJob = null;
let hololiveBuildJob = null;
let weissSeriesCache = null;

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
        games: ["Weiss Schwarz", "Hololive OCG"],
        weissCards: db.cards.length,
        hololiveCards: countJsonCards("data/cards/hololive-cards.json"),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/decks") {
      sendJson(response, 200, { ok: true, decks: loadDecks() });
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
      const result = resolveWeissDeck(body.deckText || "");
      sendJson(response, 200, { ok: !result.missing.length, ...result });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/weiss/search") {
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
      };
      const cards = loadWeissDatabase().cards
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
        })
        .slice(0, 120);
      sendJson(response, 200, { ok: true, cards });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/weiss/series") {
      sendJson(response, 200, { ok: true, series: listWeissSeries() });
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

    if (request.method === "POST" && url.pathname === "/api/hololive/decklog") {
      const body = await readJsonBody(request);
      const result = await importHololiveDecklogDeck(body.url || body.deckId || "");
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
      const job = startWeissCardDatabaseBuild();
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

    if (request.method === "POST" && url.pathname === "/api/tts/weiss") {
      const body = await readJsonBody(request);
      const decks = loadDecks();
      const deck = decks.find((item) => item.id === body.deckId);
      if (!deck) {
        sendJson(response, 404, { ok: false, error: "Deck not found." });
        return;
      }
      if (deck.game !== "Weiss Schwarz") {
        sendJson(response, 400, { ok: false, error: "TTS export currently supports Weiss Schwarz decks." });
        return;
      }
      const result = await generateWeissTtsDeck(deck, currentPort, loadSettings());
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

function matchesWeissFilters(card, filters) {
  if (filters.type && String(card.cardType || "").toLowerCase() !== filters.type) return false;
  if (filters.color && String(card.color || "").toLowerCase() !== filters.color) return false;
  if (filters.trigger && !String(card.trigger || "").toLowerCase().includes(filters.trigger)) return false;
  if (!inRange(card.level, filters.levelMin, filters.levelMax)) return false;
  if (!inRange(card.cost, filters.costMin, filters.costMax)) return false;
  if (!inRange(card.power, filters.powerMin, filters.powerMax)) return false;
  if (!inRange(card.soul, filters.soulMin, filters.soulMax, soulValue)) return false;
  return true;
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

function titleCode(number) {
  return String(number || "").split("/")[0].toUpperCase();
}

function listWeissSeries() {
  const codeCounts = new Map();

  for (const card of loadWeissDatabase().cards) {
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

function startWeissCardDatabaseBuild() {
  if (weissBuildJob?.status === "running") return weissBuildJob;

  weissBuildJob = {
    id: new Date().toISOString(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    weissCards: 0,
    log: "Starting Weiss card database build...",
    error: "",
  };

  const child = spawn(process.execPath, [
    "scripts/scrape-weiss-cards.mjs",
    "--output",
    "data/cards/weiss-cards.json",
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

    clearWeissDatabaseCache();
    const db = loadWeissDatabase();
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

function countJsonCards(path) {
  try {
    if (!existsSync(path)) return 0;
    const cards = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(cards) ? cards.length : 0;
  } catch {
    return 0;
  }
}
