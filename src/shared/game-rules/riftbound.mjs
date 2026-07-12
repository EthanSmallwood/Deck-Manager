import { normalizeDeckSection } from "../deck-sections.mjs";
import { applyRestrictionIssues } from "./restrictions.mjs";

const DOMAIN_TAGS = new Set(["body", "calm", "chaos", "fury", "mind", "order"]);

export function validateRiftboundDeck(cards, options = {}) {
  const sections = sectionCounts(cards);
  const legendCards = sectionCards(cards, "Legend");
  const championCards = sectionCards(cards, "Champion");
  const mainCards = sectionCards(cards, "Deck");
  const runeCards = sectionCards(cards, "Runes");
  const battlefieldCards = sectionCards(cards, "Battlefields");
  const sideboardCards = sectionCards(cards, "Sideboard");
  const issues = [];

  const legendTotal = totalQty(legendCards);
  const championTotal = totalQty(championCards);
  const mainTotal = totalQty(mainCards);
  const mainConstructionTotal = mainTotal + championTotal;
  const runeTotal = totalQty(runeCards);
  const battlefieldTotal = totalQty(battlefieldCards);
  const sideboardTotal = totalQty(sideboardCards);
  const legend = legendCards[0];
  const chosenChampion = championCards[0];
  const identity = domainIdentity(legend);
  const legendTag = championTag(legend);

  if (legendTotal !== 1) issues.push("Riftbound decks must have exactly 1 Champion Legend.");
  if (championTotal !== 1) issues.push("Riftbound decks must have exactly 1 Chosen Champion unit.");
  if (chosenChampion && !isChampionUnit(chosenChampion)) issues.push(`${chosenChampion.name || chosenChampion.number} cannot be the Chosen Champion because it is not a champion unit.`);
  if (chosenChampion && legendTag && championTag(chosenChampion) && championTag(chosenChampion) !== legendTag) {
    issues.push(`Chosen Champion tag (${championTag(chosenChampion)}) must match the Champion Legend tag (${legendTag}).`);
  }
  if (mainConstructionTotal < 40) issues.push("Riftbound main deck plus Chosen Champion must contain at least 40 cards.");
  if (runeTotal !== 12) issues.push("Riftbound rune deck must contain exactly 12 rune cards.");
  if (battlefieldTotal < 1) issues.push("Riftbound decks should include at least 1 battlefield.");

  for (const [name, qty] of groupedQty([...mainCards, ...championCards], normalizedName)) {
    if (qty > 3) issues.push(`${name} has ${qty} copies across main deck and Chosen Champion. Maximum is 3 by card name.`);
  }

  const signatures = mainCards.filter(isSignatureCard);
  const signatureTotal = totalQty(signatures);
  if (signatureTotal > 3) issues.push(`Signature cards total ${signatureTotal}. Maximum is 3.`);
  if (legendTag) {
    const offTagSignatures = signatures.filter((card) => championTag(card) && championTag(card) !== legendTag);
    if (offTagSignatures.length) issues.push(`Signature cards must match Champion Legend tag ${legendTag}: ${offTagSignatures.map((card) => card.name || card.number).join(", ")}.`);
  }

  if (battlefieldTotal > 1) {
    for (const [name, qty] of groupedQty(battlefieldCards, normalizedName)) {
      if (qty > 1) issues.push(`${name} has ${qty} battlefield copies. Maximum is 1 when multiple battlefields are used.`);
    }
  }

  if (identity.size) {
    for (const card of [...mainCards, ...runeCards, ...battlefieldCards]) {
      const domains = cardDomains(card);
      if (domains.length && !domains.every((domain) => identity.has(domain))) {
        issues.push(`${card.name || card.number} has domain ${domains.join("/")} outside legend identity ${[...identity].join("/")}.`);
      }
    }
  }

  applyRestrictionIssues(cards, options.restrictions, issues);

  return {
    counts: [
      { label: `Legend ${legendTotal}/1`, ok: legendTotal === 1 },
      { label: `Champion ${championTotal}/1`, ok: championTotal === 1 },
      { label: `Main+Champion ${mainConstructionTotal}/40+`, ok: mainConstructionTotal >= 40 },
      { label: `Runes ${runeTotal}/12`, ok: runeTotal === 12 },
      { label: `Battlefields ${battlefieldTotal}`, ok: battlefieldTotal >= 1 },
      { label: `Sideboard ${sideboardTotal}`, ok: true },
    ],
    passText: "Riftbound deck checks pass.",
    issues,
    sections,
  };
}

function sectionCounts(cards) {
  const counts = {};
  for (const card of cards || []) {
    const section = normalizeDeckSection(card, "Riftbound");
    counts[section] = (counts[section] || 0) + Number(card.qty || 0);
  }
  return counts;
}

function sectionCards(cards, section) {
  return (cards || []).filter((card) => normalizeDeckSection(card, "Riftbound") === section);
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

function normalizedName(card) {
  return String(card.name || card.number || "").trim();
}

function isChampionUnit(card) {
  return String(card.cardType || "").toLowerCase() === "unit" && String(card.supertype || "").toLowerCase() === "champion";
}

function isSignatureCard(card) {
  return String(card.supertype || "").toLowerCase() === "signature" || Boolean(card.tts?.isSignature);
}

function domainIdentity(card) {
  return new Set(cardDomains(card));
}

function cardDomains(card) {
  if (!card) return [];
  const values = Array.isArray(card.colors) ? card.colors : String(card.color || card.tts?.color_identity || "").split(/[\/,]/);
  return values.map((value) => String(value || "").trim().toLowerCase()).filter((value) => DOMAIN_TAGS.has(value));
}

function championTag(card) {
  if (!card) return "";
  const candidates = [
    card.tts?.signature_key,
    ...(Array.isArray(card.tagsList) ? card.tagsList : []),
    ...String(card.tags || "").split(/\s*\/\s*|\s*,\s*/),
  ].map((tag) => String(tag || "").trim()).filter(Boolean);
  return candidates.find((tag) => !DOMAIN_TAGS.has(tag.toLowerCase())) || "";
}
