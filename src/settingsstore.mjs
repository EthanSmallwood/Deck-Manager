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
  };
}

