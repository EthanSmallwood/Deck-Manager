#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_URL =
  "https://en.hololive-official-cardgame.com/cardlist/cardsearch/?keyword=&attribute%5B0%5D=all&expansion_name=&card_kind%5B0%5D=all&rare%5B0%5D=all&bloom_level%5B0%5D=all&parallel%5B0%5D=all&view=text&sort=new";

const args = parseArgs(process.argv.slice(2));
const startUrl = args.url || DEFAULT_URL;
const outputPath = args.output || "data/cards/hololive-cards.json";
const delayMs = Number(args.delayMs || 250);
const maxPages = Number(args.maxPages || Infinity);
const flushEvery = Number(args.flushEvery || 5);
const concurrency = Number(args.concurrency || 6);

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
    const imageUrl = imageSrc(block, pageUrl);
    const imagePath = imageUrl ? new URL(imageUrl).pathname.replace(/^\/wp-content\/images\/cardlist\//, "") : "";
    const tags = firstDetail(details, "Tag");

    cards.push({
      game: "Hololive OCG",
      officialId,
      number,
      name,
      detailUrl,
      imageUrl,
      imagePath,
      cardType: firstDetail(details, "Card Type"),
      rarity: firstDetail(details, "Rarity"),
      cardSet: firstDetail(details, "Card Set"),
      color: normalizeEnergyText(firstDetail(details, "Color", "Attribute")),
      bloomLevel: firstDetail(details, "Bloom Level"),
      hp: firstDetail(details, "HP"),
      batonPass: normalizeEnergyText(firstDetail(details, "Baton Pass")),
      abilityText: firstDetail(details, "Ability Text"),
      keywords,
      arts,
      tags,
      tagsList: tags.match(/#[^\s#]+/g) || [],
      illustrator: firstDetail(details, "Illustrator"),
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
    cleanText(html.match(/Search results:\s*<span[^>]*>\s*([\d,]+)\s*<\/span>\s*items/i)?.[1] || "").replace(/,/g, "")
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
