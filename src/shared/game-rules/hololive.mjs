import { normalizeDeckSection } from "../deck-sections.mjs";
import { applyRestrictionIssues } from "./restrictions.mjs";

export function validateHololiveDeck(cards, options = {}) {
  const oshiCards = sectionCards(cards, "Oshi");
  const mainCards = sectionCards(cards, "Main");
  const cheerCards = sectionCards(cards, "Cheer");
  const oshiTotal = totalQty(oshiCards);
  const mainTotal = totalQty(mainCards);
  const cheerTotal = totalQty(cheerCards);
  const issues = [];

  if (oshiTotal !== 1) issues.push("Hololive decks must include exactly 1 Oshi card.");
  if (mainTotal !== 50) issues.push("Hololive main deck must contain exactly 50 holomem/support cards.");
  if (cheerTotal !== 20) issues.push("Hololive cheer deck must contain exactly 20 cheer cards.");

  for (const [number, group] of groupedCards(mainCards, normalizedCardNumber)) {
    const qty = group.reduce((sum, card) => sum + Number(card.qty || 0), 0);
    if (group.some(hasUnlimitedHolomemExtra)) continue;
    if (qty > 4) issues.push(`${number} has ${qty} copies in the main deck. Maximum is 4 by card number.`);
  }

  for (const card of cards || []) {
    const section = normalizeDeckSection(card, "Hololive OCG");
    const type = String(card.cardType || card.section || "").toLowerCase();
    if (section === "Cheer" && !type.includes("cheer")) issues.push(`${card.number || card.name} is in the cheer deck but is not a cheer card.`);
    if (section === "Main" && (type.includes("cheer") || type.includes("oshi"))) issues.push(`${card.number || card.name} cannot be in the main deck.`);
  }

  applyRestrictionIssues(cards, options.restrictions, issues);

  return {
    counts: [
      { label: `Oshi ${oshiTotal}/1`, ok: oshiTotal === 1 },
      { label: `Main ${mainTotal}/50`, ok: mainTotal === 50 },
      { label: `Cheer ${cheerTotal}/20`, ok: cheerTotal === 20 },
    ],
    passText: "Hololive deck checks pass.",
    issues,
  };
}

function sectionCards(cards, section) {
  return (cards || []).filter((card) => normalizeDeckSection(card, "Hololive OCG") === section);
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
  return String(card.number || "").trim().toUpperCase();
}

function hasUnlimitedHolomemExtra(card) {
  const text = [
    card.extraText,
    card.extra?.text,
    card.text,
  ].map((value) => String(value || "")).join("\n").toLowerCase();
  return /include any number of this holomem/.test(text);
}
