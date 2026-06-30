#!/usr/bin/env node

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const SEARCH_BASE =
  "https://en.ws-tcg.com/cardlist/searchresults/?keyword=&keyword_or=&keyword_not=&keyword_type%5B0%5D=name&keyword_type%5B1%5D=feature&keyword_type%5B2%5D=text&keyword_type%5B3%5D=no&side=&title=&category=&expansion_name=&card_kind%5B0%5D=all&color%5B0%5D=all&level_s=&level_e=&power_s=&power_e=&soul_s=&soul_e=&cost_s=&cost_e=&trigger=&view=text&sort=new";

const args = parseArgs(process.argv.slice(2));
const titleSelectPath = args.titleSelect || "";
const outputPath = args.output || "data/cards/weiss-series.json";
const delayMs = Number(args.delayMs || 100);
const flushEvery = Number(args.flushEvery || 5);
const concurrency = Number(args.concurrency || 4);

if (!titleSelectPath) {
  console.error("Usage: node scripts/build-weiss-series-map.mjs --titleSelect pasted-title-select.txt [--output data/cards/weiss-series.json]");
  process.exit(1);
}

const titles = parseTitleOptions(readFileSync(titleSelectPath, "utf8"));
const mapped = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : [];
const mappedById = new Map(mapped.map((title) => [title.id, title]));
let completedSinceFlush = 0;

console.log(`Mapping ${titles.length} Weiss titles...`);
console.log(`Loaded ${mapped.length} existing mappings from ${outputPath}`);
await runConcurrent(titles, Math.max(1, concurrency), async (title, index) => {
  if (mappedById.has(title.id)) {
    console.log(`${index + 1}/${titles.length}: ${title.name} -> already mapped`);
    return;
  }

  const prefixes = await fetchTitlePrefixes(title.id);
  const mappedTitle = { ...title, codes: prefixes };
  mapped.push(mappedTitle);
  mappedById.set(title.id, mappedTitle);
  completedSinceFlush += 1;
  console.log(`${index + 1}/${titles.length}: ${title.name} -> ${prefixes.join(", ") || "no cards"}`);
  if (completedSinceFlush >= flushEvery) {
    writeJson(outputPath, sortMappings(mapped));
    completedSinceFlush = 0;
  }
  if (delayMs > 0) await sleep(delayMs);
});

writeJson(outputPath, sortMappings(mapped));
console.log(`Done. Wrote ${mapped.length} title mappings to ${outputPath}`);

function parseTitleOptions(html) {
  return [...html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map((match) => {
      const attrs = match[1];
      const id = attrs.match(/\bvalue=(["'])(.*?)\1/i)?.[2] || "";
      const side = attrs.match(/\bclass=(["'])(.*?)\1/i)?.[2]?.match(/\bside-(\d+)\b/)?.[1] || "";
      const name = cleanText(match[2]);
      return { id, name, side };
    })
    .filter((option) => option.id && option.name && option.name.toLowerCase() !== "all");
}

async function fetchTitlePrefixes(titleId) {
  const firstUrl = searchUrl(titleId, 1);
  const firstHtml = await fetchTextWithRetry(firstUrl);
  const numbers = parseCardNumbers(firstHtml);
  const pagination = dynamicPaginationFrom(firstHtml, firstUrl);

  if (pagination) {
    const pages = [];
    for (let page = 2; page <= pagination.maxPage; page += 1) pages.push(page);
    await runConcurrent(pages, 4, async (page) => {
      const html = await fetchTextWithRetry(pagination.urlForPage(page));
      numbers.push(...parseCardNumbers(html));
    });
  }

  return [...new Set(numbers.map((number) => number.split("/")[0]).filter(Boolean))].sort();
}

function searchUrl(titleId, page) {
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("title", titleId);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

function parseCardNumbers(html) {
  return [...html.matchAll(/<p[^>]+class=(["'])[^"']*\bnumber\b[^"']*\1[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[2]))
    .filter(Boolean);
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

async function fetchTextWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; DeckmanagerSeriesMapper/1.0; +https://en.ws-tcg.com/)",
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

function cleanText(html) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
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

function writeJson(path, value) {
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmpPath, path);
}

function sortMappings(mappings) {
  return [...mappings].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

async function runConcurrent(items, workerCount, handler) {
  let nextIndex = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await handler(items[index], index);
    }
  });
  await Promise.all(workers);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}
