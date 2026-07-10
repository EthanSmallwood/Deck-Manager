import { readFileSync } from "node:fs";

const UNION_ARENA_DB_PATH = "data/cards/union-arena-cards.json";
const UNION_ARENA_JP_DB_PATH = "data/cards/union-arena-jp-cards.json";
const EXBURST_API_URL = "https://auth.exburst.dev/rest/v1";
const EXBURST_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0Zmtkbml3YnZ5b2F5cGp2dWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzNzQwMzUsImV4cCI6MjA2Mzk1MDAzNX0.iCCIOIt8durZJg2JtSCBhPuza7j3pFfF8mS_Xj1m7Ic";

const unionArenaCache = new Map();

export function loadUnionArenaDatabase(locale = "en") {
  const normalizedLocale = normalizeLocale(locale);
  if (unionArenaCache.has(normalizedLocale)) return unionArenaCache.get(normalizedLocale);

  try {
    const payload = JSON.parse(readFileSync(databasePath(normalizedLocale), "utf8"));
    const cards = Array.isArray(payload) ? payload : payload.cards || [];
    const normalized = cards.map((card) => normalizeUnionArenaCard(card, normalizedLocale)).filter((card) => card.number);
    unionArenaCache.set(normalizedLocale, normalized);
    return normalized;
  } catch {
    unionArenaCache.set(normalizedLocale, []);
    return unionArenaCache.get(normalizedLocale);
  }
}

export function clearUnionArenaDatabaseCache(locale = "") {
  if (locale) unionArenaCache.delete(normalizeLocale(locale));
  else unionArenaCache.clear();
}

export async function importExburstUnionArenaDeck(value) {
  const parsed = exburstDeckInfo(value);
  if (!parsed) return { ok: false, error: "Enter an ExBurst Union Arena deck URL." };

  const row = await fetchExburstDeckRow(parsed);
  const database = loadUnionArenaDatabase(parsed.locale);
  const byNumber = unionArenaLookup(database);
  const parsedCards = parseDeckContent(row.decklist_content || "");
  const parsedSideboard = parseDeckContent(row.sidedeck || "", "Sideboard");
  const allParsed = [...parsedCards, ...parsedSideboard];
  const resolvedCards = [];
  const missing = [];

  for (const item of allParsed) {
    const card = byNumber.get(normalizeCardNumber(item.number));
    if (!card) {
      missing.push(item);
      continue;
    }
    resolvedCards.push({ ...card, qty: item.qty, section: item.section || card.section || "Main" });
  }

  const totalCards = resolvedCards.reduce((sum, card) => sum + Number(card.qty || 0), 0);
  const game = parsed.locale === "jp" ? "Union Arena (JP)" : "Union Arena (EN)";
  return {
    ok: missing.length === 0,
    game,
    locale: parsed.locale,
    deckId: parsed.deckId,
    deckName: row.decklist_name || `ExBurst ${game} Deck ${parsed.deckId}`,
    sourceUrl: parsed.sourceUrl,
    cards: totalCards,
    totalCards,
    uniqueCards: resolvedCards.length,
    resolvedCards,
    missing,
    deckText: allParsed.map((item) => `${item.qty} x ${item.number}`).join("\n"),
    raw: {
      id: row.id,
      colors: row.colors || "",
      archetype: row.archetype || "",
      favoritecard: row.favoritecard || "",
      card_count: row.card_count,
      sideboard_count: row.sideboard_count,
    },
  };
}

export function normalizeUnionArenaCard(input, fallbackLocale = "en") {
  const card = input?.normalized || input || {};
  const locale = normalizeLocale(card.locale || fallbackLocale);
  const featureList = Array.isArray(card.featureList)
    ? card.featureList
    : Array.isArray(card.tagsList)
      ? card.tagsList
      : splitFeatures(card.features || card.tags || card.traits || "");
  const features = cleanDash(card.features || card.tags || card.traits || "");
  const trigger = cleanDash(card.trigger || card.triggerData || "");

  return {
    number: String(card.number || card.cardNo || ""),
    name: String(card.name || card.number || card.cardNo || ""),
    game: locale === "jp" ? "Union Arena (JP)" : "Union Arena (EN)",
    locale,
    section: String(card.cardType || card.categoryData || "Main"),
    cardType: String(card.cardType || card.categoryData || ""),
    color: String(card.color || ""),
    level: String(card.energyCost || card.cost || card.needEnergyData || ""),
    cost: String(card.energyCost || card.cost || card.needEnergyData || ""),
    energyCost: String(card.energyCost || card.cost || card.needEnergyData || ""),
    generatedEnergy: String(card.generatedEnergy || card.generatedEnergyData || ""),
    ap: String(card.ap || card.apData || ""),
    power: String(card.power || card.bp || card.bpData || ""),
    bp: String(card.bp || card.power || card.bpData || ""),
    trigger,
    rarity: String(card.rarity || ""),
    text: String(card.text || card.effectText || card.effectData || ""),
    effectText: String(card.effectText || card.text || ""),
    japaneseEffectText: String(card.japaneseEffectText || ""),
    effectHtml: String(card.effectHtml || ""),
    getInfoText: String(card.getInfoText || ""),
    cardSet: String(card.seriesName || ""),
    series: String(card.series || ""),
    seriesName: String(card.seriesName || ""),
    abbreviation: String(card.abbreviation || ""),
    originalId: String(card.originalId || ""),
    isAlternate: Boolean(card.isAlternate),
    features,
    featureList,
    tags: "",
    tagsList: [],
    imageUrl: highResolutionImageUrl(card.imageUrl || card.image || ""),
    rawImageUrl: highResolutionImageUrl(card.rawImageUrl || card.imageUrl || card.image || ""),
    renderedImagePageUrl: String(card.renderedImagePageUrl || card.detailUrl || ""),
    detailUrl: String(card.detailUrl || card.renderedImagePageUrl || ""),
    marketPrice: card.marketPrice ?? null,
    tcgPlayerLink: card.tcgPlayerLink ?? null,
    tcgPlayerName: card.tcgPlayerName ?? null,
    tcgPlayerProductId: card.tcgPlayerProductId ?? null,
  };
}

export function exburstDeckInfo(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!/exburst\.dev$/i.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "ua") return null;
  const isEn = parts[1] === "en";
  const deckIndex = isEn ? 2 : 1;
  if (parts[deckIndex] !== "deck" && parts[deckIndex] !== "deckbuilder") return null;
  const deckId = Number(parts[deckIndex + 1]);
  if (!Number.isFinite(deckId) || deckId <= 0) return null;
  return {
    deckId,
    locale: isEn ? "en" : "jp",
    table: isEn ? "uaen_decklists" : "decklists",
    sourceUrl: `https://exburst.dev/${isEn ? "ua/en" : "ua"}/deck/${deckId}`,
  };
}

async function fetchExburstDeckRow(parsed) {
  const url = new URL(`${EXBURST_API_URL}/${parsed.table}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("id", `eq.${parsed.deckId}`);
  const response = await fetch(url, { headers: exburstHeaders() });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ExBurst deck lookup failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("ExBurst deck not found.");
  return row;
}

function exburstHeaders() {
  const key = process.env.EXBURST_SUPABASE_KEY || EXBURST_SUPABASE_ANON_KEY;
  return {
    accept: "application/json",
    apikey: key,
    authorization: `Bearer ${key}`,
    "accept-profile": "public",
  };
}

function parseDeckContent(value, section = "Main") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
      if (!match) return null;
      return {
        qty: Number(match[1]) || 1,
        number: match[2].trim(),
        section,
      };
    })
    .filter(Boolean);
}

function unionArenaLookup(cards) {
  const lookup = new Map();
  for (const card of cards) {
    for (const key of [
      card.number,
      card.originalId,
      card.originalId?.replace("/", "-"),
      card.originalId?.replace("-", "/"),
    ]) {
      const normalized = normalizeCardNumber(key);
      if (normalized && !lookup.has(normalized)) lookup.set(normalized, card);
    }
  }
  return lookup;
}

function normalizeCardNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll("/", "-")
    .replace(/^UA\d{2}BT-/, "")
    .replace(/^UE\d{2}BT-/, "")
    .replace(/^UEX\d{2}BT-/, "")
    .replace(/^UEPR-/, "UEPR-");
}

function databasePath(locale) {
  return locale === "jp" ? UNION_ARENA_JP_DB_PATH : UNION_ARENA_DB_PATH;
}

function normalizeLocale(value) {
  const locale = String(value || "").trim().toLowerCase();
  return locale === "jp" || locale === "ja" ? "jp" : "en";
}

function splitFeatures(value) {
  return String(value || "")
    .split(/[\uFF0F/|]/)
    .map((feature) => feature.trim())
    .filter((feature) => feature && feature !== "-");
}

function highResolutionImageUrl(value) {
  return String(value || "").replace("/cards/sd/", "/cards/hd/");
}

function cleanDash(value) {
  const text = String(value || "").trim();
  return text === "-" ? "" : text;
}
