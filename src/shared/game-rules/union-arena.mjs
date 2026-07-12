import { normalizeDeckSection } from "../deck-sections.mjs";
import { applyRestrictionIssues } from "./restrictions.mjs";

const LIMITED_TRIGGERS = ["special", "color", "final"];

export function validateUnionArenaDeck(cards, game = "Union Arena (EN)", options = {}) {
  const sections = sectionCounts(cards, game);
  const mainCards = sectionCards(cards, game, "Main");
  const actionPointCards = sectionCards(cards, game, "Action Points");
  const issues = [];
  const mainTotal = totalQty(mainCards);
  const actionPointTotal = totalQty(actionPointCards);
  const sourceCodes = [...new Set(mainCards.map(sourceMaterialCode).filter(Boolean))];

  if (mainTotal !== 50) issues.push("Union Arena main deck must contain exactly 50 cards.");
  if (actionPointTotal !== 3) issues.push("Union Arena decks must include exactly 3 AP cards.");
  if (sourceCodes.length > 1) issues.push(`Main deck cards must share one source material code. Found: ${sourceCodes.join(", ")}.`);

  for (const [number, group] of groupedCards(mainCards, normalizedCardNumber)) {
    const qty = group.reduce((sum, card) => sum + Number(card.qty || 0), 0);
    const maxCopies = Math.max(...group.map(maxCopiesForCard));
    if (qty > maxCopies) issues.push(`${number} has ${qty} copies. Maximum is ${maxCopies} by card number.`);
  }

  for (const trigger of LIMITED_TRIGGERS) {
    const qty = mainCards
      .filter((card) => normalizedTrigger(card).includes(trigger))
      .reduce((sum, card) => sum + Number(card.qty || 0), 0);
    if (qty > 4) issues.push(`${titleCase(trigger)} trigger cards total ${qty}. Maximum is 4 for that trigger type.`);
  }

  for (const card of cards || []) {
    const section = normalizeDeckSection(card, game);
    const type = String(card.cardType || card.section || "").toLowerCase();
    if (section === "Action Points" && !isActionPointCard(card)) issues.push(`${card.number || card.name} is in Action Points but is not an AP card.`);
    if (section === "Main" && (type === "ap" || type.includes("action point"))) issues.push(`${card.number || card.name} is an AP card and should be in Action Points.`);
  }

  applyRestrictionIssues(cards, options.restrictions, issues);

  return {
    counts: [
      { label: `Main ${mainTotal}/50`, ok: mainTotal === 50 },
      { label: `AP ${actionPointTotal}/3`, ok: actionPointTotal === 3 },
      { label: `Source ${sourceCodes[0] || "-"}`, ok: sourceCodes.length <= 1 },
    ],
    passText: "Union Arena deck checks pass.",
    issues,
    sections,
  };
}

function sectionCounts(cards, game) {
  const counts = {};
  for (const card of cards || []) {
    const section = normalizeDeckSection(card, game);
    counts[section] = (counts[section] || 0) + Number(card.qty || 0);
  }
  return counts;
}

function sectionCards(cards, game, section) {
  return (cards || []).filter((card) => normalizeDeckSection(card, game) === section);
}

function totalQty(cards) {
  return cards.reduce((sum, card) => sum + Number(card.qty || 0), 0);
}

function groupedQty(cards, keyFn) {
  const grouped = new Map();
  for (const card of cards || []) {
    const key = keyFn(card);
    if (!key) continue;
    grouped.set(key, (grouped.get(key) || 0) + Number(card.qty || 0));
  }
  return grouped;
}

function groupedCards(cards, keyFn) {
  const grouped = new Map();
  for (const card of cards || []) {
    const key = keyFn(card);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(card);
  }
  return grouped;
}

function normalizedCardNumber(card) {
  return String(card.number || card.originalId || "").trim().toUpperCase();
}

function sourceMaterialCode(card) {
  const number = normalizedCardNumber(card).replaceAll("/", "-");
  return number.match(/^[A-Z]{2,3}\d{2}BT-([A-Z0-9]{3})-/i)?.[1]
    || number.match(/^(?:PC\d{2}BT-)?([A-Z0-9]{3})-\d/i)?.[1]
    || "";
}

function normalizedTrigger(card) {
  return String(card.trigger || "").toLowerCase();
}

function maxCopiesForCard(card) {
  const text = [
    card.text,
    card.effectText,
    card.effectHtml,
    card.japaneseEffectText,
  ].map((value) => String(value || "")).join("\n");
  const english = text.match(/(?:deck can contain|include)\s+up to\s+(\d+)\s+copies/i);
  if (english) return Number(english[1]) || 4;
  const japanese = text.match(/デッキに\s*(\d+)\s*枚まで入れられる/);
  if (japanese) return Number(japanese[1]) || 4;
  return 4;
}

function isActionPointCard(card) {
  const number = String(card.number || card.originalId || "").toUpperCase();
  const type = String(card.cardType || card.section || "").toLowerCase();
  return number.startsWith("UAPR-") || type === "ap" || type.includes("action point");
}

function titleCase(value) {
  return String(value || "").replace(/^\w/, (letter) => letter.toUpperCase());
}
