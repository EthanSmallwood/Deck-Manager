import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DATA_PATH = resolve("data/collection.json");

export function loadCollection() {
  ensureDataFile();
  const collection = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  return normalizeCollection(collection);
}

export function saveCollection(input) {
  const next = normalizeCollection(input);
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function setOwnedQuantities(entries) {
  const collection = loadCollection();
  for (const [number, qty] of Object.entries(entries || {})) {
    const key = String(number || "").trim();
    const count = Math.max(0, Number(qty || 0));
    if (!key) continue;
    if (count > 0) collection.cards[key] = count;
    else delete collection.cards[key];
  }
  return saveCollection(collection);
}

export function setOwnedQuantity(number, qty) {
  const collection = loadCollection();
  const key = String(number || "").trim();
  const count = Math.max(0, Number(qty || 0));
  if (!key) return collection;
  if (count > 0) collection.cards[key] = count;
  else delete collection.cards[key];
  return saveCollection(collection);
}

function ensureDataFile() {
  if (existsSync(DATA_PATH)) return;
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, `${JSON.stringify({ cards: {} }, null, 2)}\n`);
}

function normalizeCollection(collection) {
  const cards = {};
  for (const [number, qty] of Object.entries(collection?.cards || {})) {
    const key = String(number || "").trim();
    const count = Math.max(0, Number(qty || 0));
    if (key && count > 0) cards[key] = count;
  }
  return { cards };
}
