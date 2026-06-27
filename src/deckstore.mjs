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
    section: String(card.section || card.category || ""),
    cardType: String(card.cardType || ""),
    color: String(card.color || ""),
    level: String(card.level || ""),
    cost: String(card.cost || ""),
    power: String(card.power || ""),
    soul: String(card.soul || ""),
    trigger: String(card.trigger || ""),
    rarity: String(card.rarity || card.rare || ""),
    text: String(card.text || card.cardText || ""),
    imageUrl: String(card.imageUrl || ""),
    detailUrl: String(card.detailUrl || ""),
  };
}

function preferredImage(cards) {
  if (!Array.isArray(cards)) return "";
  return cards.find((card) => card?.imageUrl && !isClimax(card))?.imageUrl || cards.find((card) => card?.imageUrl)?.imageUrl || "";
}

function isClimax(card) {
  return String(card?.cardType || card?.section || "").toLowerCase().includes("climax");
}

