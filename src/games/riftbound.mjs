import { readFileSync } from "node:fs";

const RIFTBOUND_DB_PATH = "data/cards/riftbound-cards.json";

let riftboundCache = null;

export function loadRiftboundDatabase() {
  if (riftboundCache) return riftboundCache;

  try {
    const payload = JSON.parse(readFileSync(RIFTBOUND_DB_PATH, "utf8"));
    const cards = Array.isArray(payload) ? payload : payload.cards || [];
    riftboundCache = cards.map(normalizeRiftboundCard).filter((card) => card.number && card.name);
    return riftboundCache;
  } catch {
    riftboundCache = [];
    return riftboundCache;
  }
}

export function clearRiftboundDatabaseCache() {
  riftboundCache = null;
}

export function normalizeRiftboundCard(input) {
  const card = input?.normalized || input || {};
  const colors = arrayValues(card.colors);
  const tagsList = arrayValues(card.tags);
  const text = [
    card.description,
    card.attachText,
    card.effect,
    card.flavorText ? `Flavor: ${card.flavorText}` : "",
  ].map((line) => String(line || "").trim()).filter(Boolean).join("\n\n");

  return {
    id: String(card.id || ""),
    variantId: String(card.variantId || card.id || ""),
    cardId: String(card.cardId || ""),
    number: String(card.variantNumber || card.id || ""),
    name: String(card.name || ""),
    game: "Riftbound",
    section: String(card.type || "Main"),
    cardType: String(card.type || ""),
    supertype: String(card.supertype || ""),
    color: colors.join(" / "),
    colors,
    level: card.energy == null ? "" : String(card.energy),
    cost: card.energy == null ? "" : String(card.energy),
    energy: card.energy == null ? "" : String(card.energy),
    might: card.might == null ? "" : String(card.might),
    power: card.power == null ? "" : String(card.power),
    mightBonus: card.mightBonus == null ? "" : String(card.mightBonus),
    maxCopies: card.maxCopies == null ? "" : String(card.maxCopies),
    rarity: String(card.rarity || ""),
    text,
    cardSet: [card.setCode, card.set].filter(Boolean).join(" - "),
    setCode: String(card.setCode || ""),
    set: String(card.set || ""),
    variantType: String(card.variantType || ""),
    variantLabel: String(card.variantLabel || ""),
    artist: String(card.artist || ""),
    tags: tagsList.join(" / "),
    tagsList,
    imageUrl: String(card.imageUrl || ""),
    detailUrl: "",
    source: "Piltover Archive",
  };
}

export async function importPiltoverDeck(value) {
  const deckId = piltoverDeckId(value);
  if (!deckId) return { ok: false, error: "Enter a Piltover Archive deck URL or deck id." };

  let payload;
  try {
    const response = await fetch(`https://piltoverarchive.com/api/external/v1/decks/${encodeURIComponent(deckId)}`, {
      headers: {
        accept: "application/json",
        "user-agent": "Deckmanager/0.3",
      },
    });
    if (!response.ok) return { ok: false, error: `Piltover Archive returned HTTP ${response.status}.` };
    payload = await response.json();
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  const cards = mergeRiftboundDeckCards(resolvePiltoverDeckCards(payload));
  const missing = cards.filter((card) => card.missing);
  const resolvedCards = cards.filter((card) => !card.missing);

  return {
    ok: missing.length === 0,
    error: missing.length ? `${missing.length} Riftbound deck entr${missing.length === 1 ? "y" : "ies"} could not be matched in the local database.` : "",
    deckId,
    deckName: String(payload.name || `Riftbound ${deckId}`).trim(),
    sourceUrl: `https://piltoverarchive.com/decks/view/${deckId}`,
    detectedGame: "Riftbound",
    cards: resolvedCards.reduce((sum, card) => sum + Number(card.qty || 0), 0),
    uniqueCards: resolvedCards.length,
    deckText: resolvedCards.map((card) => `${card.number}\t${card.qty}\t${card.name}`).join("\n"),
    resolvedCards,
    missing,
  };
}

export function piltoverDeckId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.match(/piltoverarchive\.com\/decks\/view\/([0-9a-f-]{36})/i)?.[1]
    || text.match(/^[0-9a-f-]{36}$/i)?.[0]
    || "";
}

function resolvePiltoverDeckCards(payload) {
  const db = buildRiftboundIndexes();
  const cards = [];

  const legend = resolveLegend(payload.legend, db);
  if (legend) cards.push(legend);

  cards.push(
    ...readPiltoverEntries(payload.champions, "Champion", db),
    ...readPiltoverEntries(payload.battlefields, "Battlefields", db),
    ...readPiltoverEntries(payload.runes, "Runes", db),
    ...readPiltoverEntries(payload.maindeck, "Deck", db),
    ...readPiltoverEntries(payload.sideboard, "Sideboard", db),
    ...readPiltoverEntries(payload.bench, "Deck", db),
  );

  return cards;
}

function mergeRiftboundDeckCards(cards) {
  const merged = [];
  const byKey = new Map();

  for (const card of cards) {
    if (card.missing) {
      merged.push(card);
      continue;
    }
    const key = `${card.section || ""}:${card.variantId || card.number || card.cardId || card.name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty = Number(existing.qty || 0) + Number(card.qty || 0);
    } else {
      const copy = { ...card };
      byKey.set(key, copy);
      merged.push(copy);
    }
  }

  return merged;
}

function buildRiftboundIndexes() {
  const byVariantId = new Map();
  const byCardId = new Map();
  const byNumber = new Map();
  for (const card of loadRiftboundDatabase()) {
    if (card.variantId) byVariantId.set(card.variantId, card);
    if (card.cardId && !byCardId.has(card.cardId)) byCardId.set(card.cardId, card);
    if (card.number) byNumber.set(card.number, card);
  }
  return { byVariantId, byCardId, byNumber };
}

function resolveLegend(legend, db) {
  if (!legend) return null;
  const card = db.byNumber.get(String(legend.variantNumber || "")) || db.byCardId.get(String(legend.id || ""));
  if (!card) {
    return {
      qty: 1,
      number: String(legend.variantNumber || legend.id || ""),
      name: String(legend.name || "Unknown Riftbound legend"),
      game: "Riftbound",
      section: "Legend",
      cardType: "Legend",
      missing: true,
    };
  }
  return { ...card, qty: 1, section: "Legend" };
}

function readPiltoverEntries(entries, section, db) {
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const card = db.byVariantId.get(String(entry.variantId || "")) || db.byCardId.get(String(entry.cardId || ""));
    if (!card) {
      return {
        qty: Number(entry.quantity || 1),
        number: String(entry.variantId || entry.cardId || ""),
        name: "Unknown Riftbound card",
        game: "Riftbound",
        section,
        cardType: section,
        variantId: String(entry.variantId || ""),
        cardId: String(entry.cardId || ""),
        missing: true,
      };
    }
    return {
      ...card,
      qty: Number(entry.quantity || 1),
      section,
      variantId: String(entry.variantId || card.variantId || ""),
      cardId: String(entry.cardId || card.cardId || ""),
    };
  });
}

function arrayValues(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
