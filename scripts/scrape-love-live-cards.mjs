import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_OFFICIAL_URL =
  "https://llofficial-cardgame.com/cardlist/searchresults/?keyword1=&keyword_type1%5B0%5D=all&search_type1=and&keyword2=&keyword_type2%5B0%5D=all&search_type2=and&keyword3=&keyword_type3%5B0%5D=all&search_type3=and&title=&card_kind=&work_title=&unit_name=&cost_s=&cost_e=&score_s=&score_e=&blade_heart%5B0%5D=all&blade_s=&blade_e=&rare%5B0%5D=all&parallel=all&view=text&sort=new";
const DEFAULT_TRANSLATION_SHEET_ID = "1jvp31AXnJ7GVdpfYkpKdIPX2-RkNHF8k9ztHNBIHVI8";
const DEFAULT_OUTPUT = "data/cards/lovelive-cards.json";
const BASE_URL = "https://llofficial-cardgame.com";

const args = process.argv.slice(2);

function readArg(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function hasArg(name) {
  return args.includes(name);
}

const officialUrl = readArg("--official-url", DEFAULT_OFFICIAL_URL);
const translationSheetId = readArg("--translation-sheet", DEFAULT_TRANSLATION_SHEET_ID);
const outputPath = readArg("--output", DEFAULT_OUTPUT);
const delayMs = Number(readArg("--delayMs", "75")) || 0;
const pageLimit = Number(readArg("--pageLimit", "0")) || 0;

if (hasArg("--help")) {
  console.log(`Usage:
  node scripts/scrape-love-live-cards.mjs [--output <file>]
  node scripts/scrape-love-live-cards.mjs [--translation-sheet <sheet-id>] [--delayMs 75]

Scrapes Love Live Official Card Game JP official cards and merges available
English translations from the community translation Google Sheet.
`);
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url, attempts = 3, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          accept: "text/html,application/xhtml+xml,text/csv,*/*",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          ...(options.headers || {}),
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }
  throw lastError;
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripTags(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, " $1 ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeCardNumber(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[＋]/g, "+")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeBaseCardNumber(value) {
  return normalizeCardNumber(value).replace(/-[A-Z+]+$/, "");
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry == null) return false;
      if (typeof entry === "string" && !entry.trim()) return false;
      if (Array.isArray(entry) && !entry.length) return false;
      if (typeof entry === "object" && !Array.isArray(entry) && !Object.keys(entry).length) return false;
      return true;
    }),
  );
}

function absoluteUrl(url) {
  if (!url) return "";
  return new URL(decodeHtml(url), BASE_URL).toString();
}

function parseInfoItems(html) {
  const details = {};
  for (const match of html.matchAll(/<div class="info-Item">([\s\S]*?)<\/div>/g)) {
    const block = match[1];
    const label = stripTags(block.match(/<dt>([\s\S]*?)<\/dt>/)?.[1] || "");
    const value = stripTags(block.match(/<dd>([\s\S]*?)<\/dd>/)?.[1] || "");
    if (label && value) details[label] = value;
  }
  return details;
}

function parseOfficialCardsFromHtml(html) {
  const cards = [];
  for (const match of html.matchAll(/<div class="(?:ex-item )?cardlist-Result_Item text-Item"[^>]*card="([^"]+)"[^>]*>([\s\S]*?)(?=<div class="(?:ex-item )?cardlist-Result_Item text-Item"|$)/g)) {
    const [, cardNumber, block] = match;
    const imageMatch = block.match(/<img\b[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/);
    const name = stripTags(block.match(/<p class="heading">([\s\S]*?)<\/p>/)?.[1] || imageMatch?.[2] || "");
    const details = parseInfoItems(block);
    const textHtml = block.match(/<p class="text">([\s\S]*?)<\/p>/)?.[1] || "";
    const text = stripTags(textHtml);
    const number = details["カード番号"] || cardNumber;

    cards.push(
      compactObject({
        number,
        normalizedNumber: normalizeCardNumber(number),
        normalizedBaseNumber: normalizeBaseCardNumber(number),
        name,
        cardSet: details["収録商品"] || "",
        cardType: details["カードタイプ"] || "",
        text,
        imageUrl: absoluteUrl(imageMatch?.[1] || ""),
        detailUrl: `${BASE_URL}/cardlist/searchresults/?cardno=${encodeURIComponent(number)}`,
        officialDetails: details,
      }),
    );
  }
  return cards;
}

function cardSearchUrl(page) {
  const url = new URL(officialUrl);
  url.pathname = "/cardlist/cardsearch_ex";
  url.searchParams.set("page", String(page));
  return url.toString();
}

async function scrapeOfficialCards() {
  const cards = [];
  const seen = new Set();
  let page = 1;
  for (;;) {
    const url = cardSearchUrl(page);
    let html = "";
    try {
      html = await fetchTextWithRetry(url, 3, {
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
    } catch (error) {
      if (/HTTP 404/.test(error.message || "") && page > 1) {
        console.log(`Official page ${page}: reached end of list.`);
        break;
      }
      throw error;
    }
    const pageCards = parseOfficialCardsFromHtml(html);
    const newCards = pageCards.filter((card) => {
      const key = normalizeCardNumber(card.number);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    cards.push(...newCards);
    console.log(`Official page ${page}: +${newCards.length} cards (${cards.length} total)`);

    if (!pageCards.length || !newCards.length) break;
    if (pageLimit && page >= pageLimit) break;
    page += 1;
    if (delayMs > 0) await sleep(delayMs);
  }
  return cards;
}

async function discoverTranslationSheets(sheetId) {
  const html = await fetchTextWithRetry(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, 3);
  return [...html.matchAll(/docs-sheet-tab-caption">([\s\S]*?)<\/div>/g)]
    .map((match) => stripTags(match[1]))
    .filter((name) => name && isTranslationSheet(name));
}

function isTranslationSheet(name) {
  const text = String(name || "").trim();
  return !/^(landing page|faq|shop with singles|sample decks|keywords)$/i.test(text);
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => String(value || "").trim()));
}

function cell(rows, rowIndex, columnIndex) {
  return String(rows[rowIndex]?.[columnIndex] || "").trim();
}

function firstNonEmpty(cells) {
  return cells.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function nearestLeftValue(rows, rowIndex, columnIndex) {
  for (let c = columnIndex; c >= Math.max(0, columnIndex - 5); c -= 1) {
    const value = cell(rows, rowIndex, c);
    if (value && !/^(member name|music title|title|sub-unit|sub-unit\(s\))$/i.test(value)) return value;
  }
  return "";
}

function rowValueAfterLabel(rows, rowIndex, labelColumn) {
  const values = [];
  for (let c = labelColumn + 1; c < Math.min((rows[rowIndex] || []).length, labelColumn + 7); c += 1) {
    const value = cell(rows, rowIndex, c);
    if (/^(cost|score|basic hearts|blade hearts|blades|rarity|card number|card text)$/i.test(value)) break;
    if (value) values.push(value);
  }
  return values.join("\n").trim();
}

function blockTextAfterLabel(rows, rowIndex, labelColumn) {
  const lines = [];
  for (let r = rowIndex; r < Math.min(rows.length, rowIndex + 6); r += 1) {
    const values = [];
    for (let c = labelColumn + 1; c < Math.min((rows[r] || []).length, labelColumn + 8); c += 1) {
      const value = cell(rows, r, c);
      if (/^(cost|score|basic hearts|blade hearts|blades|rarity|card number|card text)$/i.test(value)) break;
      if (value) values.push(value);
    }
    if (values.length) lines.push(values.join(" "));
  }
  return lines.join("\n").trim();
}

function findBlockValue(rows, numberRow, labelColumn, labels) {
  const wanted = labels.map(normalizeHeader);
  for (let r = Math.max(0, numberRow - 10); r < Math.min(rows.length, numberRow + 12); r += 1) {
    for (let c = Math.max(0, labelColumn - 1); c < Math.min((rows[r] || []).length, labelColumn + 2); c += 1) {
      if (wanted.includes(normalizeHeader(cell(rows, r, c)))) {
        return rowValueAfterLabel(rows, r, c);
      }
    }
  }
  return "";
}

function parseSheetCards(rows, sheetName) {
  const cards = [];
  const seen = new Set();
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < (rows[r] || []).length; c += 1) {
      if (normalizeHeader(cell(rows, r, c)) !== "card number") continue;
      const number = rowValueAfterLabel(rows, r, c);
      const normalizedNumber = normalizeCardNumber(number);
      if (!normalizedNumber || seen.has(normalizedNumber)) continue;
      seen.add(normalizedNumber);

      const headerText = firstNonEmpty([cell(rows, 0, c + 1), cell(rows, 0, c + 2), cell(rows, 0, c + 3)]);
      const cardSet = nearestLeftValue(rows, 0, c) || sheetName;
      const rarity = findBlockValue(rows, r, c, ["Rarity"]);
      const textLabelRow = rows.findIndex((row, index) => index >= r && index < r + 4 && normalizeHeader(row[c]) === "card text");
      const text = textLabelRow >= 0 ? blockTextAfterLabel(rows, textLabelRow, c) : "";
      const kind = /live/i.test(sheetName) ? "Live" : "Member";

      cards.push(
        compactObject({
          number,
          normalizedNumber,
          normalizedBaseNumber: normalizeBaseCardNumber(number),
          name: parseTranslatedName(headerText),
          rawNameLine: headerText,
          cardSet,
          cardType: kind,
          cost: findBlockValue(rows, r, c, ["Cost"]),
          score: findBlockValue(rows, r, c, ["Score"]),
          basicHearts: findBlockValue(rows, r, c, ["Basic Hearts", "Hearts Required"]),
          bladeHearts: findBlockValue(rows, r, c, ["Blade Hearts", "Blade hearts"]),
          blades: findBlockValue(rows, r, c, ["Blades"]),
          rarity,
          text,
          sourceSheet: sheetName,
        }),
      );
    }
  }
  return cards;
}

function parseTranslatedName(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(.+?)\s+Love Live!/i);
  if (match) return match[1].trim();
  return text.replace(/\s+[-–]\s*$/, "").trim();
}

async function fetchTranslations(sheetId) {
  const sheets = await discoverTranslationSheets(sheetId);
  const byNumber = new Map();
  const byBaseNumber = new Map();
  let total = 0;

  for (const sheet of sheets) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    try {
      const csv = await fetchTextWithRetry(url, 3);
      const cards = parseSheetCards(parseCsv(csv), sheet);
      for (const card of cards) {
        const existing = byNumber.get(card.normalizedNumber) || {};
        byNumber.set(card.normalizedNumber, compactObject({ ...existing, ...card }));
        const existingBase = byBaseNumber.get(card.normalizedBaseNumber) || {};
        byBaseNumber.set(card.normalizedBaseNumber, compactObject({ ...existingBase, ...card }));
      }
      total += cards.length;
      console.log(`Translation sheet "${sheet}": ${cards.length} cards`);
      if (delayMs > 0) await sleep(delayMs);
    } catch (error) {
      console.warn(`Could not parse translation sheet "${sheet}": ${error.message || error}`);
    }
  }

  return { byNumber, byBaseNumber, sheets, total };
}

function findTranslation(official, translations) {
  return translations.byNumber.get(normalizeCardNumber(official.number))
    || translations.byBaseNumber.get(normalizeBaseCardNumber(official.number))
    || null;
}

function mergeCards(officialCards, translations) {
  const merged = [];
  const seen = new Set();

  for (const official of officialCards) {
    const key = normalizeCardNumber(official.number);
    const translation = findTranslation(official, translations);
    seen.add(key);
    merged.push(
      compactObject({
        game: "Love Live Official Card Game",
        number: official.number,
        name: translation?.name || official.name,
        cardSet: official.cardSet || translation?.cardSet,
        cardType: official.cardType || translation?.cardType,
        rarity: translation?.rarity,
        imageUrl: official.imageUrl,
        detailUrl: official.detailUrl,
        text: translation?.text || official.text,
        translation,
        official,
      }),
    );
  }

  for (const translation of translations.byNumber.values()) {
    const key = normalizeCardNumber(translation.number);
    if (seen.has(key)) continue;
    merged.push(
      compactObject({
        game: "Love Live Official Card Game",
        number: translation.number,
        name: translation.name,
        cardSet: translation.cardSet,
        cardType: translation.cardType,
        rarity: translation.rarity,
        text: translation.text,
        translation,
      }),
    );
  }

  return merged.sort((a, b) => String(a.number || "").localeCompare(String(b.number || ""), undefined, { numeric: true }));
}

const officialCards = await scrapeOfficialCards();
const translations = await fetchTranslations(translationSheetId);
const cards = mergeCards(officialCards, translations);
const translatedMatches = cards.filter((card) => card.official && card.translation).length;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: {
        officialUrl,
        translationSheetId,
        translationSheets: translations.sheets,
      },
      counts: {
        cards: cards.length,
        officialCards: officialCards.length,
        translationCards: translations.byNumber.size,
        translatedMatches,
        translationOnlyCards: cards.filter((card) => !card.official && card.translation).length,
      },
      cards,
    },
    null,
    2,
  ),
);

console.log(`Wrote ${cards.length} Love Live cards to ${outputPath}.`);
console.log(`Matched ${translatedMatches}/${officialCards.length} official cards with translation data.`);
