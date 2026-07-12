import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const SETTINGS_PATH = resolve("data/settings.json");

export function loadSettings() {
  ensureSettingsFile();
  return normalizeSettings(JSON.parse(readFileSync(SETTINGS_PATH, "utf8")));
}

export function saveSettings(input) {
  const settings = normalizeSettings(input);
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
}

export function defaultTtsJsonExportDir() {
  return join(
    process.env.USERPROFILE || homedir(),
    "Documents",
    "My Games",
    "Tabletop Simulator",
    "Saves",
    "Saved Objects",
    "Deckmanager Export"
  );
}

function ensureSettingsFile() {
  if (existsSync(SETTINGS_PATH)) return;
  saveSettings({});
}

function normalizeSettings(settings) {
  return {
    ttsJsonExportDir: String(settings?.ttsJsonExportDir || defaultTtsJsonExportDir()),
    cardGameRestrictions: normalizeCardGameRestrictions(settings?.cardGameRestrictions || settings?.weissRestrictions),
  };
}

function normalizeCardGameRestrictions(restrictions) {
  return {
    lastUpdated: String(restrictions?.lastUpdated || "").trim(),
    lastUpdatedByGame: normalizeLastUpdatedByGame(restrictions),
    entries: Array.isArray(restrictions?.entries)
      ? restrictions.entries.map(normalizeCardGameRestrictionEntry).filter(Boolean)
      : [],
  };
}

function normalizeLastUpdatedByGame(restrictions) {
  const input = restrictions?.lastUpdatedByGame && typeof restrictions.lastUpdatedByGame === "object"
    ? restrictions.lastUpdatedByGame
    : {};
  const output = {};
  for (const [game, date] of Object.entries(input)) {
    const key = normalizeGameKey(game);
    if (key) output[key] = String(date || "").trim();
  }
  const fallback = String(restrictions?.lastUpdated || "").trim();
  if (fallback && !output["weiss schwarz (en)"]) output["weiss schwarz (en)"] = fallback;
  return output;
}

function normalizeGameKey(value) {
  const game = String(value || "").trim().toLowerCase();
  if (!game) return "";
  if (game === "weiss schwarz" || game === "weiss" || game === "ws" || game === "weiss schwarz (en)") return "weiss schwarz (en)";
  if (game === "weiss schwarz jp" || game === "weiss jp" || game === "ws jp" || game === "weiss schwarz (jp)") return "weiss schwarz (jp)";
  if (game === "hololive" || game === "hololive ocg" || game === "hololive ocg (en)" || game === "hocg" || game === "hocg en") return "hololive ocg";
  if (game === "hololive jp" || game === "hololive ocg jp" || game === "hololive ocg (jp)" || game === "hocg jp") return "hololive ocg (jp)";
  if (game === "union arena" || game === "ua" || game === "union arena en" || game === "ua en" || game === "union arena (en)") return "union arena (en)";
  if (game === "union arena jp" || game === "ua jp" || game === "union arena (jp)") return "union arena (jp)";
  if (game === "riftbound") return "riftbound";
  return game;
}

function normalizeCardGameRestrictionEntry(entry) {
  if (!entry) return null;
  const game = String(entry.game || "Weiss Schwarz").trim();
  const kind = String(entry.kind || entry.status || "").trim().toLowerCase();
  const name = String(entry.name || "").trim();
  const group = String(entry.group || "").trim();
  const numbers = Array.isArray(entry.numbers)
    ? entry.numbers.map((number) => String(number || "").trim()).filter(Boolean)
    : String(entry.numbers || entry.number || "").split(",").map((number) => number.trim()).filter(Boolean);
  const limitValue = String(entry.limit ?? "").trim();
  const limit = limitValue && Number.isFinite(Number(limitValue)) ? Number(limitValue) : inferredLimit(kind);
  if (!kind || (!name && !numbers.length)) return null;
  return { game, kind, limit, group, name, numbers };
}

function inferredLimit(kind) {
  if (kind === "banned") return 0;
  if (kind === "choice") return 1;
  return 4;
}
