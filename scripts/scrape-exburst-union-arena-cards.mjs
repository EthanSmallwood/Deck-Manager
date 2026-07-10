import fs from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG_URL = "https://exburst.dev/ua/en/config/game-config.json";
const DEFAULT_JP_CONFIG_URL = "https://exburst.dev/ua/config/game-config.json";
const DEFAULT_API_URL = "https://auth.exburst.dev/rest/v1/uaen_cards";
const DEFAULT_JP_API_URL = "https://auth.exburst.dev/rest/v1/ua_cards";
const DEFAULT_OUTPUT = "data/cards/union-arena-cards.json";
const DEFAULT_JP_OUTPUT = "data/cards/union-arena-jp-cards.json";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0Zmtkbml3YnZ5b2F5cGp2dWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzNzQwMzUsImV4cCI6MjA2Mzk1MDAzNX0.iCCIOIt8durZJg2JtSCBhPuza7j3pFfF8mS_Xj1m7Ic";
const DEFAULT_SELECT = [
  "name",
  "color",
  "attributeData",
  "effectData",
  "bpData",
  "originalId",
  "cardNo",
  "rarity",
  "image",
  "seriesName",
  "created_at",
  "updated_at",
  "apData",
  "generatedEnergyData",
  "needEnergyData",
  "triggerData",
  "categoryData",
  "mainalternate",
  "series",
  "published",
  "getInfoData",
  "marketPrice",
  "tcgPlayerLink",
  "tcgPlayerName",
  "format",
  "abbreviation",
  "tcgPlayerProductId",
  "comment_count",
];
const DEFAULT_JP_SELECT = [
  "imageLink",
  "cardNo",
  "color",
  "type",
  "name",
  "traits",
  "effect",
  "japaneseeffect",
  "_trigger",
  "_triggerText",
  "rarity",
  "energyCost",
  "generatedEnergyData",
  "apCost",
  "power",
  "raritytype",
  "series",
  "seriesName",
  "originalId",
  "getInfoData",
  "format",
  "created_at",
  "updated_at",
  "published",
  "mainalternate",
  "comment_count",
  "translation_overlay",
  "approved_translation_languages",
  "img",
];

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
  node scripts/scrape-exburst-union-arena-cards.mjs [--output <file>]
  node scripts/scrape-exburst-union-arena-cards.mjs [--locale en|jp] [--har <file.har>] [--pageSize 1000]

Options:
  --har <file>       Extract the public Supabase anon key from a captured ExBurst HAR.
  --locale <en|jp>   Build Union Arena English or Japanese/Asia cards. Defaults to en.
  --apikey <key>     Supabase anon key. Can also be set with EXBURST_SUPABASE_KEY.
  --output <file>    Output JSON path. Defaults to ${DEFAULT_OUTPUT}
  --pageSize <n>     Page size for PostgREST offset paging. Defaults to 1000.
  --maxCards <n>     Stop after n cards, useful for smoke tests.
`);
  process.exit(0);
}

const outputPath = readArg("--output", DEFAULT_OUTPUT);
const locale = normalizeLocale(readArg("--locale", "en"));
const resolvedOutputPath = hasArg("--output") ? outputPath : locale === "jp" ? DEFAULT_JP_OUTPUT : DEFAULT_OUTPUT;
const pageSize = Math.max(1, Math.min(Number(readArg("--pageSize", "1000")) || 1000, 1000));
const maxCards = Number(readArg("--maxCards", "0")) || 0;
const harPath = readArg("--har", "");
const apiKey = readArg("--apikey", process.env.EXBURST_SUPABASE_KEY || "") || extractApiKeyFromHar(harPath) || DEFAULT_SUPABASE_ANON_KEY;

if (!apiKey) {
  throw new Error("Missing ExBurst Supabase anon key. Pass --har <file.har>, --apikey <key>, or set EXBURST_SUPABASE_KEY.");
}

const configUrl = locale === "jp" ? DEFAULT_JP_CONFIG_URL : DEFAULT_CONFIG_URL;
const apiUrl = locale === "jp" ? DEFAULT_JP_API_URL : DEFAULT_API_URL;
const table = locale === "jp" ? "ua_cards" : "uaen_cards";
const selectColumns = locale === "jp" ? DEFAULT_JP_SELECT : DEFAULT_SELECT;

const config = await fetchJson(configUrl, {});
const rawCards = await fetchCards(apiKey);
const cards = rawCards.map((card) => normalizeUnionArenaCard(card, config, locale));

const output = {
  source: {
    name: `ExBurst Union Arena ${locale === "jp" ? "Japanese/Asia" : "English"} card database`,
    configUrl,
    apiUrl,
    table,
    locale,
    extractedAt: new Date().toISOString(),
  },
  counts: {
    cards: cards.length,
    uniqueOriginalIds: new Set(cards.map((card) => card.normalized.originalId).filter(Boolean)).size,
    series: new Set(cards.map((card) => card.normalized.series).filter(Boolean)).size,
  },
  summaries: {
    bySeries: countBy(cards, (card) => card.normalized.series || "(none)"),
    byType: countBy(cards, (card) => card.normalized.cardType || "(none)"),
    byColor: countBy(cards, (card) => card.normalized.color || "(none)"),
    byRarity: countBy(cards, (card) => card.normalized.rarity || "(none)"),
  },
  config: {
    gameid: config.gameid,
    gamename: config.gamename,
    cardConfigVersion: config.card_config_version,
    series: config.series || {},
  },
  cards,
};

fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${cards.length} Union Arena ${locale.toUpperCase()} cards to ${resolvedOutputPath}`);

async function fetchCards(key) {
  const cards = [];
  for (let offset = 0; ; offset += pageSize) {
    const limit = maxCards ? Math.min(pageSize, Math.max(1, maxCards - cards.length)) : pageSize;
    const url = new URL(apiUrl);
    url.searchParams.set("select", selectColumns.join(","));
    url.searchParams.set("published", "eq.1");
    url.searchParams.set("order", "cardNo.asc");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));

    const page = await fetchJson(url, supabaseHeaders(key));
    if (!Array.isArray(page)) throw new Error(`Unexpected cards response at offset ${offset}`);
    cards.push(...page);
    console.log(`Fetched ${cards.length} cards`);

    if (maxCards && cards.length >= maxCards) return cards.slice(0, maxCards);
    if (page.length < limit) return cards;
  }
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for ${url}\n${body.slice(0, 500)}`);
  }
  return response.json();
}

function supabaseHeaders(key) {
  return {
    accept: "application/json",
    apikey: key,
    authorization: `Bearer ${key}`,
    "accept-profile": "public",
    "x-client-info": "deckmanager",
  };
}

function normalizeUnionArenaCard(card, config, locale) {
  const seriesCode = String(card.series || "").trim();
  const isJp = locale === "jp";
  const effectText = htmlToText(isJp ? card.effect || card.japaneseeffect : card.effectData);
  const japaneseEffectText = isJp ? htmlToText(card.japaneseeffect) : "";
  const triggerText = cleanDash(htmlToText(isJp ? card._triggerText : card.triggerData));
  const getInfoText = htmlToText(card.getInfoData);
  const features = cleanDash(isJp ? card.traits : card.attributeData);
  const imageUrl = isJp
    ? highResolutionImageUrl(card.img || card.imageLink)
    : highResolutionImageUrl(card.image);
  return {
    normalized: {
      number: String(card.cardNo || ""),
      name: String(card.name || ""),
      game: isJp ? "Union Arena (JP)" : "Union Arena (EN)",
      locale,
      cardType: String(isJp ? card.type : card.categoryData || ""),
      color: String(card.color || ""),
      rarity: String(card.rarity || ""),
      power: stringValue(isJp ? card.power : card.bpData),
      bp: stringValue(isJp ? card.power : card.bpData),
      ap: stringValue(isJp ? card.apCost : card.apData),
      cost: stringValue(isJp ? card.energyCost : card.needEnergyData),
      energyCost: stringValue(isJp ? card.energyCost : card.needEnergyData),
      generatedEnergy: stringValue(card.generatedEnergyData),
      trigger: triggerText,
      features,
      featureList: splitFeatures(features),
      text: [effectText, triggerText ? `Trigger: ${triggerText}` : "", getInfoText ? `Source: ${getInfoText}` : ""].filter(Boolean).join("\n\n"),
      effectText,
      effectHtml: String(isJp ? card.effect || card.japaneseeffect || "" : card.effectData || ""),
      japaneseEffectText,
      getInfoText,
      originalId: String(card.originalId || ""),
      imageUrl,
      rawImageUrl: imageUrl,
      detailUrl: isJp ? `https://exburst.dev/ua/cards/${encodeURIComponent(String(card.cardNo || ""))}` : "",
      renderedImagePageUrl: isJp ? `https://exburst.dev/ua/cards/${encodeURIComponent(String(card.cardNo || ""))}` : "",
      series: seriesCode,
      seriesName: String(card.seriesName || config.series?.[seriesCode]?.name || ""),
      abbreviation: String(card.abbreviation || ""),
      isAlternate: card.mainalternate === false,
      marketPrice: card.marketPrice,
      tcgPlayerLink: card.tcgPlayerLink,
      tcgPlayerName: card.tcgPlayerName,
      tcgPlayerProductId: card.tcgPlayerProductId,
      format: String(card.format || ""),
      translationOverlay: Boolean(card.translation_overlay),
      approvedTranslationLanguages: card.approved_translation_languages || null,
      createdAt: card.created_at,
      updatedAt: card.updated_at,
    },
    raw: card,
  };
}

function splitFeatures(value) {
  return String(value || "")
    .split(/[\uFF0F/|]/)
    .map((trait) => trait.trim())
    .filter((trait) => trait && trait !== "-");
}

function highResolutionImageUrl(value) {
  return String(value || "").replace("/cards/sd/", "/cards/hd/");
}

function htmlToText(value) {
  return decodeEntities(String(value || "")
    .replace(/<img\b[^>]*alt=["']?([^"'>]+)["']?[^>]*>/gi, "[$1]")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function decodeEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stringValue(value) {
  return value == null ? "" : String(value);
}

function cleanDash(value) {
  const text = String(value || "").trim();
  return text === "-" ? "" : text;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function extractApiKeyFromHar(filePath) {
  if (!filePath) return "";
  const har = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const entry = har.log?.entries?.find((item) => /\/rest\/v1\/(?:uaen_cards|ua_cards)/.test(item.request?.url || ""));
  const header = entry?.request?.headers?.find((item) => item.name.toLowerCase() === "apikey");
  return String(header?.value || "");
}

function normalizeLocale(value) {
  const locale = String(value || "").trim().toLowerCase();
  return locale === "jp" || locale === "ja" ? "jp" : "en";
}
