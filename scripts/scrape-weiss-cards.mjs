#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_URL =
  "https://en.ws-tcg.com/cardlist/searchresults/?keyword=&keyword_or=&keyword_not=&keyword_type%5B0%5D=name&keyword_type%5B1%5D=feature&keyword_type%5B2%5D=text&keyword_type%5B3%5D=no&side=&title=&category=&expansion_name=&card_kind%5B0%5D=all&color%5B0%5D=all&level_s=&level_e=&power_s=&power_e=&soul_s=&soul_e=&cost_s=&cost_e=&trigger=&view=text&sort=new";

const args = parseArgs(process.argv.slice(2));
const startUrl = args.url || DEFAULT_URL;
const outputPath = args.output || "data/cards/weiss-cards.json";
const delayMs = Number(args.delayMs || 250);
const maxPages = Number(args.maxPages || Infinity);
const flushEvery = Number(args.flushEvery || 5);
const concurrency = Number(args.concurrency || 6);

const allCards = [];
const seenPages = new Set();

if (existsSync(outputPath) && !args.fresh) {
  const existing = JSON.parse(readFileSync(outputPath, "utf8"));
  allCards.push(...existing);
  console.log(`Loaded ${allCards.length} existing cards from ${outputPath}`);
}

let pageCount = 0;
let expectedTotal = 0;

const firstUrl = new URL(startUrl).toString();
seenPages.add(firstUrl);
pageCount += 1;

console.log(`Fetching page 1: ${firstUrl}`);
const firstHtml = await fetchTextWithRetry(firstUrl);
expectedTotal ||= expectedCount(firstHtml);
const firstCards = parseCards(firstHtml, firstUrl);
addCards(firstCards);
console.log(
  `Parsed ${firstCards.length} cards, ${firstCards.length} new, ${allCards.length} total`
);

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

    console.log(
      `Parsed page ${page}: ${pageCards.length} cards, ${added} new, ${allCards.length} total`
    );

    if (pageCount % flushEvery === 0) writeJson(outputPath, allCards);
    if (delayMs > 0) await sleep(delayMs);
  });
} else {
  let nextUrl = findNextPageUrl(firstHtml, firstUrl);
  while (nextUrl && pageCount < maxPages) {
    const absoluteUrl = new URL(nextUrl, startUrl).toString();
    if (seenPages.has(absoluteUrl)) {
      console.warn(`Stopping because page repeated: ${absoluteUrl}`);
      break;
    }

    seenPages.add(absoluteUrl);
    pageCount += 1;

    console.log(`Fetching page ${pageCount}: ${absoluteUrl}`);
    const html = await fetchTextWithRetry(absoluteUrl);
    const pageCards = parseCards(html, absoluteUrl);
    const added = addCards(pageCards);

    console.log(
      `Parsed ${pageCards.length} cards, ${added} new, ${allCards.length} total`
    );

    if (pageCount % flushEvery === 0) writeJson(outputPath, allCards);

    nextUrl = findNextPageUrl(html, absoluteUrl);
    if (nextUrl) await sleep(delayMs);
  }
}

writeJson(outputPath, allCards);
if (!Number.isFinite(maxPages) && expectedTotal && allCards.length !== expectedTotal) {
  console.warn(
    `Warning: site reported ${expectedTotal} cards, but ${allCards.length} cards were written.`
  );
}
console.log(`Done. Wrote ${allCards.length} cards to ${outputPath}`);

function parseCards(html, pageUrl) {
  const cards = [];
  const cardBlocks = html.matchAll(
    /<li\b[^>]*>\s*<a\s+href=(["'])([^"']*\/cardlist\/\?cardno=[^"']*)\1[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g
  );

  for (const match of cardBlocks) {
    const detailUrl = absolutize(decodeHtml(match[2]), pageUrl);
    const block = match[3];
    const number = textOfClass(block, "number");
    if (!number) continue;

    const detailPairs = [...block.matchAll(/<dl>\s*<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/dl>/g)];
    const fields = {};
    for (const [, rawKey, rawValue] of detailPairs) {
      const key = cleanText(rawKey);
      const value = cleanText(rawValue);
      if (!key) continue;
      fields[toCamelCase(key)] = value;
    }

    cards.push({
      number,
      name: textOfClass(block, "ttl"),
      detailUrl,
      imageUrl: imageSrc(block, pageUrl),
      cardType: fields.cardType || "",
      rarity: fields.rarity || "",
      side: imageAltOrText(block, "Side") || imageNameOrText(block, "Side") || fields.side || "",
      color: imageNameOrText(block, "Color") || fields.color || "",
      level: fields.level || "",
      cost: fields.cost || "",
      power: fields.power || "",
      trigger: fields.trigger || "",
      soul: fields.soul || "",
      text: detailText(block),
    });
  }

  return cards;
}

function addCards(pageCards) {
  allCards.push(...pageCards);
  return pageCards.length;
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

function findNextPageUrl(html, pageUrl) {
  const decoded = html.replaceAll("&amp;", "&");
  const ajaxPage = Number(new URL(pageUrl).searchParams.get("page") || 0);
  if (pageUrl.includes("/cardlist/cardsearch_ex") && ajaxPage > 0) {
    const pageCards = parseCards(html, pageUrl).length;
    if (pageCards === 0) return "";
    const next = new URL(pageUrl);
    next.searchParams.set("page", String(ajaxPage + 1));
    next.searchParams.set("t", String(Date.now()));
    return next.toString();
  }

  const candidates = [
    ...decoded.matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*(?:Next|＞|>|»|&gt;)\s*<\/a>/gi),
    ...decoded.matchAll(/<a[^>]+class="[^"]*(?:next|more)[^"]*"[^>]+href="([^"]+)"/gi),
    ...decoded.matchAll(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*(?:next|more)[^"]*"/gi),
  ].map((match) => match[1]);

  for (const candidate of candidates) {
    if (candidate && !candidate.startsWith("#")) return absolutize(candidate, pageUrl);
  }

  const current = new URL(pageUrl);
  const pageParam = current.searchParams.get("page") || current.searchParams.get("paged");
  if (pageParam) {
    current.searchParams.set(
      current.searchParams.has("page") ? "page" : "paged",
      String(Number(pageParam) + 1)
    );
    return current.toString();
  }

  return "";
}

async function fetchTextWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; WeissCardScraper/1.0; +https://en.ws-tcg.com/)",
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
  const sortedCards = [...cardList].sort((a, b) => a.number.localeCompare(b.number));
  writeFileSync(tmpPath, `${JSON.stringify(sortedCards, null, 2)}\n`);
  renameSync(tmpPath, path);
}

function expectedCount(html) {
  return Number(
    cleanText(
      html.match(/Search Results\s*<span>\s*([\d,]+)\s*<\/span>\s*items/i)?.[1] || ""
    ).replace(/,/g, "")
  );
}

function textOfClass(html, className) {
  const match = html.match(
    new RegExp(`<[^>]+class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i")
  );
  return match ? cleanText(match[1]) : "";
}

function detailText(html) {
  const match = html.match(/<div[^>]+class="[^"]*\bp-cards__detail\b[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>/i);
  return match ? cleanText(match[1]) : "";
}

function imageSrc(html, baseUrl) {
  const match = html.match(/<div[^>]+class=["'][^"']*\bimage\b[^"']*["'][^>]*>\s*<img[^>]+src=(["'])([^"']+)\1/i);
  return match ? absolutize(decodeHtml(match[2]), baseUrl) : "";
}

function imageAltOrText(html, label) {
  const dd = ddForLabel(html, label);
  if (!dd) return "";
  const alt = dd.match(/<img[^>]+alt=(["'])([^"']*)\1/i);
  return cleanText(alt?.[2] || dd);
}

function imageNameOrText(html, label) {
  const dd = ddForLabel(html, label);
  if (!dd) return "";
  const src = dd.match(/<img[^>]+src=(["'])([^"']+)\1/i)?.[2] || "";
  const fileName = src.split("/").pop()?.replace(/\.[^.]+$/, "");
  return cleanText(fileName || dd);
}

function ddForLabel(html, label) {
  const match = html.match(
    new RegExp(`<dl>\\s*<dt>\\s*${escapeRegex(label)}\\s*<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>\\s*<\\/dl>`, "i")
  );
  return match?.[1] || "";
}

function cleanText(html) {
  return decodeHtml(
    html
      .replace(/<img\b[^>]*>/gi, (tag) => inlineImageText(tag))
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

function inlineImageText(tag) {
  const alt = tag.match(/\salt=(["'])(.*?)\1/i)?.[2] || "";
  const src = tag.match(/\ssrc=(["'])(.*?)\1/i)?.[2] || "";
  const rawLabel = alt || src.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "";
  const label = decodeHtml(rawLabel)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return label ? `【${label}】` : " ";
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function absolutize(url, baseUrl) {
  return new URL(url, baseUrl).toString();
}

function toCamelCase(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, char) => char.toUpperCase());
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "fresh") {
      parsed.fresh = true;
    } else {
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}
