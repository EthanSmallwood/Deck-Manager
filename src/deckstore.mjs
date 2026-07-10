import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DATA_PATH = resolve("data/decks.json");

export function loadDecks() {
  ensureDataFile();
  const decks = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  return Array.isArray(decks) ? decks.map(normalizeDeck) : [];
}

export function saveDecks(decks) {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, `${JSON.stringify(decks.map(normalizeDeck), null, 2)}\n`);
}

export function upsertDeck(input) {
  const decks = loadDecks();
  const now = new Date().toISOString();
  const id = String(input.id || randomUUID());
  const existing = decks.find((deck) => deck.id === id);
  const next = normalizeDeck({
    ...(existing || {}),
    ...input,
    id,
    updatedAt: now,
    createdAt: existing?.createdAt || input.createdAt || now,
  });

  if (existing) {
    decks.splice(decks.indexOf(existing), 1, next);
  } else {
    decks.push(next);
  }

  saveDecks(decks);
  return next;
}

export function deleteDeck(id) {
  const decks = loadDecks();
  const next = decks.filter((deck) => deck.id !== id);
  saveDecks(next);
  return next.length !== decks.length;
}

function ensureDataFile() {
  if (existsSync(DATA_PATH)) return;
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, "[]\n");
}

function normalizeDeck(deck) {
  return {
    id: String(deck.id || randomUUID()),
    name: String(deck.name || "Untitled Deck"),
    game: normalizeGame(deck.game, deck.weissLocale || deck.locale),
    weissLocale: String(deck.weissLocale || deck.locale || "").toLowerCase() === "jp" ? "jp" : "en",
    source: String(deck.source || ""),
    sourceUrl: String(deck.sourceUrl || ""),
    status: String(deck.status || "Testing"),
    tags: String(deck.tags || ""),
    notes: String(deck.notes || ""),
    imageUrl: String(deck.imageUrl || preferredImage(deck.cards)),
    cards: Array.isArray(deck.cards) ? deck.cards.map(normalizeCard) : [],
    createdAt: String(deck.createdAt || new Date().toISOString()),
    updatedAt: String(deck.updatedAt || new Date().toISOString()),
  };
}

function normalizeCard(card) {
  return {
    qty: Number(card.qty || card.num || 1),
    id: String(card.id || ""),
    variantId: String(card.variantId || ""),
    cardId: String(card.cardId || ""),
    number: String(card.number || card.cardNumber || ""),
    name: String(card.name || ""),
    game: normalizeGame(card.game, card.locale),
    locale: String(card.locale || ""),
    section: String(card.section || card.category || ""),
    cardType: String(card.cardType || ""),
    color: String(card.color || ""),
    level: String(card.level || ""),
    bloomLevel: String(card.bloomLevel || ""),
    cost: String(card.cost || ""),
    energy: String(card.energy || ""),
    energyCost: String(card.energyCost || ""),
    generatedEnergy: String(card.generatedEnergy || ""),
    ap: String(card.ap || ""),
    power: String(card.power || ""),
    bp: String(card.bp || ""),
    might: String(card.might || ""),
    mightBonus: String(card.mightBonus || ""),
    maxCopies: String(card.maxCopies || ""),
    hp: String(card.hp || ""),
    life: String(card.life || ""),
    batonPass: String(card.batonPass || ""),
    soul: String(card.soul || ""),
    trigger: String(card.trigger || ""),
    rarity: String(card.rarity || card.rare || ""),
    text: String(card.text || card.cardText || ""),
    cardSet: String(card.cardSet || ""),
    setCode: String(card.setCode || ""),
    set: String(card.set || ""),
    series: String(card.series || ""),
    seriesName: String(card.seriesName || ""),
    abbreviation: String(card.abbreviation || ""),
    originalId: String(card.originalId || ""),
    isAlternate: Boolean(card.isAlternate),
    features: String(card.features || ""),
    featureList: Array.isArray(card.featureList) ? card.featureList : [],
    supertype: String(card.supertype || ""),
    variantType: String(card.variantType || ""),
    variantLabel: String(card.variantLabel || ""),
    artist: String(card.artist || ""),
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    arts: Array.isArray(card.arts) ? card.arts : [],
    oshiSkills: Array.isArray(card.oshiSkills) ? card.oshiSkills : [],
    extra: card.extra && typeof card.extra === "object" ? card.extra : { label: "", text: "" },
    extraText: String(card.extraText || ""),
    isExtra: Boolean(card.isExtra),
    tags: String(card.tags || ""),
    tagsList: Array.isArray(card.tagsList) ? card.tagsList : [],
    imageUrl: String(card.imageUrl || ""),
    rawImageUrl: String(card.rawImageUrl || ""),
    renderedImagePageUrl: String(card.renderedImagePageUrl || ""),
    proxyImageUrl: String(card.proxyImageUrl || ""),
    proxyOutputPath: String(card.proxyOutputPath || ""),
    detailUrl: String(card.detailUrl || ""),
    translationUrl: String(card.translationUrl || ""),
  };
}

function normalizeGame(value, locale = "") {
  const game = String(value || "").trim();
  const isJp = String(locale || "").toLowerCase() === "jp";
  if (game === "Weiss Schwarz" || game === "Weiss Schwarz (EN)") return isJp ? "Weiss Schwarz (JP)" : "Weiss Schwarz (EN)";
  if (game === "Weiss Schwarz JP" || game === "Weiss Schwarz (JP)") return "Weiss Schwarz (JP)";
  if (game === "Union Arena" || game === "Union Arena (EN)") return "Union Arena (EN)";
  if (game === "Union Arena JP" || game === "Union Arena (JP)") return "Union Arena (JP)";
  if (game === "Hololive OCG" || game === "Riftbound") return game;
  return "Weiss Schwarz (EN)";
}

function preferredImage(cards) {
  if (!Array.isArray(cards)) return "";
  return cards.find((card) => card?.imageUrl && !isClimax(card))?.imageUrl || cards.find((card) => card?.imageUrl)?.imageUrl || "";
}

function isClimax(card) {
  return String(card?.cardType || card?.section || "").toLowerCase().includes("climax");
}
