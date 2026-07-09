import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DATA_PATH = resolve("data/translation-cache.json");

export function loadTranslationCache() {
  ensureDataFile();
  return normalizeCache(JSON.parse(readFileSync(DATA_PATH, "utf8")));
}

export function getCachedTranslation(number) {
  const cache = loadTranslationCache();
  return cache.cards[translationKey(number)] || null;
}

export function setCachedTranslation(number, translation) {
  const key = translationKey(number);
  if (!key || !translation?.ok) return loadTranslationCache();

  const cache = loadTranslationCache();
  cache.cards[key] = normalizeTranslation({
    ...translation,
    number: key,
    cachedAt: new Date().toISOString(),
  });
  return saveTranslationCache(cache);
}

export function translationKey(number) {
  return String(number || "")
    .trim()
    .replace(/^WS_/i, "")
    .replace(/\/([A-Z][A-Z0-9]*)-E(\d)/i, "/$1-$2")
    .toUpperCase();
}

function saveTranslationCache(input) {
  const cache = normalizeCache(input);
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, `${JSON.stringify(cache, null, 2)}\n`);
  return cache;
}

function ensureDataFile() {
  if (existsSync(DATA_PATH)) return;
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, `${JSON.stringify({ cards: {} }, null, 2)}\n`);
}

function normalizeCache(cache) {
  const cards = {};
  for (const [number, translation] of Object.entries(cache?.cards || {})) {
    const key = translationKey(number);
    const next = normalizeTranslation(translation);
    if (key && next.ok) cards[key] = { ...next, number: key };
  }
  return { cards };
}

function normalizeTranslation(translation) {
  return {
    ok: Boolean(translation?.ok),
    source: String(translation?.source || ""),
    number: translationKey(translation?.number),
    url: String(translation?.url || ""),
    name: String(translation?.name || ""),
    traits: String(translation?.traits || ""),
    attributes: Array.isArray(translation?.attributes) ? translation.attributes.map(String).filter(Boolean) : [],
    text: String(translation?.text || ""),
    cardType: String(translation?.cardType || ""),
    color: String(translation?.color || ""),
    level: String(translation?.level || ""),
    cost: String(translation?.cost || ""),
    power: String(translation?.power || ""),
    soul: String(translation?.soul || ""),
    trigger: String(translation?.trigger || ""),
    rarity: String(translation?.rarity || ""),
    cachedAt: String(translation?.cachedAt || ""),
  };
}
