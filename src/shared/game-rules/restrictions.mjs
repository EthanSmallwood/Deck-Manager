export function normalizeRestrictions(restrictions) {
  return {
    lastUpdated: String(restrictions?.lastUpdated || "").trim(),
    lastUpdatedByGame: normalizeLastUpdatedByGame(restrictions?.lastUpdatedByGame),
    entries: Array.isArray(restrictions?.entries)
      ? restrictions.entries.map(normalizeRestrictionEntry).filter(Boolean)
      : [],
  };
}

export function filterRestrictionsForGame(restrictions, game) {
  const normalized = normalizeRestrictions(restrictions);
  const gameKey = normalizeGame(game);
  return {
    lastUpdated: normalized.lastUpdatedByGame[gameKey] || normalized.lastUpdated,
    lastUpdatedByGame: normalized.lastUpdatedByGame,
    entries: normalized.entries.filter((entry) => {
      const entryGame = normalizeGame(entry.game);
      return !entryGame || entryGame === gameKey;
    }),
  };
}

function normalizeLastUpdatedByGame(value) {
  const output = {};
  if (!value || typeof value !== "object") return output;
  for (const [game, date] of Object.entries(value)) {
    const gameKey = normalizeGame(game);
    if (gameKey) output[gameKey] = String(date || "").trim();
  }
  return output;
}

export function applyRestrictionIssues(cards, restrictions, issues) {
  const entries = normalizeRestrictions(restrictions).entries;
  const deckByRestriction = entries.map((entry) => ({ entry, qty: restrictedQty(cards, entry) }));
  for (const { entry, qty: count } of deckByRestriction) {
    if (entry.kind === "banned" || entry.kind === "restricted") {
      if (count > entry.limit) {
        issues.push(`${entry.name || entry.numbers.join(", ")} is restricted to ${entry.limit} copies. Deck has ${count}.`);
      }
    }
  }

  const choiceGroups = new Map();
  for (const { entry, qty: count } of deckByRestriction) {
    if (entry.kind !== "choice" || count <= 0) continue;
    const groupKey = normalizeText(entry.group) || "choice restriction";
    const group = choiceGroups.get(groupKey) || { label: entry.group || "Choice restriction", used: [] };
    group.used.push(entry.name || entry.numbers.join(", "));
    choiceGroups.set(groupKey, group);
  }
  for (const group of choiceGroups.values()) {
    if (group.used.length > 1) {
      issues.push(`${group.label} choice restriction allows only one listed card. Deck includes ${group.used.join("; ")}.`);
    }
  }

  const combinationGroups = new Map();
  for (const { entry, qty: count } of deckByRestriction) {
    if (entry.kind !== "combination") continue;
    const groupKey = normalizeText(entry.group) || "combination restriction";
    const group = combinationGroups.get(groupKey) || { label: entry.group || "Combination restriction", limit: entry.limit, qty: 0 };
    group.qty += count;
    group.limit = Math.min(group.limit, entry.limit);
    combinationGroups.set(groupKey, group);
  }
  for (const group of combinationGroups.values()) {
    if (group.qty > group.limit) {
      issues.push(`${group.label} allows ${group.limit} total copies in any combination. Deck has ${group.qty}.`);
    }
  }
}

export function normalizeGame(value) {
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

function normalizeRestrictionEntry(entry) {
  if (!entry) return null;
  const kind = String(entry.kind || entry.status || "").trim().toLowerCase();
  const game = String(entry.game || "").trim();
  const name = String(entry.name || "").trim();
  const group = String(entry.group || "").trim();
  const numbers = Array.isArray(entry.numbers)
    ? entry.numbers.map((number) => String(number || "").trim()).filter(Boolean)
    : String(entry.number || entry.numbers || "").split(",").map((number) => number.trim()).filter(Boolean);
  const limit = Number.isFinite(Number(entry.limit)) ? Number(entry.limit) : inferredLimit(kind);
  if (!kind || (!name && !numbers.length)) return null;
  return { game, kind, limit, group, name, numbers };
}

function restrictedQty(cards, entry) {
  const names = new Set([normalizeText(entry.name)].filter(Boolean));
  const numbers = new Set(entry.numbers.map(normalizeNumber).filter(Boolean));
  return (cards || []).reduce((sum, card) => {
    const cardName = normalizeText(card.name || card.englishName || card.title);
    const cardNumber = normalizeNumber(card.number || card.cardNo || card.originalId);
    if (numbers.size) {
      if (cardNumber && numbers.has(cardNumber)) return sum + qty(card);
      return sum;
    }
    if (cardName && names.has(cardName)) return sum + qty(card);
    return sum;
  }, 0);
}

function inferredLimit(kind) {
  if (kind === "banned") return 0;
  if (kind === "choice") return 1;
  return 4;
}

function qty(card) {
  return Math.max(0, Number(card?.qty || 0));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim();
}

function normalizeNumber(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}
