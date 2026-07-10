import fs from "node:fs";
import path from "node:path";

const DEFAULT_API_URL = "https://piltoverarchive.com/api/external/v1/cards";
const DEFAULT_OUTPUT = "data/cards/riftbound-cards.json";

const args = process.argv.slice(2);

function readArg(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function hasArg(name) {
  return args.includes(name);
}

const apiUrl = readArg("--api-url", DEFAULT_API_URL);
const outputPath = readArg("--output", DEFAULT_OUTPUT);
const pageLimit = Math.min(Number(readArg("--limit", "100")) || 100, 100);
const delayMs = Number(readArg("--delayMs", "100")) || 0;

if (hasArg("--help")) {
  console.log(`Usage:
  node scripts/scrape-riftbound-piltover-cards.mjs [--output <file>]
  node scripts/scrape-riftbound-piltover-cards.mjs [--api-url <url>] [--limit 100] [--delayMs 100]

Fetches live Riftbound card printing data from Piltover Archive and writes JSON.
`);
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry == null) return false;
      if (Array.isArray(entry) && entry.length === 0) return false;
      return true;
    }),
  );
}

function normalizeVariant(item) {
  const card = item.card || {};
  const set = item.set || {};
  return compactObject({
    id: item.id ?? null,
    variantId: item.id ?? null,
    cardId: card.id ?? null,
    variantNumber: item.variantNumber ?? null,
    name: card.name ?? null,
    type: card.type ?? null,
    types: card.types ?? null,
    supertype: card.super ?? null,
    colors: card.colors?.map((color) => color.name).filter(Boolean) ?? [],
    colorIds: card.colors?.map((color) => color.id).filter(Boolean) ?? [],
    tags: card.tags ?? [],
    description: card.description ?? null,
    attachText: card.attachText ?? null,
    effect: card.effect ?? null,
    flavorText: item.flavorText ?? null,
    energy: card.energy ?? null,
    might: card.might ?? null,
    power: card.power ?? null,
    mightBonus: card.mightBonus ?? null,
    maxCopies: card.maxCopies ?? null,
    banEffectiveDate: card.banEffectiveDate ?? null,
    setId: set.id ?? null,
    set: set.name ?? null,
    setCode: set.prefix ?? null,
    setReleaseDate: set.releaseDate ?? null,
    rarity: item.rarity ?? null,
    variantType: item.variantType ?? null,
    variantTypes: item.variantTypes ?? [],
    variantLabel: item.variantLabel ?? null,
    foilMode: item.foilMode ?? null,
    artist: item.artist ?? null,
    releaseDate: item.releaseDate ?? null,
    imageUrl: item.imageUrl ?? null,
    showInLibrary: item.showInLibrary ?? null,
    isCollectible: item.isCollectible ?? null,
    parentVariantId: item.parentVariantId ?? null,
    cardmarketId: item.cardmarketId ?? null,
    tcgplayerId: item.tcgplayerId ?? null,
  });
}

function addCount(map, key) {
  const safeKey = key || "(none)";
  map[safeKey] = (map[safeKey] || 0) + 1;
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
  });

  if (response.status === 429 && attempt < 4) {
    await sleep(1000 * attempt);
    return fetchJson(url, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for ${url}\n${body.slice(0, 500)}`);
  }

  return response.json();
}

async function scrapeAllCards() {
  const cards = [];
  let page = 1;
  let pagination = null;
  let meta = null;

  for (;;) {
    const url = new URL(apiUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(pageLimit));

    const payload = await fetchJson(url);
    if (!Array.isArray(payload.data)) {
      throw new Error(`Unexpected Piltover response shape for ${url}`);
    }

    cards.push(...payload.data);
    pagination = payload.pagination || null;
    meta = payload.meta || meta;

    const total = pagination?.total ?? cards.length;
    console.log(`Fetched page ${page}: ${cards.length}/${total}`);

    if (!pagination?.hasNext) break;
    page += 1;
    if (delayMs > 0) await sleep(delayMs);
  }

  return { cards, pagination, meta };
}

const { cards: rawCards, pagination, meta } = await scrapeAllCards();
const cards = rawCards.map((card) => ({
  normalized: normalizeVariant(card),
  raw: card,
}));

const bySet = {};
const byType = {};
const byVariantType = {};
const byRarity = {};
for (const { normalized } of cards) {
  addCount(bySet, normalized.setCode || normalized.set);
  addCount(byType, normalized.type);
  addCount(byVariantType, normalized.variantType);
  addCount(byRarity, normalized.rarity);
}

const output = {
  source: {
    name: "Piltover Archive Riftbound cards API",
    url: apiUrl,
    mode: "live",
    extractedAt: new Date().toISOString(),
  },
  counts: {
    cards: cards.length,
    uniqueCardNames: new Set(cards.map((item) => item.normalized.name)).size,
    uniqueCardIds: new Set(cards.map((item) => item.normalized.cardId).filter(Boolean)).size,
    sets: Object.keys(bySet).length,
  },
  summaries: {
    bySet,
    byType,
    byVariantType,
    byRarity,
  },
  piltover: {
    pagination,
    meta,
  },
  cards,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Wrote ${cards.length} Piltover cards to ${outputPath}`);
