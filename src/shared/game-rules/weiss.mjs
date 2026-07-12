import { applyRestrictionIssues, normalizeRestrictions } from "./restrictions.mjs";

export function validateWeissDeck(cards, options = {}) {
  const deckCards = Array.isArray(cards) ? cards : [];
  const selectedSeries = options.selectedSeries || null;
  const restrictions = normalizeRestrictions(options.restrictions);
  const total = deckCards.reduce((sum, card) => sum + qty(card), 0);
  const climax = deckCards.filter(isClimax).reduce((sum, card) => sum + qty(card), 0);
  const titles = [...new Set(deckCards.map((card) => titleCode(card.number)).filter(Boolean))];
  const allowedCodes = new Set((selectedSeries?.codes || []).map((code) => String(code || "").toUpperCase()));
  const outsideSeries = allowedCodes.size ? titles.filter((code) => !allowedCodes.has(code)) : [];
  const issues = [];

  if (total !== 50) issues.push("Deck must contain exactly 50 cards.");
  if (climax > 8) issues.push("Deck may contain at most 8 climax cards.");
  if (outsideSeries.length) issues.push(`These cards are outside ${selectedSeries.name}: ${outsideSeries.join(", ")}.`);
  if (!allowedCodes.size && titles.length > 1) issues.push("Neo-Standard decks may only include cards from one title.");

  const nameGroups = new Map();
  for (const card of deckCards) {
    const nameKey = normalizeName(card.name || card.englishName || card.title || card.number);
    if (!nameKey) continue;
    const group = nameGroups.get(nameKey) || { name: displayName(card), qty: 0, limit: 4 };
    group.qty += qty(card);
    group.limit = Math.max(group.limit, weissCopyLimit(card));
    nameGroups.set(nameKey, group);
  }
  for (const group of nameGroups.values()) {
    if (group.qty > group.limit) {
      const limitText = group.limit === Infinity ? "any number" : group.limit;
      issues.push(`${group.name} has ${group.qty} copies. Maximum is ${limitText}.`);
    }
  }

  applyRestrictionIssues(deckCards, restrictions, issues);

  return {
    total,
    climax,
    title: selectedSeries ? `${selectedSeries.name} (${(selectedSeries.codes || []).join(", ")})` : titles[0] || "",
    titleOk: allowedCodes.size ? outsideSeries.length === 0 : titles.length <= 1,
    counts: [
      { label: `Total ${total}/50`, ok: total === 50 },
      { label: `Climax ${climax}/8`, ok: climax <= 8 },
      { label: `Series ${selectedSeries ? `${selectedSeries.name} (${(selectedSeries.codes || []).join(", ")})` : titles[0] || "-"}`, ok: allowedCodes.size ? outsideSeries.length === 0 : titles.length <= 1 },
      { label: `Restrictions ${restrictions.lastUpdated || "not dated"}`, ok: true },
    ],
    passText: "Weiss deck checks pass.",
    issues,
  };
}

function weissCopyLimit(card) {
  const text = cardText(card);
  if (/\bany number\b/i.test(text) && /\bdeck\b/i.test(text)) return Infinity;
  const match = text.match(/deck can contain up to\s+(\d+)\s+copies/i)
    || text.match(/up to\s+(\d+)\s+copies of this card/i);
  return match ? Number(match[1]) : 4;
}

function cardText(card) {
  return [
    card.text,
    card.effect,
    card.effects,
    card.ability,
    card.abilities,
    card.cardText,
    card.flavor,
  ].flat().filter(Boolean).join(" ");
}

function isClimax(card) {
  const typeText = [
    card.type,
    card.cardType,
    card.card_kind,
    card.cardKind,
    card.kind,
    card.section,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return typeText.includes("climax") || typeText.includes("cx") || typeText.includes("\u30af\u30e9\u30a4\u30de\u30c3\u30af\u30b9");
}

function titleCode(number) {
  return String(number || "").split("/")[0].toUpperCase();
}

function qty(card) {
  return Math.max(0, Number(card?.qty || 0));
}

function displayName(card) {
  return card.name || card.englishName || card.title || card.number || "Unnamed card";
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[\u201c\u201d]/g, "\"").replace(/\s+/g, " ").trim();
}
