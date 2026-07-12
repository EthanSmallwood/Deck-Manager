import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDecklogPayload } from "./decklog.mjs";

const CARDS_PATH = resolve("data/cards/hololive-cards.json");
const JP_CARDS_PATH = resolve("data/cards/hololive-jp-cards.json");
const CARD_IMAGE_BASE = "https://en.hololive-official-cardgame.com/wp-content/images/cardlist/";

let cachedDatabase;
let cachedJpDatabase;

export function loadHololiveDatabase(locale = "en") {
  const isJp = String(locale || "").toLowerCase() === "jp";
  if (isJp) {
    if (!cachedJpDatabase) cachedJpDatabase = buildDatabase(readCardsFile(JP_CARDS_PATH));
    return cachedJpDatabase;
  }

  if (!cachedDatabase) cachedDatabase = buildDatabase(readCardsFile(CARDS_PATH));
  return cachedDatabase;
}

export function clearHololiveDatabaseCache(locale = "") {
  if (!locale || String(locale).toLowerCase() === "en") cachedDatabase = null;
  if (!locale || String(locale).toLowerCase() === "jp") cachedJpDatabase = null;
}

export async function importHololiveDecklogDeck(value) {
  let decklog;
  try {
    decklog = await fetchDecklogPayload(value);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  return importHololiveDecklogPayload(decklog.deckId, decklog.payload);
}

export function importHololiveDecklogPayload(deckId, payload) {
  if (Number(payload.game_title_id) !== 8) {
    return { ok: false, error: "That Decklog URL does not look like a Hololive OCG deck." };
  }

  const cards = [
    ...readDecklogCards(payload.p_list, "Oshi"),
    ...readDecklogCards(payload.list, "Main"),
    ...readDecklogCards(payload.sub_list, "Cheer"),
  ];

  return {
    ok: true,
    deckId,
    deckName: String(payload.title || `Hololive ${deckId}`).trim(),
    sourceUrl: `https://decklog-en.bushiroad.com/view/${deckId}`,
    cards: cards.reduce((sum, card) => sum + card.qty, 0),
    uniqueCards: cards.length,
    deckText: cards.map((card) => `${card.number}\t${card.qty}\t${card.name}`).join("\n"),
    resolvedCards: cards,
  };
}

function readDecklogCards(rows, section) {
  const db = loadHololiveDatabase();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const number = String(row.card_number || "").trim();
    const imagePath = cleanImagePath(row.img);
    const official = db.byOfficialId.get(String(row.id || "")) ||
      db.byImagePath.get(imagePath) ||
      db.byNumber.get(number)?.find((card) => sameName(card.name, row.name)) ||
      db.byNumber.get(number)?.[0];

    return {
      qty: Number(row.num || 1),
      number,
      name: String(row.name || official?.name || ""),
      game: "Hololive OCG (EN)",
      section,
      cardType: String(official?.cardType || row.card_kind || ""),
      rarity: String(official?.rarity || row.rare || ""),
      color: String(official?.color || ""),
      life: String(official?.life || ""),
      bloomLevel: String(official?.bloomLevel || row.bloom_level || ""),
      hp: String(official?.hp || ""),
      batonPass: String(official?.batonPass || ""),
      cardSet: String(official?.cardSet || ""),
      text: String(official?.abilityText || ""),
      keywords: Array.isArray(official?.keywords) ? official.keywords : [],
      arts: Array.isArray(official?.arts) ? official.arts : [],
      oshiSkills: Array.isArray(official?.oshiSkills) ? official.oshiSkills : [],
      extra: official?.extra || { label: "", text: "" },
      extraText: String(official?.extraText || ""),
      isExtra: Boolean(official?.isExtra),
      tags: String(official?.tags || ""),
      tagsList: Array.isArray(official?.tagsList) ? official.tagsList : [],
      imageUrl: String(official?.imageUrl || (imagePath ? CARD_IMAGE_BASE + imagePath : "")),
      detailUrl: String(official?.detailUrl || ""),
      decklogId: String(row.id || ""),
      imagePath,
    };
  });
}

function readCardsFile(path) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildDatabase(cards) {
  const byOfficialId = new Map();
  const byImagePath = new Map();
  const byNumber = new Map();

  for (const card of cards) {
    if (card.officialId) byOfficialId.set(String(card.officialId), card);
    if (card.imagePath) byImagePath.set(cleanImagePath(card.imagePath), card);
    if (card.number) {
      if (!byNumber.has(card.number)) byNumber.set(card.number, []);
      byNumber.get(card.number).push(card);
    }
  }

  return { cards, byOfficialId, byImagePath, byNumber };
}

function cleanImagePath(value) {
  return String(value || "").replace("\\/", "/").trim();
}

function sameName(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}
