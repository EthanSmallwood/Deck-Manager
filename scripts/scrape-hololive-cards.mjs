#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_URL =
  "https://en.hololive-official-cardgame.com/cardlist/cardsearch/?keyword=&attribute%5B0%5D=all&expansion_name=&card_kind%5B0%5D=all&rare%5B0%5D=all&bloom_level%5B0%5D=all&parallel%5B0%5D=all&view=text&sort=new";
const DEFAULT_JP_URL =
  "https://hololive-official-cardgame.com/cardlist/cardsearch/?keyword=&attribute%5B%5D=all&expansion_name=&card_kind%5B%5D=all&rare%5B%5D=all&bloom_level%5B%5D=all&parallel%5B%5D=all&view=text&sort=new";
const DEFAULT_TRANSLATION_SHEET_ID = "1IdaueY-Jw8JXjYLOhA9hUd2w0VRBao9Z1URJwmCWJ64";
const DEFAULT_TRANSLATION_GIDS = ["543634835"];

const args = parseArgs(process.argv.slice(2));
const locale = String(args.locale || "en").toLowerCase() === "jp" ? "jp" : "en";
const isJp = locale === "jp";
const startUrl = args.url || (isJp ? DEFAULT_JP_URL : DEFAULT_URL);
const outputPath = args.output || (isJp ? "data/cards/hololive-jp-cards.json" : "data/cards/hololive-cards.json");
const delayMs = Number(args.delayMs || 250);
const maxPages = Number(args.maxPages || Infinity);
const flushEvery = Number(args.flushEvery || 5);
const concurrency = Number(args.concurrency || 6);
const translationSheetId = args.translationSheetId || DEFAULT_TRANSLATION_SHEET_ID;
const translationGids = String(args.translationGids || "")
  .split(",")
  .map((gid) => gid.trim())
  .filter(Boolean);
const translationSheets = String(args.translationSheets || "")
  .split("|")
  .map((sheet) => sheet.trim())
  .filter(Boolean);

const allCards = [];
const seenCards = new Set();

if (existsSync(outputPath) && !args.fresh) {
  const existing = JSON.parse(readFileSync(outputPath, "utf8"));
  for (const card of existing) addCard(card);
  console.log(`Loaded ${allCards.length} existing cards from ${outputPath}`);
}

let pageCount = 0;
let expectedTotal = 0;

const firstUrl = new URL(startUrl).toString();
pageCount += 1;

console.log(`Fetching page 1: ${firstUrl}`);
const firstHtml = await fetchTextWithRetry(firstUrl);
expectedTotal ||= expectedCount(firstHtml);
const firstCards = parseCards(firstHtml, firstUrl);
const firstAdded = addCards(firstCards);
console.log(`Parsed ${firstCards.length} cards, ${firstAdded} new, ${allCards.length} total`);

const dynamicPagination = dynamicPaginationFrom(firstHtml, firstUrl);

if (dynamicPagination) {
  const lastPage = Math.min(dynamicPagination.maxPage, maxPages);
  const pages = [];
  for (let page = 2; page <= lastPage; page += 1) pages.push(page);

  await runConcurrent(pages, Math.max(1, concurrency), async (page) => {
    const url = dynamicPagination.urlForPage(page);
    const html = await fetchTextWithRetry(url);
    const pageCards = parseCards(html, url);
    const added = addCards(pageCards);
    pageCount += 1;

    console.log(`Parsed page ${page}: ${pageCards.length} cards, ${added} new, ${allCards.length} total`);

    if (pageCount % flushEvery === 0) writeJson(outputPath, allCards);
    if (delayMs > 0) await sleep(delayMs);
  });
} else {
  console.warn("Could not find Hololive dynamic pagination metadata. Only page 1 was scraped.");
}

if (isJp) {
  console.log("Fetching Hololive JP translation sheet data...");
  const translations = await fetchHololiveTranslations(translationSheetId, { gids: translationGids, sheets: translationSheets });
  const englishCards = loadEnglishHololiveCards();
  const translated = applyTranslations(allCards, translations, englishCards);
  console.log(`Applied ${translated} English translation row(s) to Hololive JP cards.`);
}

writeJson(outputPath, allCards);
if (!Number.isFinite(maxPages) && expectedTotal && allCards.length !== expectedTotal) {
  console.warn(`Warning: site reported ${expectedTotal} cards, but ${allCards.length} cards were written.`);
}
console.log(`Done. Wrote ${allCards.length} cards to ${outputPath}`);

function parseCards(html, pageUrl) {
  const cards = [];
  const cardBlocks = html.matchAll(
    /<li\b[^>]*>\s*<a\s+href=(["'])([^"']*\/cardlist\/\?id=[^"']*)\1[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g
  );

  for (const match of cardBlocks) {
    const detailUrl = absolutize(decodeHtml(match[2]), pageUrl);
    const block = match[3];
    const officialId = new URL(detailUrl).searchParams.get("id") || "";
    const number = textOfClass(block, "number");
    const name = textOfClass(block, "name");
    if (!officialId && !number && !name) continue;

    const details = detailPairs(block);
    const keywords = keywordBlocks(block);
    const arts = artsBlocks(block);
    const oshiSkills = oshiSkillBlocks(block);
    const extra = extraBlock(block);
    const imageUrl = imageSrc(block, pageUrl);
    const imagePath = imageUrl ? new URL(imageUrl).pathname.replace(/^\/wp-content\/images\/cardlist\//, "") : "";
    const tags = firstDetail(details, "Tag", "タグ");

    cards.push({
      game: isJp ? "Hololive OCG (JP)" : "Hololive OCG (EN)",
      locale,
      officialId,
      number,
      name,
      detailUrl,
      imageUrl,
      imagePath,
      cardType: firstDetail(details, "Card Type", "カードタイプ", "カード種別"),
      rarity: firstDetail(details, "Rarity", "レアリティ"),
      cardSet: firstDetail(details, "Card Set", "収録商品", "商品", "カードセット"),
      color: normalizeEnergyText(firstDetail(details, "Color", "Attribute", "色", "属性")),
      life: firstDetail(details, "LIFE", "Life"),
      bloomLevel: firstDetail(details, "Bloom Level", "ブルームレベル"),
      hp: firstDetail(details, "HP"),
      batonPass: normalizeEnergyText(firstDetail(details, "Baton Pass", "バトンタッチ")),
      abilityText: firstDetail(details, "Ability Text", "能力テキスト", "テキスト"),
      keywords,
      arts,
      oshiSkills,
      extra,
      extraText: extra.text,
      isExtra: Boolean(extra.text),
      tags,
      tagsList: tags.match(/#[^\s#]+/g) || [],
      illustrator: firstDetail(details, "Illustrator", "イラストレーター"),
      details,
    });
  }

  return cards;
}

function addCards(cards) {
  let added = 0;
  for (const card of cards) {
    if (addCard(card)) added += 1;
  }
  return added;
}

function addCard(card) {
  const key = card.officialId || card.imagePath || `${card.number}|${card.name}|${card.rarity}`;
  if (!key || seenCards.has(key)) return false;
  seenCards.add(key);
  allCards.push(card);
  return true;
}

function dynamicPaginationFrom(html, pageUrl) {
  const decoded = html.replaceAll("&amp;", "&");
  const currentPage = Number(decoded.match(/var\s+cur_page\s*=\s*(\d+)/)?.[1] || 1);
  const maxPage = Number(decoded.match(/var\s+max_page\s*=\s*(\d+)/)?.[1] || 0);
  const ajaxPath = decoded.match(/url:\s*'([^']*\/cardlist\/cardsearch_ex\?[^']*?)&page='\+\(cur_page\+1\)/)?.[1];
  if (!ajaxPath || currentPage >= maxPage) return null;

  return {
    maxPage,
    urlForPage(page) {
      const url = new URL(ajaxPath, pageUrl);
      url.searchParams.set("page", String(page));
      url.searchParams.set("t", String(Date.now()));
      return url.toString();
    },
  };
}

async function runConcurrent(items, workerCount, handler) {
  let nextIndex = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await handler(item);
    }
  });
  await Promise.all(workers);
}

async function fetchTextWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; DeckmanagerHololiveScraper/0.1)",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function writeJson(path, cardList) {
  const tmpPath = `${path}.tmp`;
  const sortedCards = [...cardList].sort((a, b) =>
    String(a.number || "").localeCompare(String(b.number || "")) ||
    String(a.officialId || "").localeCompare(String(b.officialId || ""))
  );
  writeFileSync(tmpPath, `${JSON.stringify(sortedCards, null, 2)}\n`);
  renameSync(tmpPath, path);
}

function expectedCount(html) {
  return Number(
    cleanText(html.match(/(?:Search results:|検索結果：?)\s*<span[^>]*>\s*([\d,]+)\s*<\/span>\s*(?:items|件)/i)?.[1] || "").replace(/,/g, "")
  );
}

function textOfClass(html, className) {
  const match = html.match(
    new RegExp(`<[^>]+class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i")
  );
  return match ? cleanText(match[1]) : "";
}

function imageSrc(html, baseUrl) {
  const match = html.match(/<div[^>]+class=["'][^"']*\bimg\b[^"']*["'][^>]*>\s*<img[^>]+src=(["'])([^"']+)\1/i);
  return match ? absolutize(decodeHtml(match[2]), baseUrl) : "";
}

function detailPairs(html) {
  const details = {};
  const pairs = html.matchAll(/<dt>\s*([\s\S]*?)\s*<\/dt>\s*<dd>\s*([\s\S]*?)\s*<\/dd>/g);
  for (const [, rawKey, rawValue] of pairs) {
    const key = cleanText(rawKey);
    const value = cleanText(rawValue);
    if (!key) continue;
    details[key] = value;
  }
  return details;
}

function keywordBlocks(html) {
  return [...html.matchAll(/<div[^>]+class=["'][^"']*\bkeyword\b[^"']*["'][^>]*>\s*<p>[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/gi)]
    .map((match) => parseNamedTextBlock(match[1]))
    .filter((item) => item.name || item.text || item.type);
}

function artsBlocks(html) {
  return [...html.matchAll(/<div[^>]+class=["'][^"']*\barts\b[^"']*["'][^>]*>\s*<p>[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/gi)]
    .map((match) => parseArtsBlock(match[1]))
    .filter((item) => item.name || item.damage || item.cost.length || item.text);
}

function oshiSkillBlocks(html) {
  return [...html.matchAll(/<div[^>]+class=["'][^"']*\b(?:oshi|sp)\b[^"']*\bskill\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
    .map((match) => {
      const paragraphs = [...match[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((item) => item[1]);
      const label = cleanText(paragraphs[0] || "");
      const body = paragraphs[1] || "";
      const name = cleanText(body.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
      const text = cleanText(body.replace(/<span[^>]*>[\s\S]*?<\/span>/i, ""));
      return { label, name, text };
    })
    .filter((item) => item.label || item.name || item.text);
}

function extraBlock(html) {
  const match = html.match(/<div[^>]+class=["'][^"']*\bextra\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!match) return { label: "", text: "" };
  const paragraphs = [...match[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((item) => cleanText(item[1]));
  return {
    label: paragraphs[0] || "Extra",
    text: paragraphs.slice(1).join("\n").trim(),
  };
}

function parseNamedTextBlock(html) {
  const span = html.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "";
  const type = cleanText(span.match(/<img[^>]+alt=(["'])([^"']*)\1/i)?.[2] || "");
  const name = cleanText(span.replace(/<img[^>]*>/gi, ""));
  const text = cleanText(html.replace(/<span[^>]*>[\s\S]*?<\/span>/i, ""));
  return { type, name, text };
}

function parseArtsBlock(html) {
  const headerSpan = firstBalancedSpan(html);
  const spanHtml = headerSpan.inner;
  const specialHtml = spanHtml.match(/<span[^>]+class=["'][^"']*\btokkou\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "";
  const special = normalizeEnergyText(cleanText(specialHtml));
  const spanWithoutSpecial = spanHtml.replace(/<span[^>]+class=["'][^"']*\btokkou\b[^"']*["'][^>]*>[\s\S]*?<\/span>/i, "");
  const cost = [...spanWithoutSpecial.matchAll(/<img[^>]+alt=(["'])([^"']*)\1/gi)]
    .map((match) => normalizeEnergyText(cleanText(match[2])))
    .filter(Boolean);
  const withoutImages = spanWithoutSpecial.replace(/<img[^>]*>/gi, "");
  const label = cleanText(withoutImages);
  const damageMatch = label.match(/(.+?)\s+([0-9]+(?:\+)?)\s*$/);
  const text = cleanText(html.replace(headerSpan.full, ""));

  return {
    cost,
    name: damageMatch ? damageMatch[1].trim() : label,
    damage: damageMatch ? damageMatch[2].trim() : "",
    special,
    text,
  };
}

function firstBalancedSpan(html) {
  const start = String(html || "").search(/<span\b/i);
  if (start < 0) return { full: "", inner: "" };

  const tagPattern = /<\/?span\b[^>]*>/gi;
  tagPattern.lastIndex = start;

  let depth = 0;
  let openEnd = -1;
  let match;

  while ((match = tagPattern.exec(html))) {
    const tag = match[0];
    if (!tag.startsWith("</")) {
      depth += 1;
      if (openEnd < 0) openEnd = tagPattern.lastIndex;
    } else {
      depth -= 1;
      if (depth === 0) {
        return {
          full: html.slice(start, tagPattern.lastIndex),
          inner: html.slice(openEnd, match.index),
        };
      }
    }
  }

  return { full: "", inner: "" };
}

function normalizeEnergyText(value) {
  return String(value || "")
    .replace(/赤/g, "R")
    .replace(/青/g, "B")
    .replace(/緑/g, "G")
    .replace(/黄/g, "Y")
    .replace(/紫/g, "P")
    .replace(/白/g, "W")
    .replace(/◇/g, "W")
    .replace(/\s+/g, " ")
    .trim();
}

function firstDetail(details, ...keys) {
  for (const key of keys) {
    const value = details[key];
    if (value) return value;
  }
  return "";
}

function cleanText(html) {
  return decodeHtml(String(html || "")
    .replace(/<img[^>]+alt=(["'])([^"']*)\1[^>]*>/gi, " $2 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchHololiveTranslations(sheetId, options = {}) {
  const byNumber = new Map();
  const discovered = await discoverTranslationSheets(sheetId);
  const fallbackGids = discovered.length || (options.sheets || []).length ? [] : DEFAULT_TRANSLATION_GIDS;
  const sources = [
    ...discovered.map((sheet) => ({ type: "sheet", value: sheet })),
    ...(options.sheets || []).map((sheet) => ({ type: "sheet", value: sheet })),
    ...[...(options.gids || []), ...fallbackGids].map((gid) => ({ type: "gid", value: gid })),
  ].filter((source) => source.value);
  const uniqueSources = [...new Map(sources.map((source) => [`${source.type}:${source.value}`, source])).values()];

  for (const source of uniqueSources) {
    try {
      const queryKey = source.type === "sheet" ? "sheet" : "gid";
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&${queryKey}=${encodeURIComponent(source.value)}`;
      const csv = await fetchTextWithRetry(url, 2);
      const rows = parseCsv(csv);
      for (const row of rowsToObjects(rows)) {
        const translation = translationFromRow(row, source.value);
        if (!translation.number) continue;
        byNumber.set(normalizeCardNumber(translation.number), {
          ...(byNumber.get(normalizeCardNumber(translation.number)) || {}),
          ...translation,
        });
      }
      console.log(`Parsed ${rows.length} translation rows from translation ${source.type} ${source.value}.`);
    } catch (error) {
      console.warn(`Could not read translation ${source.type} ${source.value}: ${error.message || error}`);
    }
  }

  return byNumber;
}

async function discoverTranslationSheets(sheetId) {
  try {
    const html = await fetchTextWithRetry(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, 2);
    return [...html.matchAll(/docs-sheet-tab-caption">([\s\S]*?)<\/div>/g)]
      .map((match) => decodeHtml(cleanText(match[1])))
      .filter(isTranslationCardSheet);
  } catch {
    return [];
  }
}

function isTranslationCardSheet(name) {
  const text = String(name || "").trim();
  return /booster|start deck|starter cheer|pr\/birthday|promo|pr pack/i.test(text);
}

function translationFromRow(row, gid) {
  const number = pickRow(row, [
    "setcode", "set code", "card no", "card no.", "card number", "cardnumber", "number", "id", "カード番号", "card id",
  ]);
  const rawName = pickRow(row, [
    "english name", "en name", "translated name", "translation name", "name en", "name", "card name", "カード名(英語)",
  ]);
  const text = pickRow(row, [
    "english text", "en text", "translated text", "translation", "effect", "ability", "text", "card text", "能力", "効果",
  ]);
  const tags = pickRow(row, [
    "tags", "tag", "en tags", "translated tags", "buzz", "hash tags", "ハッシュタグ",
  ]);
  const type = pickRow(row, ["card type", "type", "kind"]);
  const extra = pickRow(row, ["extra", "extra text"]);
  const notes = pickRow(row, ["notes", "note", "memo"]);

  return {
    number,
    name: englishNameFromSheetValue(rawName),
    text,
    tags,
    cardType: type,
    extraText: extra,
    translationNotes: notes,
    translationSource: `google-sheet:${gid}`,
    sourceSheet: gid,
  };
}

function englishNameFromSheetValue(value) {
  const text = String(value || "").trim();
  const parenthetical = text.match(/\(([^()]+)\)\s*$/);
  if (parenthetical) return parenthetical[1].trim();
  return text;
}

function applyTranslations(cards, translations, englishCards = buildEnglishCardLookup([])) {
  let applied = 0;
  for (const card of cards) {
    const translation = translations.get(normalizeCardNumber(card.number));
    const englishCard = englishCards.byNumberRarity.get(`${normalizeCardNumber(card.number)}|${String(card.rarity || "").toUpperCase()}`)
      || englishCards.byNumber.get(normalizeCardNumber(card.number));
    card.jpName = card.name;
    card.jpAbilityText = card.abilityText || "";
    card.jpText = collectHololiveText(card);
    card.jpDetails = card.details || {};
    card.jpKeywords = card.keywords || [];
    card.jpArts = card.arts || [];
    card.jpOshiSkills = card.oshiSkills || [];
    card.jpExtra = card.extra || { label: "", text: "" };

    if (!translation) continue;
    applied += 1;
    card.translationSource = translation.translationSource;
    card.translationNotes = translation.translationNotes || "";
    card.translatedName = translation.name || "";
    card.translatedText = translation.text || "";
    card.translatedTags = translation.tags || "";

    if (englishCard) applyEnglishHololiveShape(card, englishCard);
    if (translation.name && !englishCard?.name) card.name = translation.name;
    if (translation.cardType) applyTranslatedType(card, translation.cardType);
    if (translation.sourceSheet && !englishCard?.cardSet) {
      card.cardSet = cardSetFromTranslationSheet(translation.sourceSheet) || card.cardSet;
    }
    if (translation.tags) {
      card.tags = translation.tags;
      card.tagsList = translation.tags.match(/#[^\s#]+/g) || translation.tags.split(/\s*[,/]\s*/).filter(Boolean);
    }
    if (translation.text && !englishCard) {
      const parsed = parseTranslatedHololiveText(translation.text);
      card.keywords = parsed.keywords;
      card.arts = parsed.arts;
      card.oshiSkills = parsed.oshiSkills;
      if (!parsed.keywords.length && !parsed.arts.length && !parsed.oshiSkills.length) {
        card.text = translation.text;
        card.abilityText = translation.text;
      } else {
        card.text = "";
        card.abilityText = "";
      }
      card.extra = translation.extraText ? { label: "Extra", text: translation.extraText } : { label: "", text: "" };
      card.extraText = translation.extraText || "";
      card.isExtra = Boolean(translation.extraText) || /you may include any number/i.test(translation.text);
    } else if (translation.text) {
      card.translatedText = translation.text;
    }
  }
  return applied;
}

function applyEnglishHololiveShape(card, englishCard) {
  for (const key of [
    "name",
    "cardType",
    "cardSet",
    "bloomLevel",
    "hp",
    "life",
    "batonPass",
    "abilityText",
    "extraText",
    "isExtra",
    "tags",
    "illustrator",
  ]) {
    if (englishCard[key] !== undefined && englishCard[key] !== "") card[key] = englishCard[key];
  }
  card.keywords = Array.isArray(englishCard.keywords) ? englishCard.keywords : [];
  card.arts = Array.isArray(englishCard.arts) ? englishCard.arts : [];
  card.oshiSkills = Array.isArray(englishCard.oshiSkills) ? englishCard.oshiSkills : [];
  card.extra = englishCard.extra && typeof englishCard.extra === "object" ? englishCard.extra : { label: "", text: "" };
  card.tagsList = Array.isArray(englishCard.tagsList) ? englishCard.tagsList : [];
  if (englishCard.abilityText && !card.text) card.text = englishCard.abilityText;
  card.enDetailUrl = englishCard.detailUrl || "";
  card.enImageUrl = englishCard.imageUrl || "";
}

function applyTranslatedType(card, value) {
  const text = String(value || "").trim();
  const bloom = text.match(/\b(debut|1st|2nd|spot)\b/i)?.[1] || "";
  if (bloom) card.bloomLevel = bloom;
  if (/oshi/i.test(text)) card.cardType = "Oshi";
  else if (/cheer/i.test(text)) card.cardType = "Cheer";
  else if (/support/i.test(text)) card.cardType = "Support";
  else if (/holomem/i.test(text)) card.cardType = "holomem";
  else if (text) card.cardType = text;
}

function parseTranslatedHololiveText(text) {
  const keywords = [];
  const arts = [];
  const oshiSkills = [];
  const blocks = String(text || "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (/^arts\s*:/i.test(lines[0])) {
      arts.push(parseTranslatedArtBlock(lines));
    } else if (/^(oshi skill|sp oshi skill)\b/i.test(lines[0])) {
      oshiSkills.push(parseTranslatedSkillBlock(lines));
    } else if (/^[A-Za-z][\w -]*\s*:/i.test(lines[0])) {
      keywords.push(parseTranslatedKeywordBlock(lines));
    } else {
      keywords.push({ type: "", name: "", text: lines.join("\n") });
    }
  }

  return {
    keywords: keywords.filter((item) => item.type || item.name || item.text),
    arts: arts.filter((item) => item.name || item.text),
    oshiSkills: oshiSkills.filter((item) => item.label || item.name || item.text),
  };
}

function parseTranslatedKeywordBlock(lines) {
  const [, type = "", name = ""] = lines[0].match(/^([^:]+):\s*(.*)$/) || [];
  return { type: type.trim(), name: name.trim(), text: lines.slice(1).join("\n").trim() };
}

function parseTranslatedSkillBlock(lines) {
  const [, label = "", name = ""] = lines[0].match(/^([^:]+):\s*(.*)$/) || [];
  return { label: label.trim(), name: name.trim(), text: lines.slice(1).join("\n").trim() };
}

function parseTranslatedArtBlock(lines) {
  const [, name = ""] = lines[0].match(/^arts\s*:\s*(.*)$/i) || [];
  const costLine = lines.find((line) => /^cost\s*:/i.test(line)) || "";
  const powerLine = lines.find((line) => /^power\s*:/i.test(line)) || "";
  const text = lines
    .filter((line) => !/^(arts|cost|power)\s*:/i.test(line))
    .join("\n")
    .trim();
  const { damage, special } = parseTranslatedPower(powerLine);
  return {
    cost: parseTranslatedCost(costLine),
    name: name.trim(),
    damage,
    special,
    text,
  };
}

function parseTranslatedCost(line) {
  const text = String(line || "").replace(/^cost\s*:\s*/i, "");
  const tokens = [];
  for (const part of text.split(/\s*,\s*/)) {
    const count = Number(part.match(/\d+/)?.[0] || 1);
    const token = energyTokenFromText(part);
    for (let index = 0; index < count; index += 1) tokens.push(token);
  }
  return tokens.filter(Boolean);
}

function parseTranslatedPower(line) {
  const text = String(line || "").replace(/^power\s*:\s*/i, "");
  const damage = text.match(/\d+/)?.[0] || "";
  const specialMatch = text.match(/\+(\d+)\s+vs\s+([a-z]+)/i);
  const special = specialMatch ? `${energyTokenFromText(specialMatch[2])}+${specialMatch[1]}` : "";
  return { damage, special };
}

function energyTokenFromText(value) {
  const text = String(value || "").toLowerCase();
  if (/red/.test(text)) return "R";
  if (/blue/.test(text)) return "B";
  if (/green/.test(text)) return "G";
  if (/yellow/.test(text)) return "Y";
  if (/purple/.test(text)) return "P";
  if (/white|any|colorless/.test(text)) return "W";
  return normalizeEnergyText(value).trim();
}

function collectHololiveText(card) {
  const lines = [];
  if (card.abilityText) lines.push(card.abilityText);
  for (const keyword of card.keywords || []) lines.push([keyword.type, keyword.name, keyword.text].filter(Boolean).join(" "));
  for (const art of card.arts || []) lines.push([art.name, art.damage, art.special, art.text].filter(Boolean).join(" "));
  for (const skill of card.oshiSkills || []) lines.push([skill.label, skill.name, skill.text].filter(Boolean).join(" "));
  if (card.extraText) lines.push(card.extraText);
  return lines.join("\n").trim();
}

function pickRow(row, names) {
  for (const name of names) {
    const normalized = normalizeHeader(name);
    if (row[normalized]) return row[normalized];
    const fuzzyKey = Object.keys(row).find((key) => key.startsWith(normalized));
    if (fuzzyKey && row[fuzzyKey]) return row[fuzzyKey];
  }
  return "";
}

function rowsToObjects(rows) {
  const headers = (rows[0] || []).map(normalizeHeader);
  return rows.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = String(cells[index] || "").trim();
    });
    return row;
  });
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((item) => item.some((value) => String(value || "").trim()));
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function normalizeCardNumber(value) {
  return String(value || "").trim().replace(/^EN[_-]/i, "").replace(/\s+/g, "").toLowerCase();
}

function loadEnglishHololiveCards() {
  try {
    if (!existsSync("data/cards/hololive-cards.json")) return buildEnglishCardLookup([]);
    const cards = JSON.parse(readFileSync("data/cards/hololive-cards.json", "utf8"));
    return buildEnglishCardLookup(Array.isArray(cards) ? cards : []);
  } catch {
    return buildEnglishCardLookup([]);
  }
}

function buildEnglishCardLookup(cards) {
  const byNumber = new Map();
  const byNumberRarity = new Map();
  for (const card of cards || []) {
    const number = normalizeCardNumber(card.number);
    if (!number) continue;
    if (!byNumber.has(number)) byNumber.set(number, card);
    byNumberRarity.set(`${number}|${String(card.rarity || "").toUpperCase()}`, card);
  }
  return { byNumber, byNumberRarity };
}

function cardSetFromTranslationSheet(sheetName) {
  const text = String(sheetName || "").trim();
  const booster = text.match(/^(?:Extra\s+)?Booster\s+([a-z]+\d+)\s+(.+)$/i);
  if (booster) return `${/^extra/i.test(text) ? "Extra Booster" : "Booster Pack"} \u2013 ${booster[2].trim()}`;
  const startDeck = text.match(/^Start Deck\s+([^:]+)(?::\s*(.+))?$/i);
  if (startDeck) return `Start Deck \u2013 ${(startDeck[2] || startDeck[1]).trim()}`;
  if (/starter cheer/i.test(text)) return "Starter Cheer Set";
  if (/pr\/birthday/i.test(text)) return "PR/Birthday Cards";
  if (/promo/i.test(text)) return text;
  if (/pr pack/i.test(text)) return text;
  return "";
}

function absolutize(url, baseUrl) {
  return new URL(url, baseUrl).toString();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "fresh") parsed.fresh = true;
    else {
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}
