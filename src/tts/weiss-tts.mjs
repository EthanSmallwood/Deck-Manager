import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const SHEET_COLUMNS = 10;
const SHEET_ROWS = 7;
const SHEET_CAPACITY = SHEET_COLUMNS * SHEET_ROWS;
const DEFAULT_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/1850416181764145219/59A6A28E074631A387411A532D411FD2DED49E81/";

const contentTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

export async function generateWeissTtsDeck(deck, currentPort, settings = {}) {
  const deckName = String(deck.name || "Weiss Schwarz Deck").trim() || "Weiss Schwarz Deck";
  const deckSlug = safeFileName(deckName).replace(/\s+/g, "-").toLowerCase();
  const assetVersion = safeFileName(Date.now().toString(36));
  const outDir = resolve("outputs", "tts", deckSlug);
  const assetBaseUrl = `http://127.0.0.1:${currentPort}/assets/`;

  mkdirSync(resolve(outDir, "images"), { recursive: true });
  mkdirSync(resolve(outDir, "sheets"), { recursive: true });

  const uniqueCards = [...new Map(deck.cards.map((card) => [card.number, card])).values()];
  const imagePathByNumber = new Map();

  for (const card of uniqueCards) {
    const imagePath = resolve(outDir, "images", `${safeFileName(card.number)}.png`);
    if (!existsSync(imagePath)) await downloadFile(card.imageUrl, imagePath);
    imagePathByNumber.set(card.number, imagePath);
  }

  const cardSlotByNumber = new Map();
  const sheets = [];

  for (let start = 0; start < uniqueCards.length; start += SHEET_CAPACITY) {
    const sheetIndex = sheets.length;
    const sheetCards = uniqueCards.slice(start, start + SHEET_CAPACITY);
    const deckKey = String(sheetIndex + 1);
    const sheetPath = resolve(outDir, "sheets", `sheet-${deckKey}-${assetVersion}.jpg`);
    const sheetUrl = new URL(relativeAssetPath(sheetPath), assetBaseUrl).toString();

    sheets.push({
      deckKey,
      output: sheetPath,
      cards: sheetCards.map((card) => ({
        path: imagePathByNumber.get(card.number),
        rotate: isClimax(card),
      })),
    });

    sheetCards.forEach((card, slotIndex) => {
      cardSlotByNumber.set(card.number, {
        deckKey,
        cardId: Number(deckKey) * 100 + slotIndex,
        sheetUrl,
      });
    });
  }

  const manifestPath = resolve(outDir, "sheet-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ sheets: sheets.map((sheet) => ({ ...sheet, columns: SHEET_COLUMNS, rows: SHEET_ROWS })) }, null, 2)
  );

  const sheetResult = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("src/tts/make-tts-sheets.ps1"), "-Manifest", manifestPath],
    { encoding: "utf8" }
  );

  if (sheetResult.status !== 0) {
    throw new Error(`Sheet generation failed: ${sheetResult.stderr || sheetResult.stdout || sheetResult.status}`);
  }

  const physicalCards = [];
  for (const card of deck.cards) {
    for (let index = 0; index < Number(card.qty || 1); index += 1) physicalCards.push(card);
  }

  const ttsObject = makeTtsObject(physicalCards, uniqueCards, cardSlotByNumber, deckName, DEFAULT_CARD_BACK_URL);
  const appOutPath = resolve(outDir, `${safeFileName(deckName)}.json`);
  const exportDir = String(settings.ttsJsonExportDir || "").trim();
  const outPath = exportDir ? resolve(exportDir, `${safeFileName(deckName)}.json`) : appOutPath;

  writeFileSync(appOutPath, `${JSON.stringify(ttsObject, null, 2)}\n`);
  if (outPath !== appOutPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(ttsObject, null, 2)}\n`);
  }

  const readmePath = resolve(outDir, "README-next-steps.txt");
  writeFileSync(readmePath, nextStepsText(deckName, outPath, sheets.map((sheet) => sheet.output)));

  return {
    deckName,
    cards: physicalCards.length,
    uniqueCards: uniqueCards.length,
    sheets: sheets.length,
    outputPath: outPath,
    appOutputPath: appOutPath,
    readmePath,
    outputUrl: new URL(relativeAssetPath(appOutPath), assetBaseUrl).toString(),
    sheetUrls: sheets.map((sheet) => new URL(relativeAssetPath(sheet.output), assetBaseUrl).toString()),
  };
}

export function serveAsset(response, relativePath) {
  const root = resolve(".");
  const filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  createReadStream(filePath).pipe(response);
}

function makeTtsObject(cards, uniqueCards, cardSlotByNumber, name, cardBackUrl) {
  const customDeck = {};
  const containedObjects = [];
  const deckIds = [];
  const sheetEntries = new Map();

  for (const card of uniqueCards) {
    const slot = cardSlotByNumber.get(card.number);
    if (!sheetEntries.has(slot.deckKey)) {
      sheetEntries.set(slot.deckKey, {
        FaceURL: slot.sheetUrl,
        BackURL: cardBackUrl,
        NumWidth: SHEET_COLUMNS,
        NumHeight: SHEET_ROWS,
        BackIsHidden: true,
        UniqueBack: false,
        Type: 0,
      });
    }
  }

  for (const [deckKey, deckEntry] of sheetEntries) customDeck[deckKey] = deckEntry;

  for (const card of cards) {
    const slot = cardSlotByNumber.get(card.number);
    const deckEntry = customDeck[slot.deckKey];
    deckIds.push(slot.cardId);
    containedObjects.push(makeTtsCard(card, slot.cardId, slot.deckKey, deckEntry));
  }

  return {
    SaveName: name,
    Date: new Date().toISOString(),
    VersionNumber: "",
    GameMode: "",
    GameType: "",
    GameComplexity: "",
    Tags: [],
    Gravity: 0.5,
    PlayArea: 0.5,
    Table: "",
    Sky: "",
    Note: "",
    TabStates: {},
    LuaScript: "",
    LuaScriptState: "",
    XmlUI: "",
    ObjectStates: [
      {
        GUID: ttsGuid(),
        Name: "Deck",
        Transform: { posX: 0, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        Nickname: name,
        Description: "Generated by Deckmanager. Upload custom assets to Steam Cloud after import.",
        GMNotes: "",
        AltLookAngle: { x: 0, y: 0, z: 0 },
        ColorDiffuse: { r: 0.713235259, g: 0.713235259, b: 0.713235259 },
        LayoutGroupSortIndex: 0,
        Value: 0,
        Locked: false,
        Grid: true,
        Snap: true,
        IgnoreFoW: false,
        MeasureMovement: false,
        DragSelectable: true,
        Autoraise: true,
        Sticky: true,
        Tooltip: true,
        GridProjection: false,
        HideWhenFaceDown: true,
        Hands: false,
        SidewaysCard: false,
        DeckIDs: deckIds,
        CustomDeck: customDeck,
        LuaScript: "",
        LuaScriptState: "",
        XmlUI: "",
        ContainedObjects: containedObjects,
      },
    ],
  };
}

function makeTtsCard(card, cardId, deckKey, deckEntry) {
  return {
    GUID: ttsGuid(),
    Name: "Card",
    Transform: { posX: 0, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    Nickname: `${card.name} (${card.number})`,
    Description: describeCard(card),
    GMNotes: JSON.stringify({ number: card.number, detailUrl: card.detailUrl }),
    AltLookAngle: { x: 0, y: 0, z: 0 },
    ColorDiffuse: { r: 0.713235259, g: 0.713235259, b: 0.713235259 },
    LayoutGroupSortIndex: 0,
    Value: 0,
    Locked: false,
    Grid: true,
    Snap: true,
    IgnoreFoW: false,
    MeasureMovement: false,
    DragSelectable: true,
    Autoraise: true,
    Sticky: true,
    Tooltip: true,
    GridProjection: false,
    HideWhenFaceDown: true,
    Hands: true,
    CardID: cardId,
    SidewaysCard: false,
    CustomDeck: { [deckKey]: deckEntry },
    LuaScript: "",
    LuaScriptState: "",
    XmlUI: "",
  };
}

function describeCard(card) {
  return [
    card.number,
    card.cardType,
    card.color && `Color: ${card.color}`,
    card.level && `Level: ${card.level}`,
    card.cost && `Cost: ${card.cost}`,
    card.power && `Power: ${card.power}`,
    card.soul && `Soul: ${card.soul}`,
    card.trigger && `Trigger: ${card.trigger}`,
    card.rarity && `Rarity: ${card.rarity}`,
    "",
    card.text || "",
  ].filter(Boolean).join("\n");
}

async function downloadFile(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function nextStepsText(deckName, outputPath, sheetPaths) {
  return [
    deckName,
    "",
    "1. Keep Deckmanager running.",
    "2. Import/load the saved object JSON below in Tabletop Simulator:",
    `   ${outputPath}`,
    "3. Let TTS load the local sheet URL(s).",
    "4. Upload the custom assets to Steam Cloud inside TTS.",
    "5. Save the object again after upload.",
    "",
    "Generated sheet file(s):",
    ...sheetPaths.map((path) => `   ${path}`),
    "",
  ].join("\n");
}

function isClimax(card) {
  return String(card.cardType || card.section || "").toLowerCase().includes("climax");
}

function relativeAssetPath(path) {
  return relative(resolve("."), resolve(path)).split(sep).join("/");
}

function safeFileName(value) {
  return String(value || "deck").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim() || "deck";
}

function ttsGuid() {
  return randomUUID().replaceAll("-", "").slice(0, 6);
}
