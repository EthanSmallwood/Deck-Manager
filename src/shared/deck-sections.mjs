export const DECK_SECTIONS = {
  weiss: ["Main", "Climax"],
  hololive: ["Oshi", "Main", "Cheer"],
  unionArena: ["Main", "Action Points"],
  riftbound: ["Legend", "Champion", "Deck", "Runes", "Battlefields", "Sideboard"],
};

export function normalizeDeckSection(card, game = card?.game || "") {
  const normalizedGame = normalizeGameName(game);
  if (isHololiveGame(normalizedGame)) return normalizeHololiveSection(card);
  if (normalizedGame === "Riftbound") return normalizeRiftboundSection(card);
  if (normalizedGame === "Union Arena (EN)" || normalizedGame === "Union Arena (JP)") return normalizeUnionArenaSection(card);
  if (isWeissClimax(card)) return "Climax";
  return "Main";
}

export function deckSectionOrder(card, game = card?.game || "") {
  const normalizedGame = normalizeGameName(game);
  const section = normalizeDeckSection(card, normalizedGame);
  const sections = isHololiveGame(normalizedGame)
    ? DECK_SECTIONS.hololive
    : normalizedGame === "Riftbound"
      ? DECK_SECTIONS.riftbound
      : normalizedGame === "Union Arena (EN)" || normalizedGame === "Union Arena (JP)"
        ? DECK_SECTIONS.unionArena
        : DECK_SECTIONS.weiss;
  const index = sections.indexOf(section);
  return index >= 0 ? index : sections.length;
}

export function sectionGroupsForGame(game) {
  const normalizedGame = normalizeGameName(game);
  if (isHololiveGame(normalizedGame)) return DECK_SECTIONS.hololive;
  if (normalizedGame === "Riftbound") return DECK_SECTIONS.riftbound;
  if (normalizedGame === "Union Arena (EN)" || normalizedGame === "Union Arena (JP)") return DECK_SECTIONS.unionArena;
  return DECK_SECTIONS.weiss;
}

export function normalizeGameName(value) {
  const game = String(value || "").trim();
  if (game === "Weiss Schwarz JP" || game === "Weiss Schwarz (JP)") return "Weiss Schwarz (JP)";
  if (game === "Weiss Schwarz" || game === "Weiss Schwarz (EN)") return "Weiss Schwarz (EN)";
  if (game === "Union Arena JP" || game === "Union Arena (JP)") return "Union Arena (JP)";
  if (game === "Union Arena" || game === "Union Arena (EN)") return "Union Arena (EN)";
  if (game === "Hololive JP" || game === "Hololive OCG JP" || game === "Hololive OCG (JP)") return "Hololive OCG (JP)";
  if (game === "Hololive" || game === "Hololive OCG" || game === "Hololive OCG EN" || game === "Hololive OCG (EN)") return "Hololive OCG (EN)";
  if (game === "Riftbound") return game;
  return "Weiss Schwarz (EN)";
}

function isHololiveGame(game) {
  return game === "Hololive OCG (EN)" || game === "Hololive OCG (JP)";
}

function normalizeHololiveSection(card) {
  const type = String(card?.cardType || card?.section || "").toLowerCase();
  if (type.includes("oshi")) return "Oshi";
  if (type.includes("cheer")) return "Cheer";
  return "Main";
}

function normalizeUnionArenaSection(card) {
  const type = String(card?.cardType || card?.section || "").toLowerCase();
  if (type === "ap" || type.includes("action point")) return "Action Points";
  return "Main";
}

function normalizeRiftboundSection(card) {
  const section = String(card?.section || "").toLowerCase();
  const type = String(card?.cardType || "").toLowerCase();
  const ttsType = String(card?.tts?.type || "").toLowerCase();
  if (card?.riftboundChampion || card?.isChosenChampion) return "Champion";
  if (section === "legend" || type === "legend" || ttsType === "legend") return "Legend";
  if (section === "champion" || type === "champion") return "Champion";
  if (section === "rune" || section === "runes" || type === "rune") return "Runes";
  if (section === "battlefield" || section === "battlefields" || type === "battlefield") return "Battlefields";
  if (section === "sideboard") return "Sideboard";
  return "Deck";
}

function isWeissClimax(card) {
  const typeText = [
    card?.type,
    card?.cardType,
    card?.card_kind,
    card?.cardKind,
    card?.kind,
    card?.section,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return typeText.includes("climax") || typeText.includes("cx") || typeText.includes("\u30af\u30e9\u30a4\u30de\u30c3\u30af\u30b9");
}
