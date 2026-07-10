import fs from "node:fs";
import path from "node:path";

const DEFAULT_URL = "https://playriftbound.com/en-us/card-gallery/";
const DEFAULT_HAR =
  "C:/Users/ethan/Downloads/playriftbound.com_Archive [26-07-08 19-05-13].har";
const DEFAULT_OUTPUT = "data/cards/riftbound-cards.json";

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasArg(name) {
  return args.includes(name);
}

const mode = hasArg("--har") ? "har" : "live";
const url = readArg("--url") || DEFAULT_URL;
const harPath = readArg("--har") || DEFAULT_HAR;
const outputPath = readArg("--output") || DEFAULT_OUTPUT;

if (hasArg("--help")) {
  console.log(`Usage:
  node scripts/extract-riftbound-cards-from-har.mjs [--output <file>]
  node scripts/extract-riftbound-cards-from-har.mjs --url <gallery-url> [--output <file>]
  node scripts/extract-riftbound-cards-from-har.mjs --har <file.har> [--output <file>]

Default mode fetches the live PlayRiftbound gallery page.
`);
  process.exit(0);
}

function decodeHarText(content) {
  if (!content?.text) return "";
  if (content.encoding === "base64") {
    return Buffer.from(content.text, "base64").toString("utf8");
  }
  return content.text;
}

function htmlDecodeScriptText(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readNextDataFromHtml(html, sourceUrl) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error("Could not find the __NEXT_DATA__ script in the card-gallery HTML.");
  }

  return {
    sourceUrl,
    nextData: JSON.parse(htmlDecodeScriptText(match[1])),
  };
}

function scalarField(field) {
  const value = field?.value;
  if (value == null) return null;
  if (typeof value === "object" && "label" in value) return value.label;
  return value;
}

function scalarFieldId(field) {
  const value = field?.value;
  if (value && typeof value === "object" && "id" in value) return value.id;
  return null;
}

function listField(field) {
  const values = field?.values || field?.type || field?.tags || field || [];
  if (!Array.isArray(values)) return [];
  return values.map((item) => item?.label ?? item?.id ?? item).filter(Boolean);
}

function listFieldIds(field) {
  const values = field?.values || field?.type || field || [];
  if (!Array.isArray(values)) return [];
  return values.map((item) => item?.id ?? null).filter(Boolean);
}

function findCardCollections(node, pathParts = [], collections = []) {
  if (!node || typeof node !== "object") return collections;
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      findCardCollections(item, [...pathParts, String(index)], collections),
    );
    return collections;
  }
  if (node.cards?.items && Array.isArray(node.cards.items)) {
    collections.push({
      path: pathParts.join("."),
      count: node.cards.items.length,
      cards: node.cards.items,
      metadata: {
        id: node.id ?? null,
        type: node.type ?? null,
        title: node.title ?? null,
        description: node.description ?? null,
      },
    });
  }
  for (const [key, value] of Object.entries(node)) {
    findCardCollections(value, [...pathParts, key], collections);
  }
  return collections;
}

function normalizeCard(card) {
  const textHtml = card.text?.richText?.body ?? "";
  const effectHtml = card.effect?.richText?.body ?? "";
  const normalized = {
    id: card.id ?? null,
    name: card.name ?? null,
    collectorNumber: card.collectorNumber ?? null,
    publicCode: card.publicCode ?? null,
    setId: scalarFieldId(card.set),
    set: scalarField(card.set),
    cardTypeIds: listFieldIds(card.cardType),
    cardTypes: listField(card.cardType),
    domainIds: listFieldIds(card.domain),
    domains: listField(card.domain),
    tagIds: listFieldIds(card.tags),
    tags: listField(card.tags),
    rarityId: scalarFieldId(card.rarity),
    rarity: scalarField(card.rarity),
    artistIds: listFieldIds(card.illustrator),
    artists: listField(card.illustrator),
    flagIds: listFieldIds(card.flags),
    flags: listField(card.flags),
    abilityHtml: textHtml || null,
    abilityText: stripHtml(textHtml) || null,
    effectHtml: effectHtml || null,
    effectText: stripHtml(effectHtml) || null,
    energy: scalarField(card.energy),
    power: scalarField(card.power),
    might: scalarField(card.might),
    mightBonus: scalarField(card.mightBonus),
    cost: scalarField(card.cost),
    orientation: card.orientation ?? null,
    imageUrl: card.cardImage?.url ?? null,
    imageAccessibilityText: card.cardImage?.accessibilityText ?? null,
    imageDimensions: card.cardImage?.dimensions ?? null,
    imageColors: card.cardImage?.colors ?? null,
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

function readNextDataFromHar(filePath) {
  const har = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const entries = har?.log?.entries || [];
  const galleryEntry = entries.find(
    (entry) =>
      /\/card-gallery\/?$/.test(entry.request?.url || "") &&
      /html/i.test(entry.response?.content?.mimeType || ""),
  );

  if (!galleryEntry) {
    throw new Error("Could not find a PlayRiftbound card-gallery HTML entry in the HAR.");
  }

  return readNextDataFromHtml(decodeHarText(galleryEntry.response.content), galleryEntry.request.url);
}

async function readNextDataFromLivePage(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${pageUrl}: HTTP ${response.status}`);
  }

  return readNextDataFromHtml(await response.text(), response.url || pageUrl);
}

const { sourceUrl, nextData } =
  mode === "har" ? readNextDataFromHar(harPath) : await readNextDataFromLivePage(url);
const page = nextData?.props?.pageProps?.page;
const collections = findCardCollections(page);
const rawCards = collections.flatMap((collection) => collection.cards);

const cards = rawCards.map((card) => ({
  normalized: normalizeCard(card),
  raw: card,
}));

const output = {
  source: {
    name: "PlayRiftbound card gallery",
    url: sourceUrl,
    mode,
    harPath: mode === "har" ? path.resolve(harPath) : null,
    extractedAt: new Date().toISOString(),
  },
  counts: {
    collections: collections.length,
    cards: cards.length,
  },
  collections: collections.map(({ path, count, metadata }) => ({
    path,
    count,
    metadata,
  })),
  cards,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Wrote ${cards.length} cards to ${outputPath}`);
