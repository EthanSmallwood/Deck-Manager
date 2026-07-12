import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { normalizeDeckSection } from "../shared/deck-sections.mjs";

const SHEET_COLUMNS = 10;
const SHEET_ROWS = 7;
const SHEET_CAPACITY = SHEET_COLUMNS * SHEET_ROWS;
const DEFAULT_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/1850416181764145219/59A6A28E074631A387411A532D411FD2DED49E81/";
const HOLOLIVE_MAIN_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/14311686523205718977/489BE6E2BF2617D0F1EA56ADC714A8BE3C50775E/";
const HOLOLIVE_OSHI_CHEER_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/11673131915085227537/3D00A63C06A2F548E0A38F8C943E291766A203F8/";
const UNION_ARENA_EN_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/2378552413975102727/994C244543EC897E5674DABD4F5C2C298587FBF1/";
const UNION_ARENA_JP_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/2480995803959996486/55D57763932061EE55F5DFE188609C79C538F955/";
const RIFTBOUND_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/17688218182195221720/C0AEF1C3E0A5694D46C19B17437C2C07790FF943/";
const RIFTBOUND_RUNE_CARD_BACK_URL =
  "https://steamusercontent-a.akamaihd.net/ugc/11360156058649621400/9E42514E1839ADB4B820E74D40E4FCB60B480F02/";

const WEISS_CARD_LUA = String.raw`data = {
    game = "weiss",
    basePower = 0,
    powerDelta = 0,
    hasCounters = false,
    canEquip = true,
    equipped = false,
    equippedCards = { slot_count = 0, slots = {} }
}

local MAX_EQUIP_SLOTS = 12
local EQUIP_ROWS = 3

function onLoad(saved)
    if saved ~= nil and saved ~= "" then
        local ok, decoded = pcall(function()
            return JSON.decode(saved)
        end)
        if ok and decoded then
            data = decoded
        end
    end

    if data.powerDelta == nil then data.powerDelta = 0 end
    if data.game == nil then data.game = "weiss" end
    if data.hasCounters == nil then data.hasCounters = false end
    if data.canEquip == nil then data.canEquip = true end
    if data.equippedCards == nil then data.equippedCards = { slot_count = 0, slots = {} } end

    self.addContextMenuItem("Reset Weiss counters", resetAllCounters)
    self.addContextMenuItem("Unequip all", unequipAll)
    if data.canEquip then
        self.addContextMenuItem("Equip as marker", equipFromContext)
    end

    Wait.time(rebuild, 0.5)
end

function onSave()
    return JSON.encode(data)
end

function parseNotes(obj)
    if obj == nil or obj.getGMNotes == nil then return {} end
    local notes = obj.getGMNotes()
    if notes == nil or notes == "" then return {} end

    local ok, decoded = pcall(function()
        return JSON.decode(notes)
    end)

    if ok and decoded ~= nil then return decoded end
    return {}
end

function isFaceDown()
    if self.is_face_down ~= nil then
        return self.is_face_down
    end

    local rot = self.getRotation()
    return math.abs(rot.z or 0) > 90
end

function equippedOffset(index)
    local col = math.floor(index / EQUIP_ROWS)
    local row = index % EQUIP_ROWS
    return Vector(-1.85 - 1.35 * col, 0.08, -0.58 + row * (1.7 / EQUIP_ROWS))
end

function normalizeSlots()
    if data.equippedCards == nil then
        data.equippedCards = { slot_count = 0, slots = {} }
    end

    if type(data.equippedCards.slot_count) ~= "number" or type(data.equippedCards.slots) ~= "table" then
        data.equippedCards = { slot_count = 0, slots = {} }
    end

    return data.equippedCards
end

function slotGuid(slotData, slot)
    if slotData == nil or type(slotData.slots) ~= "table" then return nil end
    local value = slotData.slots[slot]
    if type(value) == "string" and value ~= "" then return value end
    return nil
end

function firstEmptySlot(slotData)
    local limit = math.max(slotData.slot_count or 0, 0)
    for i = 1, limit do
        if slotGuid(slotData, i) == nil then return i end
    end

    return limit + 1
end

function countOccupiedSlots(slotData)
    local count = 0
    local limit = math.max(slotData.slot_count or 0, 0)
    for i = 1, limit do
        if slotGuid(slotData, i) ~= nil then count = count + 1 end
    end

    return count
end

function attachmentGuid(attached)
    if attached ~= nil and attached.getGUID ~= nil then
        return attached.getGUID()
    elseif type(attached) == "table" then
        return attached.guid
    end

    return nil
end

function attachmentIndexByGuid(host)
    local map = {}
    for index, attached in ipairs(host.getAttachments() or {}) do
        local guid = attachmentGuid(attached)
        if guid ~= nil and guid ~= "" then map[guid] = index end
    end

    return map
end

function isCompatibleHost(obj)
    if obj == nil or obj.tag ~= "Card" then return false end
    local notes = parseNotes(obj)
    return notes.game == data.game
end

function currentPower()
    return (tonumber(data.basePower) or 0) + (tonumber(data.powerDelta) or 0)
end

function counterColor(delta)
    if delta > 0 then return "rgba(0,210,90,1)" end
    if delta < 0 then return "rgba(220,50,50,1)" end
    return "white"
end

function updateCardUI()
    if data.equipped or isFaceDown() then
        self.UI.setXml("")
        return
    end

    local xml = [[
<Defaults>
    <Text fontSize="58" fontStyle="Bold" alignment="MiddleCenter" outline="rgba(0,0,0,1)" outlineSize="3 3" />
</Defaults>
]]

    if data.hasCounters then
        local power = currentPower()
        local powerDelta = tonumber(data.powerDelta) or 0
        xml = xml .. [[
<Panel position="0 -152 -100" width="260" height="82" scale="0.72 0.72 0.72" rotation="180 180 0" color="rgba(0,0,0,0.62)">
    <Text position="0 0 2" color="]] .. counterColor(powerDelta) .. [[">]] .. tostring(power) .. [[</Text>
</Panel>
]]
    end

    self.UI.setXml(xml)
end

function addCounterButtons()
    self.createButton({
        label = "-",
        click_function = "powerDown",
        function_owner = self,
        position = {-0.58, 0.36, 1.52},
        scale = {0.52, 0.52, 0.52},
        width = 360,
        height = 300,
        font_size = 220,
        color = {0.7, 0.1, 0.1, 0.95},
        font_color = {1, 1, 1, 1},
        tooltip = "-500 Power"
    })
    self.createButton({
        label = "+",
        click_function = "powerUp",
        function_owner = self,
        position = {0.58, 0.36, 1.52},
        scale = {0.52, 0.52, 0.52},
        width = 360,
        height = 300,
        font_size = 220,
        color = {0.1, 0.6, 0.1, 0.95},
        font_color = {1, 1, 1, 1},
        tooltip = "+500 Power"
    })
end

function addEquipButtons()
    local slotData = normalizeSlots()

    if countOccupiedSlots(slotData) > 0 then
        self.createButton({
            label = "X",
            click_function = "unequipAll",
            function_owner = self,
            position = {1.66, 0.36, -1.35},
            scale = {0.45, 0.45, 0.45},
            width = 520,
            height = 520,
            font_size = 380,
            color = {0.15, 0.15, 0.15, 1},
            font_color = {1, 1, 1, 1},
            tooltip = "Unequip all markers"
        })

        local maxSlots = math.min(slotData.slot_count or 0, MAX_EQUIP_SLOTS)
        for i = 1, maxSlots do
            if slotGuid(slotData, i) ~= nil then
                local slotPos = equippedOffset(i - 1)
                self.createButton({
                    label = "X",
                    click_function = "unequipSlot" .. tostring(i),
                    function_owner = self,
                    position = {-(slotPos.x + 0.55), 0.36, slotPos.z - 0.20},
                    scale = {0.38, 0.38, 0.38},
                    width = 320,
                    height = 320,
                    font_size = 230,
                    color = {0.15, 0.15, 0.15, 1},
                    font_color = {1, 1, 1, 1},
                    tooltip = "Unequip marker"
                })
            end
        end
    end

end

function rebuild()
    self.clearButtons()
    updateCardUI()

    if data.equipped or isFaceDown() then return end

    if data.hasCounters then
        addCounterButtons()
    end

    addEquipButtons()
end

function powerUp()
    data.powerDelta = (tonumber(data.powerDelta) or 0) + 500
    rebuild()
end

function powerDown()
    data.powerDelta = (tonumber(data.powerDelta) or 0) - 500
    rebuild()
end

function resetAllCounters()
    data.powerDelta = 0
    rebuild()
end

function equipFromContext(playerColor)
    equipToOverlappedCard(self, playerColor)
end

function weissAcceptEquip(params)
    local slotData = normalizeSlots()
    local slot = firstEmptySlot(slotData)
    if slot > MAX_EQUIP_SLOTS then return { ok = false, error = "No equip slots available." } end

    slotData.slot_count = math.max(slotData.slot_count or 0, slot)
    slotData.slots[slot] = params.guid
    return { ok = true, slot = slot }
end

function equipToOverlappedCard(obj, playerColor)
    if data.equipped then return end

    local scale = self.getScale()[1]
    local hits = Physics.cast({
        origin = self.getPosition() + Vector(0, 0.25, 0),
        direction = {0, -1, 0},
        max_distance = 1.5,
        type = 3,
        size = {2.5 * scale, 0.2, 3.0 * scale},
        debug = false
    })

    local candidates = {}
    for _, hit in ipairs(hits) do
        local hitObj = hit.hit_object
        if hitObj ~= nil and hitObj ~= self and isCompatibleHost(hitObj) and not hitObj.is_face_down then
            table.insert(candidates, hitObj)
        end
    end

    if #candidates == 0 then
        broadcastToColor("No compatible card underneath to equip to.", playerColor, {1, 0.4, 0.4})
        return
    end

    table.sort(candidates, function(a, b)
        local pa = a.getPosition()
        local pb = b.getPosition()
        if math.abs(pa.y - pb.y) > 0.01 then return pa.y > pb.y end
        if math.abs(pa.x - pb.x) > 0.01 then return pa.x < pb.x end
        return pa.z > pb.z
    end)

    local target = candidates[1]
    local ok, result = pcall(function()
        return target.call("weissAcceptEquip", { guid = self.getGUID() })
    end)

    if not ok or result == nil or result.ok ~= true then
        broadcastToColor("That card cannot receive markers.", playerColor, {1, 0.4, 0.4})
        return
    end

    local offsetIndex = (result.slot or 1) - 1
    local equippedScale = scale / 1.618
    self.setPosition(target.positionToWorld(equippedOffset(offsetIndex)))
    self.setRotation(target.getRotation())
    self.setScale({equippedScale, equippedScale, equippedScale})
    self.locked = true
    data.equipped = true
    self.clearButtons()
    self.UI.setXml("")

    target.addAttachment(self)
    target.call("rebuild")
end

function markUnequipped()
    data.equipped = false
    rebuild()
end

function unequipSlotNumber(slot, playerColor)
    local slotData = normalizeSlots()
    local guid = slotGuid(slotData, slot)
    if guid == nil then return end

    local indexMap = attachmentIndexByGuid(self)
    local attachmentIndex = indexMap[guid]
    slotData.slots[slot] = false

    if attachmentIndex == nil then
        rebuild()
        return
    end

    local released = self.removeAttachment(attachmentIndex - 1)
    if released == nil then
        rebuild()
        return
    end

    local offset = Vector(-1.6 + slot * -0.55, 0.25 + slot * 0.08, -1 + slot * 0.45)
    released.setPositionSmooth(self.positionToWorld(offset), false, true)
    released.setScale(self.getScale())
    released.setRotation(self.getRotation())
    released.setVelocity({0, 0, 0})
    released.setAngularVelocity({0, 0, 0})
    released.locked = false
    pcall(function() released.call("markUnequipped") end)
    rebuild()
end

function unequipAll(obj, playerColor)
    local slotData = normalizeSlots()
    for slot = (slotData.slot_count or 0), 1, -1 do
        if slotGuid(slotData, slot) ~= nil then
            unequipSlotNumber(slot, playerColor)
        end
    end

    data.equippedCards = { slot_count = 0, slots = {} }
    rebuild()
end

for i = 1, MAX_EQUIP_SLOTS do
    _G["unequipSlot" .. tostring(i)] = function(obj, playerColor)
        unequipSlotNumber(i, playerColor)
    end
end`;

const contentTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

export async function generateWeissTtsDeck(deck, currentPort, settings = {}) {
  return generateTtsDeck(deck, currentPort, settings, {
    defaultDeckName: "Weiss Schwarz Deck",
    cardBackUrl: DEFAULT_CARD_BACK_URL,
    cardImageUrl: weissTtsImageUrl,
    rotateCard: isClimax,
    makeCard: makeWeissTtsCard,
  });
}

export async function generateHololiveTtsDeck(deck, currentPort, settings = {}) {
  const deckName = String(deck.name || "Hololive OCG Deck").trim() || "Hololive OCG Deck";
  const deckSlug = safeFileName(deckName).replace(/\s+/g, "-").toLowerCase();
  const outDir = resolve("outputs", "tts", deckSlug);
  const assetBaseUrl = `http://127.0.0.1:${currentPort}/assets/`;
  const physicalCards = expandCards(deck.cards);
  const ttsObject = makeHololiveTtsObject(deckName, physicalCards);
  const appOutPath = resolve(outDir, `${safeFileName(deckName)}.json`);
  const exportDir = String(settings.ttsJsonExportDir || "").trim();
  const outPath = exportDir ? resolve(exportDir, `${safeFileName(deckName)}.json`) : appOutPath;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(appOutPath, `${JSON.stringify(ttsObject, null, 2)}\n`);
  if (outPath !== appOutPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(ttsObject, null, 2)}\n`);
  }

  const readmePath = resolve(outDir, "README-next-steps.txt");
  writeFileSync(readmePath, nextStepsText(deckName, outPath, []));

  return {
    deckName,
    cards: physicalCards.length,
    uniqueCards: uniqueCardKeyedByImage(physicalCards).length,
    sheets: 0,
    outputPath: outPath,
    appOutputPath: appOutPath,
    readmePath,
    outputUrl: new URL(relativeAssetPath(appOutPath), assetBaseUrl).toString(),
    sheetUrls: [],
  };
}

export async function generateUnionArenaTtsDeck(deck, currentPort, settings = {}) {
  const isJp = String(deck.game || "").includes("(JP)") || (deck.cards || []).some((card) => String(card.locale || "").toLowerCase() === "jp");
  return generateSectionedDirectTtsDeck(deck, currentPort, settings, {
    defaultDeckName: "Union Arena Deck",
    game: "union-arena",
    backUrl: isJp ? UNION_ARENA_JP_CARD_BACK_URL : UNION_ARENA_EN_CARD_BACK_URL,
    groups: [
      { section: "Main", name: "Main Deck", nickname: "main", baseDeckKey: 6000, position: { posX: 0, posY: 1, posZ: 0 }, tags: ["Main"] },
      { section: "Action Points", name: "Action Points", nickname: "action points", baseDeckKey: 7000, position: { posX: 3.2, posY: 1, posZ: 0 }, tags: ["Action Points", "AP"], backUrl: UNION_ARENA_JP_CARD_BACK_URL },
    ],
    imageUrl: unionArenaFaceUrl,
    makeCard: makeUnionArenaCardCustom,
  });
}

export async function generateRiftboundTtsDeck(deck, currentPort, settings = {}) {
  return generateSectionedDirectTtsDeck(deck, currentPort, settings, {
    defaultDeckName: "Riftbound Deck",
    game: "riftbound",
    backUrl: RIFTBOUND_CARD_BACK_URL,
    groups: [
      { section: "Champion", name: "Champion", nickname: "champion", baseDeckKey: 3000, position: { posX: -5.4, posY: 2.2, posZ: 0 }, spawnLast: true, tags: ["Champion"] },
      { section: "Legend", name: "Legend", nickname: "legend", baseDeckKey: 3600, position: { posX: -2.7, posY: 2.2, posZ: 0 }, spawnLast: true, tags: ["Legend"] },
      { section: "Deck", name: "Main Deck", nickname: "main", baseDeckKey: 1000, position: { posX: 0, posY: 1, posZ: 0 }, rotZ: 180, tags: ["Main"] },
      { section: "Runes", name: "Rune", nickname: "rune", baseDeckKey: 3500, position: { posX: 2.7, posY: 1, posZ: 0 }, rotZ: 180, tags: ["Rune"], backUrl: RIFTBOUND_RUNE_CARD_BACK_URL },
      { section: "Battlefields", name: "Battlefield", nickname: "battlefield", baseDeckKey: 2000, position: { posX: 5.4, posY: 1, posZ: 0 }, rotY: 90, rotZ: 180, tags: ["Battlefield"] },
      { section: "Sideboard", name: "Sideboard", nickname: "sideboard", baseDeckKey: 4000, position: { posX: 5.4, posY: 1, posZ: 2.7 }, rotY: 90, rotZ: 180, tags: ["Sideboard"] },
    ],
    imageUrl: riftboundFaceUrl,
    makeCard: makeRiftboundCardCustom,
  });
}

async function generateSectionedDirectTtsDeck(deck, currentPort, settings = {}, config) {
  const deckName = String(deck.name || config.defaultDeckName).trim() || config.defaultDeckName;
  const deckSlug = safeFileName(deckName).replace(/\s+/g, "-").toLowerCase();
  const outDir = resolve("outputs", "tts", deckSlug);
  const assetBaseUrl = `http://127.0.0.1:${currentPort}/assets/`;
  const physicalCards = expandCards(deck.cards);
  const ttsObject = makeSectionedDirectTtsObject(deckName, physicalCards, config);
  const appOutPath = resolve(outDir, `${safeFileName(deckName)}.json`);
  const exportDir = String(settings.ttsJsonExportDir || "").trim();
  const outPath = exportDir ? resolve(exportDir, `${safeFileName(deckName)}.json`) : appOutPath;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(appOutPath, `${JSON.stringify(ttsObject, null, 2)}\n`);
  if (outPath !== appOutPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(ttsObject, null, 2)}\n`);
  }

  const readmePath = resolve(outDir, "README-next-steps.txt");
  writeFileSync(readmePath, nextStepsText(deckName, outPath, []));

  return {
    deckName,
    cards: physicalCards.length,
    uniqueCards: uniqueCardKeyedByImage(physicalCards).length,
    sheets: 0,
    outputPath: outPath,
    appOutputPath: appOutPath,
    readmePath,
    outputUrl: new URL(relativeAssetPath(appOutPath), assetBaseUrl).toString(),
    sheetUrls: [],
  };
}

async function generateTtsDeck(deck, currentPort, settings = {}, config) {
  const deckName = String(deck.name || config.defaultDeckName).trim() || config.defaultDeckName;
  const deckSlug = safeFileName(deckName).replace(/\s+/g, "-").toLowerCase();
  const assetVersion = safeFileName(Date.now().toString(36));
  const outDir = resolve("outputs", "tts", deckSlug);
  const assetBaseUrl = `http://127.0.0.1:${currentPort}/assets/`;

  mkdirSync(resolve(outDir, "images"), { recursive: true });
  mkdirSync(resolve(outDir, "sheets"), { recursive: true });

  const uniqueCards = [...new Map(deck.cards.map((card) => [card.number, card])).values()];
  const imagePathByNumber = new Map();

  for (const card of uniqueCards) {
    const imageUrl = config.cardImageUrl ? config.cardImageUrl(card, deck) : card.imageUrl;
    const imagePath = resolve(outDir, "images", `${safeFileName(card.number)}-${shortHash(imageUrl)}.png`);
    if (!existsSync(imagePath)) await downloadFile(imageUrl, imagePath);
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
        rotate: config.rotateCard(card),
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

  const ttsObject = makeTtsObject(physicalCards, uniqueCards, cardSlotByNumber, deckName, config.cardBackUrl, config.makeCard);
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

function makeTtsObject(cards, uniqueCards, cardSlotByNumber, name, cardBackUrl, makeCard) {
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
    containedObjects.push(makeCard(card, slot.cardId, slot.deckKey, deckEntry));
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

function makeHololiveTtsObject(name, cards) {
  const objectStates = [];
  const groups = [
    { name: "Main Deck", cards: cards.filter((card) => hololiveSection(card) === "main"), backUrl: HOLOLIVE_MAIN_CARD_BACK_URL, baseDeckKey: 3000, position: { posX: 0, posY: 1, posZ: 0 }, tags: [] },
    { name: "Oshi", cards: cards.filter((card) => hololiveSection(card) === "oshi"), backUrl: HOLOLIVE_OSHI_CHEER_CARD_BACK_URL, baseDeckKey: 4000, position: { posX: -2.7, posY: 1, posZ: 0 }, tags: ["Oshi"] },
    { name: "Cheer Deck", cards: cards.filter((card) => hololiveSection(card) === "cheer"), backUrl: HOLOLIVE_OSHI_CHEER_CARD_BACK_URL, baseDeckKey: 5000, position: { posX: 2.7, posY: 1, posZ: 0 }, tags: ["Cheer"] },
  ];

  for (const group of groups) {
    if (!group.cards.length) continue;
    const slotByKey = makeDirectCardSlots(group.cards, group.baseDeckKey);
    if (group.cards.length === 1) {
      const card = group.cards[0];
      const slot = slotByKey.get(uniqueCardKey(card));
      objectStates.push(makeHololiveCardCustom(card, slot.cardId, slot.deckKey, directDeckEntry(card, group.backUrl), group.position));
      continue;
    }

    objectStates.push(makeHololiveDeckObject(group.name === "Main Deck" ? name : group.name, group.cards, slotByKey, group.backUrl, group.position, group.tags));
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
    ObjectStates: objectStates,
  };
}

function makeSectionedDirectTtsObject(name, cards, config) {
  const objectStates = [];
  const deferredObjectStates = [];

  for (const group of config.groups) {
    const groupCards = cards.filter((card) => normalizeDeckSection(card, gameNameForTts(config.game)) === group.section);
    if (!groupCards.length) continue;
    const slotByKey = makeDirectCardSlots(groupCards, group.baseDeckKey);
    const makeCard = (card, cardId, deckKey, deckEntry, position) => config.makeCard(card, cardId, deckKey, deckEntry, position, config, group);
    const targetStates = group.spawnLast ? deferredObjectStates : objectStates;

    if (groupCards.length === 1) {
      const card = groupCards[0];
      const slot = slotByKey.get(uniqueCardKey(card));
      targetStates.push(makeCard(card, slot.cardId, slot.deckKey, directDeckEntryFromUrl(config.imageUrl(card), group.backUrl || config.backUrl), group.position));
      continue;
    }

    targetStates.push(makeDirectDeckObject(group.name, group.nickname, groupCards, slotByKey, config, group, makeCard));
  }

  objectStates.push(...deferredObjectStates);

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
    ObjectStates: objectStates,
  };
}

function makeDirectDeckObject(name, nickname, cards, slotByKey, config, group, makeCard) {
  const customDeck = {};
  const deckIds = [];
  const containedObjects = [];

  for (const card of uniqueCardKeyedByImage(cards)) {
    const slot = slotByKey.get(uniqueCardKey(card));
    customDeck[slot.deckKey] = directDeckEntryFromUrl(config.imageUrl(card), group.backUrl || config.backUrl);
  }

  for (const card of cards) {
    const slot = slotByKey.get(uniqueCardKey(card));
    deckIds.push(slot.cardId);
    containedObjects.push(makeCard(card, slot.cardId, slot.deckKey, customDeck[slot.deckKey]));
  }

  return {
    GUID: ttsGuid(),
    Name: "Deck",
    Transform: ttsTransformForGroup(group.position, group),
    Nickname: nickname || name,
    Description: "",
    ...(group.tags?.length ? { Tags: group.tags } : {}),
    GMNotes: JSON.stringify({ game: config.game, section: group.section }),
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
  };
}

function makeDirectCardSlots(cards, baseDeckKey) {
  const uniqueCards = uniqueCardKeyedByImage(cards);
  const slots = new Map();
  uniqueCards.forEach((card, index) => {
    const deckKey = String(baseDeckKey + index);
    slots.set(uniqueCardKey(card), {
      deckKey,
      cardId: Number(deckKey) * 100,
    });
  });
  return slots;
}

function makeHololiveDeckObject(name, cards, slotByKey, backUrl, position, tags = []) {
  const customDeck = {};
  const deckIds = [];
  const containedObjects = [];

  for (const card of uniqueCardKeyedByImage(cards)) {
    const slot = slotByKey.get(uniqueCardKey(card));
    customDeck[slot.deckKey] = directDeckEntry(card, backUrl);
  }

  for (const card of cards) {
    const slot = slotByKey.get(uniqueCardKey(card));
    deckIds.push(slot.cardId);
    containedObjects.push(makeHololiveCardCustom(card, slot.cardId, slot.deckKey, customDeck[slot.deckKey]));
  }

  const topCard = cards[0];
  return {
    GUID: ttsGuid(),
    Name: "Deck",
    Transform: { ...ttsTransform(position), rotY: 180 },
    Nickname: name === "Main Deck" ? hololiveNickname(topCard) : name,
    Description: "",
    ...(tags.length ? { Tags: tags } : {}),
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
  };
}

function makeHololiveCardCustom(card, cardId, deckKey, deckEntry, position = { posX: 0, posY: 1, posZ: 0 }) {
  const canEquip = isHololiveEquipable(card);

  return {
    GUID: ttsGuid(),
    Name: "CardCustom",
    Transform: { ...ttsTransform(position), rotY: 180 },
    Nickname: hololiveNickname(card),
    Description: describeHololiveCard(card),
    ...(hololiveTtsTags(card).length ? { Tags: hololiveTtsTags(card) } : {}),
    GMNotes: JSON.stringify({
      game: "hololive",
      number: card.number,
      detailUrl: card.detailUrl,
      cardType: card.cardType || card.section || "",
      canEquip,
    }),
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
    LuaScript: WEISS_CARD_LUA,
    LuaScriptState: JSON.stringify({
      game: "hololive",
      basePower: 0,
      powerDelta: 0,
      hasCounters: false,
      canEquip,
      equipped: false,
      equippedCards: { slot_count: 0, slots: {} },
    }),
    XmlUI: "",
  };
}

function makeUnionArenaCardCustom(card, cardId, deckKey, deckEntry, position = { posX: 0, posY: 1, posZ: 0 }, _config = {}, group = {}) {
  return makeGenericCardCustom(card, cardId, deckKey, deckEntry, position, {
    game: "union-arena",
    nickname: `${card.name || "Union Arena Card"} - ${card.number || ""}`.trim(),
    description: describeUnionArenaCard(card),
    gmNotes: {
      game: "union-arena",
      number: card.number,
      detailUrl: card.detailUrl,
      cardType: card.cardType || "",
      section: normalizeDeckSection(card, card.game),
      color: card.color || "",
      rarity: card.rarity || "",
      locale: card.locale || "",
    },
    tags: normalizeDeckSection(card, card.game) === "Action Points" ? ["Action Points", "AP"] : [],
  }, group);
}

function makeRiftboundCardCustom(card, cardId, deckKey, deckEntry, position = { posX: 0, posY: 1, posZ: 0 }, _config = {}, group = {}) {
  return makeGenericCardCustom(card, cardId, deckKey, deckEntry, position, {
    game: "riftbound",
    nickname: card.name || "Riftbound Card",
    description: describeRiftboundCard(card),
    gmNotes: {
      game: "riftbound",
      number: card.number,
      section: normalizeDeckSection(card, "Riftbound"),
      riftboundChampion: Boolean(card.riftboundChampion || card.isChosenChampion),
      ...(card.tts || {}),
    },
    tags: riftboundTtsTags(card),
  }, group);
}

function makeGenericCardCustom(card, cardId, deckKey, deckEntry, position, config, group = {}) {
  return {
    GUID: ttsGuid(),
    Name: "CardCustom",
    Transform: ttsTransformForGroup(position, group),
    Nickname: config.nickname,
    Description: config.description,
    ...(config.tags?.length ? { Tags: config.tags } : {}),
    GMNotes: JSON.stringify(config.gmNotes),
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

function directDeckEntry(card, backUrl) {
  return {
    FaceURL: hololiveFaceUrl(card),
    BackURL: backUrl,
    NumWidth: 1,
    NumHeight: 1,
    BackIsHidden: true,
    UniqueBack: false,
    Type: 0,
  };
}

function directDeckEntryFromUrl(faceUrl, backUrl) {
  return {
    FaceURL: String(faceUrl || "").trim(),
    BackURL: backUrl,
    NumWidth: 1,
    NumHeight: 1,
    BackIsHidden: true,
    UniqueBack: false,
    Type: 0,
  };
}

function expandCards(cards) {
  const physicalCards = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    for (let index = 0; index < Number(card.qty || 1); index += 1) physicalCards.push(card);
  }
  return physicalCards;
}

function uniqueCardKeyedByImage(cards) {
  return [...new Map((Array.isArray(cards) ? cards : []).map((card) => [uniqueCardKey(card), card])).values()];
}

function uniqueCardKey(card) {
  return `${card.number || ""}|${card.imageUrl || ""}|${card.name || ""}`;
}

function weissTtsImageUrl(card, deck) {
  return isTranslatedJpWeissDeck(deck) && card.proxyImageUrl
    ? String(card.proxyImageUrl).trim()
    : String(card.imageUrl || "").trim();
}

function isTranslatedJpWeissDeck(deck) {
  if (String(deck?.weissLocale || deck?.locale || "").toLowerCase() === "jp") {
    return (deck.cards || []).some((card) => card.translationUrl || card.proxyImageUrl);
  }
  return (deck?.cards || []).some((card) => String(card.locale || "").toLowerCase() === "jp" && (card.translationUrl || card.proxyImageUrl));
}

function hololiveSection(card) {
  const section = String(card.section || "").toLowerCase();
  const type = String(card.cardType || "").toLowerCase();
  if (section.includes("oshi") || type === "oshi") return "oshi";
  if (section.includes("cheer") || type === "cheer") return "cheer";
  return "main";
}

function hololiveTtsTags(card) {
  const section = hololiveSection(card);
  const type = String(card.cardType || "").toLowerCase();
  if (section === "oshi") return ["Oshi"];
  if (section === "cheer") return ["Cheer"];
  if (type.includes("holomem")) return ["holomem"];
  return [];
}

function ttsTransform(position = {}) {
  return {
    posX: Number(position.posX ?? 0),
    posY: Number(position.posY ?? 1),
    posZ: Number(position.posZ ?? 0),
    rotX: 0,
    rotY: 180,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
}

function ttsTransformForGroup(position = {}, group = {}) {
  return {
    ...ttsTransform(position),
    rotY: Number(group.rotY ?? 180),
    rotZ: Number(group.rotZ ?? 0),
    scaleX: Number(group.scaleX ?? 1),
    scaleZ: Number(group.scaleZ ?? 1),
  };
}

function hololiveNickname(card) {
  return `${card.name || "Hololive Card"} - ${card.number || ""}`.trim();
}

function hololiveFaceUrl(card) {
  return String(card.imageUrl || "").trim();
}

function unionArenaFaceUrl(card) {
  const proxyUrl = String(card.proxyImageUrl || "").trim();
  if (proxyUrl) return proxyUrl;
  const rawUrl = String(card.imageUrl || card.rawImageUrl || "").trim();
  if (isUnionArenaJpCard(card) && rawUrl) return rawUrl;
  const cloudinaryUrl = unionArenaCloudinaryFaceUrl(card);
  if (cloudinaryUrl) return cloudinaryUrl;
  return rawUrl;
}

function unionArenaCloudinaryFaceUrl(card) {
  const number = String(card.number || card.originalId || "").trim();
  if (!number) return "";
  const filename = unionArenaCloudinaryFilename(card);
  if (normalizeDeckSection(card, card.game) === "Action Points" || /^UAPR-/i.test(number)) {
    return `https://res.cloudinary.com/dxqtcohxz/image/upload/${filename}.png#50626`;
  }
  return "";
}

function unionArenaCloudinaryFilename(card) {
  const number = String(card.number || "").trim();
  const originalId = String(card.originalId || "").trim();
  const alt = number.match(/-ALT(\d+)$/i);
  const base = alt ? originalId || number.replace(/-ALT\d+$/i, "") : number || originalId;
  const suffix = alt ? `_p${alt[1]}` : "";
  return `${base}${suffix}`.replace(/\//g, "_");
}

function isUnionArenaJpCard(card) {
  return String(card.game || "").includes("(JP)") || String(card.locale || "").toLowerCase() === "jp";
}

function riftboundFaceUrl(card) {
  return String(card.imageUrl || "").trim();
}

function makeWeissTtsCard(card, cardId, deckKey, deckEntry) {
  const basePower = weissPowerValue(card.power);
  const hasCounters = hasWeissCounters(card);

  return {
    GUID: ttsGuid(),
    Name: "Card",
    Transform: { posX: 0, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    Nickname: `${card.name} (${card.number})`,
    Description: describeCard(card),
    GMNotes: JSON.stringify({
      game: "weiss",
      number: card.number,
      detailUrl: card.detailUrl,
      cardType: card.cardType || card.section || "",
      power: basePower,
    }),
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
    LuaScript: WEISS_CARD_LUA,
    LuaScriptState: JSON.stringify({
      game: "weiss",
      basePower,
      powerDelta: 0,
      hasCounters,
      canEquip: true,
      equipped: false,
      equippedCards: { slot_count: 0, slots: {} },
    }),
    XmlUI: "",
  };
}

function makeHololiveTtsCard(card, cardId, deckKey, deckEntry) {
  const canEquip = isHololiveEquipable(card);

  return {
    GUID: ttsGuid(),
    Name: "Card",
    Transform: { posX: 0, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    Nickname: `${card.name} (${card.number})`,
    Description: describeHololiveCard(card),
    GMNotes: JSON.stringify({
      game: "hololive",
      number: card.number,
      detailUrl: card.detailUrl,
      cardType: card.cardType || card.section || "",
      canEquip,
    }),
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
    LuaScript: WEISS_CARD_LUA,
    LuaScriptState: JSON.stringify({
      game: "hololive",
      basePower: 0,
      powerDelta: 0,
      hasCounters: false,
      canEquip,
      equipped: false,
      equippedCards: { slot_count: 0, slots: {} },
    }),
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

function describeHololiveCard(card) {
  const typeLine = hololiveTypeLine(card);
  const blocks = [typeLine];
  const text = String(card.text || "").trim();

  if (text) blocks.push(formatHololiveText(text));
  if (Array.isArray(card.oshiSkills) && card.oshiSkills.length) {
    blocks.push(card.oshiSkills.map(formatHololiveAbility).filter(Boolean).join("\n\n"));
  }
  if (Array.isArray(card.arts) && card.arts.length) {
    blocks.push(["Arts:", ...card.arts.map(formatHololiveAbility).filter(Boolean)].join("\n"));
  }
  if (card.tags) blocks.push(String(card.tags).trim());
  if (card.batonPass) blocks.push(`Baton Pass cost: ${card.batonPass}`);
  if (card.extraText) blocks.push(`Extra:\n${card.extraText}`);

  return blocks.filter(Boolean).join("\n\n");
}

function describeUnionArenaCard(card) {
  return [
    card.number,
    card.cardType || card.section,
    card.color && `Color: ${card.color}`,
    card.energyCost && `Energy Cost: ${card.energyCost}`,
    card.ap && `AP Cost: ${card.ap}`,
    (card.bp || card.power) && `BP: ${card.bp || card.power}`,
    card.generatedEnergy && `Energy Generated: ${card.generatedEnergy}`,
    card.trigger && `Trigger: ${card.trigger}`,
    card.rarity && `Rarity: ${card.rarity}`,
    card.features && `Features: ${card.features}`,
    "",
    card.text || "",
  ].filter(Boolean).join("\n");
}

function describeRiftboundCard(card) {
  return [
    card.number,
    card.cardType || card.section,
    card.supertype && `Supertype: ${card.supertype}`,
    card.color && `Color: ${card.color}`,
    card.energy && `Energy: ${card.energy}`,
    card.might && `Might: ${card.might}`,
    card.power && `Power: ${card.power}`,
    card.rarity && `Rarity: ${card.rarity}`,
    card.tags && `Tags: ${card.tags}`,
    "",
    card.text || "",
  ].filter(Boolean).join("\n");
}

function formatHololiveAbility(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const heading = [
    value.cost,
    value.name,
    value.damage && `- ${value.damage}`,
    value.bonus && `(${value.bonus})`,
  ].filter(Boolean).join(" ");
  return [heading, value.text].filter(Boolean).join("\n");
}

function hololiveTypeLine(card) {
  const type = String(card.cardType || card.section || "").replaceAll("・", " - ").trim();
  const color = String(card.color || "").trim();
  const hp = String(card.hp || "").trim();
  if (type.toLowerCase().includes("holomem")) {
    return [
      card.bloomLevel && `${card.bloomLevel} holomem`,
      color,
      hp && `HP ${hp}`,
    ].filter(Boolean).join(" - ").replace(" - HP", ", HP");
  }
  if (type.toLowerCase() === "oshi") {
    return [
      "Oshi",
      color,
      card.life && `LIFE ${card.life}`,
    ].filter(Boolean).join(" - ").replace(" - LIFE", ", LIFE");
  }
  return type || "Hololive Card";
}

function formatHololiveText(text) {
  return String(text || "")
    .replaceAll("■", "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function hasWeissCounters(card) {
  const type = String(card.cardType || card.section || "").toLowerCase();
  return type.includes("character");
}

function isHololiveEquipable(card) {
  const type = String(card.cardType || "").toLowerCase();
  return type.includes("support") && (type.includes("mascot") || type.includes("fan") || type.includes("tool"));
}

function riftboundTtsTags(card) {
  const section = normalizeDeckSection(card, "Riftbound");
  if (section === "Legend") return ["Legend"];
  if (section === "Champion") return ["Champion", "Chosen Champion"];
  if (section === "Runes") return ["Rune"];
  if (section === "Battlefields") return ["Battlefield"];
  if (section === "Sideboard") return ["Sideboard"];
  return [];
}

function gameNameForTts(game) {
  if (game === "union-arena") return "Union Arena (EN)";
  if (game === "riftbound") return "Riftbound";
  return game;
}

function weissPowerValue(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function relativeAssetPath(path) {
  return relative(resolve("."), resolve(path)).split(sep).join("/");
}

function shortHash(value) {
  return createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function safeFileName(value) {
  return String(value || "deck").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim() || "deck";
}

function ttsGuid() {
  return randomUUID().replaceAll("-", "").slice(0, 6);
}
