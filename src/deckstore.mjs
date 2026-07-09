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
    game: String(deck.game || "Weiss Schwarz"),
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
    number: String(card.number || card.cardNumber || ""),
    name: String(card.name || ""),
    game: String(card.game || "Weiss Schwarz"),
    locale: String(card.locale || ""),
    section: String(card.section || card.category || ""),
    cardType: String(card.cardType || ""),
    color: String(card.color || ""),
    level: String(card.level || ""),
    bloomLevel: String(card.bloomLevel || ""),
    cost: String(card.cost || ""),
    power: String(card.power || ""),
    hp: String(card.hp || ""),
    life: String(card.life || ""),
    batonPass: String(card.batonPass || ""),
    soul: String(card.soul || ""),
    trigger: String(card.trigger || ""),
    rarity: String(card.rarity || card.rare || ""),
    text: String(card.text || card.cardText || ""),
    cardSet: String(card.cardSet || ""),
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    arts: Array.isArray(card.arts) ? card.arts : [],
    oshiSkills: Array.isArray(card.oshiSkills) ? card.oshiSkills : [],
    extra: card.extra && typeof card.extra === "object" ? card.extra : { label: "", text: "" },
    extraText: String(card.extraText || ""),
    isExtra: Boolean(card.isExtra),
    tags: String(card.tags || ""),
    tagsList: Array.isArray(card.tagsList) ? card.tagsList : [],
    imageUrl: String(card.imageUrl || ""),
    proxyImageUrl: String(card.proxyImageUrl || ""),
    proxyOutputPath: String(card.proxyOutputPath || ""),
    detailUrl: String(card.detailUrl || ""),
    translationUrl: String(card.translationUrl || ""),
  };
}

function preferredImage(cards) {
  if (!Array.isArray(cards)) return "";
  return cards.find((card) => card?.imageUrl && !isClimax(card))?.imageUrl || cards.find((card) => card?.imageUrl)?.imageUrl || "";
}

function isClimax(card) {
  return String(card?.cardType || card?.section || "").toLowerCase().includes("climax");
}
