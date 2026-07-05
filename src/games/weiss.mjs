import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CARDS_PATHS = {
  en: resolve("data/cards/weiss-cards.json"),
  jp: resolve("data/cards/weiss-jp-cards.json"),
};

const cachedDatabases = new Map();

export function loadWeissDatabase(locale = "en") {
  const key = weissLocale(locale);
  if (!cachedDatabases.has(key)) {
    const path = CARDS_PATHS[key];
    const cards = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
    cachedDatabases.set(key, buildDatabase(cards));
  }
  return cachedDatabases.get(key);
}

export function clearWeissDatabaseCache(locale = "") {
  if (locale) cachedDatabases.delete(weissLocale(locale));
  else cachedDatabases.clear();
}

export function parseWeissDeck(text) {
  const entries = [];
  const lines = String(text || "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\/\/.*$/, "").replace(/#.*$/, "").trim();
    if (!line) continue;
    if (/^(characters?|events?|climaxes?|cx|comments?|notes?)\b/i.test(line)) continue;

    let qty = 1;
    let number = line;
    let pastedName = "";
    let match = line.match(/^([A-Z0-9][A-Z0-9+./_-]*\/[A-Z0-9+./_-]+)\s+(\d+)(?:\s+.*)?$/i);

    if (match) {
      number = match[1].trim();
      qty = Number(match[2]);
      pastedName = line.slice(match[0].match(/^([A-Z0-9][A-Z0-9+./_-]*\/[A-Z0-9+./_-]+)\s+\d+/i)[0].length).trim();
    } else if ((match = line.match(/^(\d+)\s+(.+)$/))) {
      qty = Number(match[1]);
      number = match[2].trim();
      pastedName = number.replace(/^[A-Z0-9][A-Z0-9+._-]*\/[A-Z0-9+._-]+/i, "").trim();
    } else if ((match = line.match(/^(.+?)\s+[xX](\d+)$/))) {
      number = match[1].trim();
      qty = Number(match[2]);
      pastedName = number.replace(/^[A-Z0-9][A-Z0-9+._-]*\/[A-Z0-9+._-]+/i, "").trim();
    }

    number = extractCardNumber(number);
    if (!number || !Number.isFinite(qty) || qty < 1) continue;
    entries.push({ qty, number, name: pastedName, line: index + 1 });
  }

  return entries;
}

export function resolveWeissDeck(text, options = {}) {
  const locale = weissLocale(options.locale || (options.jp ? "jp" : "en"));
  const db = loadWeissDatabase(locale);
  const entries = parseWeissDeck(text);
  const cards = [];
  const missing = [];
  const ambiguous = [];

  for (const entry of entries) {
    const resolution = resolveEntry(entry, db, { allowEnglishMarker: locale !== "jp" });
    if (!resolution.matches.length) {
      missing.push(entry);
      continue;
    }

    const card = resolution.matches[0];
    if (resolution.matches.length > 1 || resolution.method !== "number") {
      ambiguous.push({
        line: entry.line,
        input: entry.number,
        resolvedNumber: card.number,
        matches: resolution.matches.length,
        resolvedBy: resolution.method,
      });
    }

    cards.push({
      qty: entry.qty,
      number: card.number,
      name: card.name,
      game: "Weiss Schwarz",
      locale,
      section: sectionFor(card),
      cardType: card.cardType || "",
      color: card.color || "",
      level: card.level || "",
      cost: card.cost || "",
      power: card.power || "",
      soul: card.soul || "",
      trigger: card.trigger || "",
      rarity: card.rarity || "",
      text: card.text || "",
      imageUrl: card.imageUrl || "",
      detailUrl: card.detailUrl || "",
    });
  }

  return {
    entries,
    cards,
    missing,
    ambiguous,
    locale,
    totalCards: cards.reduce((sum, card) => sum + card.qty, 0),
    uniqueCards: cards.length,
  };
}

export async function importEncoreDeck(value) {
  const deckId = encoreDeckId(value);
  if (!deckId) return { ok: false, error: "Enter an Encore Decks URL or deck id." };

  const apiUrl = `https://www.encoredecks.com/api/deck/${encodeURIComponent(deckId)}`;
  const response = await fetch(apiUrl, { headers: { "user-agent": "Deckmanager/0.1" } });
  if (!response.ok) return { ok: false, error: `Encore Decks returned HTTP ${response.status}.` };

  const deck = await response.json();
  const counts = new Map();
  const names = new Map();
  const categories = new Map();

  for (const card of deck.cards || []) {
    const number = String(card.cardcode || "").trim();
    if (!number) continue;
    counts.set(number, (counts.get(number) || 0) + 1);
    names.set(number, card.locale?.EN?.name || card.name || "");
    categories.set(number, encoreCategory(card.cardtype));
  }

  if (!counts.size) return { ok: false, error: "Encore Decks response did not contain card codes." };

  const deckText = groupedDeckText(counts, names, categories);
  return {
    ok: true,
    deckId,
    apiUrl,
    deckName: safeDeckTitle(deck.name || deck.title || deck.description || `Encore ${deckId}`),
    deckText,
    cards: [...counts.values()].reduce((sum, qty) => sum + qty, 0),
    uniqueCards: counts.size,
  };
}

export async function importDecklogDeck(value) {
  const deckId = decklogDeckId(value);
  if (!deckId) return { ok: false, error: "Enter a Decklog URL or deck code." };

  const base = "https://decklog-en.bushiroad.com";
  const candidateRequests = [
    { method: "POST", url: `${base}/system/app/api/view/${encodeURIComponent(deckId)}` },
    { method: "GET", url: `${base}/system/app/api/view/${encodeURIComponent(deckId)}` },
    { method: "GET", url: `${base}/app/api/view/${encodeURIComponent(deckId)}` },
    { method: "GET", url: `${base}/api/view/${encodeURIComponent(deckId)}` },
    { method: "POST", url: `${base}/app/api/view`, body: { deck_code: deckId, deck_id: deckId, id: deckId } },
    { method: "POST", url: `${base}/api/deck/view`, body: { deck_code: deckId, deck_id: deckId, id: deckId } },
  ];

  const attempts = [];
  for (const request of candidateRequests) {
    const result = await fetchJsonCandidate(request);
    attempts.push(result.label);
    if (!result.ok) continue;

    const parsed = decklogTextFromPayload(result.json, deckId);
    if (parsed.ok) {
      return {
        ok: true,
        deckId,
        apiUrl: request.url,
        deckName: parsed.deckName,
        cards: parsed.cards,
        uniqueCards: parsed.uniqueCards,
        deckText: parsed.deckText,
      };
    }
  }

  return {
    ok: false,
    error: `Decklog import could not find card data for ${deckId}. Tried: ${attempts.join(", ")}`,
  };
}

function buildDatabase(cards) {
  const byNumber = new Map();
  const byName = new Map();
  const searchableCards = [];

  for (const card of cards) {
    const key = normalizeNumber(card.number);
    if (!byNumber.has(key)) byNumber.set(key, []);
    byNumber.get(key).push(card);

    const nameKey = normalizeName(card.name);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(card);
    searchableCards.push({ card, nameKey });
  }

  return { cards, byNumber, byName, searchableCards };
}

function resolveEntry(entry, db, options = {}) {
  const numberMatches = db.byNumber.get(normalizeNumber(entry.number)) || [];
  if (numberMatches.length) return { method: "number", matches: numberMatches };

  if (options.allowEnglishMarker !== false) {
    for (const candidate of cardNumberCandidates(entry.number)) {
      const candidateMatches = db.byNumber.get(candidate) || [];
      if (candidateMatches.length) return { method: "number+E", matches: candidateMatches };
    }
  }

  if (!entry.name) return { method: "missing", matches: [] };

  const nameKey = normalizeName(entry.name);
  const exactNameMatches = db.byName.get(nameKey) || [];
  if (exactNameMatches.length) return { method: "name", matches: exactNameMatches };

  if (nameKey.length < 6) return { method: "missing", matches: [] };
  const fuzzyMatches = db.searchableCards
    .filter((item) => item.nameKey.includes(nameKey) || nameKey.includes(item.nameKey))
    .map((item) => item.card);

  return fuzzyMatches.length ? { method: "fuzzy-name", matches: fuzzyMatches } : { method: "missing", matches: [] };
}

function groupedDeckText(counts, names, categories) {
  const groups = new Map([
    ["Character", []],
    ["Event", []],
    ["Climax", []],
    ["Other", []],
  ]);

  for (const [number, qty] of counts) {
    const category = categories.get(number) || "Other";
    groups.get(category).push({ number, qty, name: names.get(number) || "" });
  }

  const lines = [];
  for (const [heading, cards] of groups) {
    if (!cards.length) continue;
    lines.push(heading.endsWith("x") ? `${heading}es` : `${heading}s`);
    for (const card of cards) lines.push(`${card.number}\t${card.qty}\t${card.name}`);
  }

  return lines.join("\n");
}

async function fetchJsonCandidate(request) {
  const options = {
    method: request.method,
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Deckmanager/0.1",
      "origin": "https://decklog-en.bushiroad.com",
      "referer": "https://decklog-en.bushiroad.com/",
      "x-requested-with": "XMLHttpRequest",
    },
  };

  if (request.method === "POST") {
    options.headers["content-type"] = "application/json;charset=utf-8";
    options.body = request.body ? JSON.stringify(request.body) : "";
  }

  try {
    const response = await fetch(request.url, options);
    const label = `${request.method} ${request.url} -> HTTP ${response.status}`;
    if (!response.ok) return { ok: false, label };
    const text = await response.text();
    return { ok: true, label, json: JSON.parse(text) };
  } catch (error) {
    return { ok: false, label: `${request.method} ${request.url} -> ${error.message || String(error)}` };
  }
}

function decklogTextFromPayload(payload, deckId) {
  const rows = collectDecklogRows(payload);
  const counts = new Map();
  const names = new Map();
  const categories = new Map();

  for (const row of rows) {
    const number = extractDecklogCardNumber(row);
    if (!number) continue;
    const qty = extractDecklogQty(row);
    counts.set(number, (counts.get(number) || 0) + qty);
    names.set(number, extractDecklogName(row));
    categories.set(number, extractDecklogCategory(row, number));
  }

  if (!counts.size) return { ok: false };

  const deckText = groupedDeckText(counts, names, categories);
  return {
    ok: true,
    deckName: safeDeckTitle(findDecklogTitle(payload) || `Decklog ${deckId}`),
    cards: [...counts.values()].reduce((sum, qty) => sum + qty, 0),
    uniqueCards: counts.size,
    deckText,
  };
}

function collectDecklogRows(value, rows = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return rows;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectDecklogRows(item, rows, seen);
    return rows;
  }

  if (extractDecklogCardNumber(value)) rows.push(value);
  for (const child of Object.values(value)) collectDecklogRows(child, rows, seen);
  return rows;
}

function extractDecklogCardNumber(row) {
  const directKeys = ["card_number", "card_no", "cardno", "card_code", "cardcode", "card_num", "cardNum", "number", "code"];
  for (const key of directKeys) {
    const number = extractCardNumber(row?.[key]);
    if (number) return number;
  }

  for (const key of ["image", "image_url", "img", "src", "card_image", "cardImage"]) {
    const number = cardNumberFromImageUrl(row?.[key]);
    if (number) return number;
  }

  for (const key of ["card", "card_info", "cardInfo", "master"]) {
    const nested = row?.[key];
    if (nested && typeof nested === "object") {
      const number = extractDecklogCardNumber(nested);
      if (number) return number;
    }
  }

  return "";
}

function extractDecklogQty(row) {
  for (const key of ["num", "qty", "quantity", "count", "card_count", "cardCount"]) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return 1;
}

function extractDecklogName(row) {
  for (const key of ["name", "card_name", "cardName", "name_en", "card_name_en", "name_english"]) {
    const value = String(row?.[key] || "").trim();
    if (value) return value;
  }

  for (const key of ["card", "card_info", "cardInfo", "master"]) {
    const nested = row?.[key];
    if (nested && typeof nested === "object") {
      const name = extractDecklogName(nested);
      if (name) return name;
    }
  }

  return "";
}

function extractDecklogCategory(row, number) {
  for (const key of ["card_kind", "card_type", "cardType", "kind", "type"]) {
    const category = categoryFromText(row?.[key]);
    if (category !== "Other") return category;
  }
  const localCard = loadWeissDatabase().byNumber.get(normalizeNumber(number))?.[0];
  return localCard ? categoryFromText(localCard.cardType) : "Other";
}

function categoryFromText(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("climax") || text === "cx" || text === "4") return "Climax";
  if (text.includes("event") || text === "ev" || text === "2") return "Event";
  if (text.includes("character") || text === "ch" || text === "1") return "Character";
  return "Other";
}

function findDecklogTitle(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);

  for (const key of ["deck_name", "deckName", "name", "title"]) {
    const title = String(value?.[key] || "").trim();
    if (title && !extractCardNumber(title)) return title;
  }

  for (const child of Object.values(value)) {
    const title = findDecklogTitle(child, seen);
    if (title) return title;
  }

  return "";
}

function sectionFor(card) {
  const type = String(card.cardType || "").toLowerCase();
  if (type.includes("climax") || type.includes("クライマックス")) return "Climax";
  if (type.includes("event") || type.includes("イベント")) return "Event";
  if (type.includes("character") || type.includes("キャラ")) return "Character";
  return "Other";
}

function extractCardNumber(value) {
  return String(value || "").match(/[A-Z0-9][A-Z0-9+._-]*\/[A-Z0-9+._-]+/i)?.[0] || "";
}

function cardNumberFromImageUrl(value) {
  const text = String(value || "");
  const filename = decodeURIComponent(text.split(/[/?#]/).filter(Boolean).pop() || "");
  const withoutExtension = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "");
  return extractCardNumber(withoutExtension.replaceAll("_", "/")) || extractCardNumber(withoutExtension.replace(/_E/, "-E"));
}

function cardNumberCandidates(value) {
  const raw = String(value || "");
  const candidates = new Set([normalizeNumber(raw)]);
  const missingEnglishMarker = raw.match(/^(.+\/[A-Z]{1,3}\d{2,4}-)(\d.*)$/i);
  if (missingEnglishMarker) candidates.add(normalizeNumber(`${missingEnglishMarker[1]}E${missingEnglishMarker[2]}`));
  return [...candidates].filter(Boolean);
}

function normalizeNumber(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();
}

function encoreDeckId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.match(/encoredecks\.com\/deck\/([A-Za-z0-9_-]+)/i)?.[1] || text.match(/^[A-Za-z0-9_-]+$/)?.[0] || "";
}

function decklogDeckId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.match(/decklog-en\.bushiroad\.com\/view\/([A-Za-z0-9_-]+)/i)?.[1] || text.match(/^[A-Za-z0-9_-]+$/)?.[0] || "";
}

function encoreCategory(cardType) {
  const value = Number(cardType);
  if (value === 2) return "Event";
  if (value === 3) return "Climax";
  if (value === 1) return "Character";
  return "Other";
}

function safeDeckTitle(value) {
  return String(value || "Weiss Schwarz Deck").replace(/\s+/g, " ").trim() || "Weiss Schwarz Deck";
}

function weissLocale(value) {
  return String(value || "").toLowerCase() === "jp" ? "jp" : "en";
}
