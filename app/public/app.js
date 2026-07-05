const state = {
  decks: [],
  selectedId: "",
  resolved: null,
  builderCards: [],
  builderResults: [],
  builderSeries: [],
  hololiveSets: [],
  collection: { cards: {} },
  collectionResults: [],
};

const BUILDER_FILTER_OPTIONS = {
  "Weiss Schwarz": {
    types: [["", "All"], ["Character", "Character"], ["Event", "Event"], ["Climax", "Climax"]],
    colors: [["", "All"], ["yellow", "Yellow"], ["green", "Green"], ["red", "Red"], ["blue", "Blue"]],
  },
  "Hololive OCG": {
    types: [["", "All"], ["Oshi", "Oshi"], ["holomem", "Holomem"], ["Support", "Support"], ["Cheer", "Cheer"]],
    colors: [["", "All"], ["Y", "Yellow"], ["G", "Green"], ["R", "Red"], ["B", "Blue"], ["W", "White"], ["P", "Purple"]],
  },
};

const el = {
  search: document.querySelector("#search"),
  gameFilter: document.querySelector("#gameFilter"),
  deckList: document.querySelector("#deckList"),
  deckTitle: document.querySelector("#deckTitle"),
  deckMeta: document.querySelector("#deckMeta"),
  newDeckBtn: document.querySelector("#newDeckBtn"),
  saveDeckBtn: document.querySelector("#saveDeckBtn"),
  deleteDeckBtn: document.querySelector("#deleteDeckBtn"),
  builderBtn: document.querySelector("#builderBtn"),
  collectionBtn: document.querySelector("#collectionBtn"),
  ttsBtn: document.querySelector("#ttsBtn"),
  settingsBtn: document.querySelector("#settingsBtn"),
  nameInput: document.querySelector("#nameInput"),
  gameInput: document.querySelector("#gameInput"),
  statusInput: document.querySelector("#statusInput"),
  tagsInput: document.querySelector("#tagsInput"),
  imageUrlInput: document.querySelector("#imageUrlInput"),
  sourceUrlInput: document.querySelector("#sourceUrlInput"),
  notesInput: document.querySelector("#notesInput"),
  deckUrlInput: document.querySelector("#deckUrlInput"),
  encoreBtn: document.querySelector("#encoreBtn"),
  decklogBtn: document.querySelector("#decklogBtn"),
  deckText: document.querySelector("#deckText"),
  resolveBtn: document.querySelector("#resolveBtn"),
  importStatus: document.querySelector("#importStatus"),
  summaryStats: document.querySelector("#summaryStats"),
  missingCardsPanel: document.querySelector("#missingCardsPanel"),
  cardGrid: document.querySelector("#cardGrid"),
  log: document.querySelector("#log"),
  cardModal: document.querySelector("#cardModal"),
  closeCardModal: document.querySelector("#closeCardModal"),
  modalCardName: document.querySelector("#modalCardName"),
  modalCardNumber: document.querySelector("#modalCardNumber"),
  modalCardImageWrap: document.querySelector("#modalCardImageWrap"),
  modalCardDetails: document.querySelector("#modalCardDetails"),
  modalCardText: document.querySelector("#modalCardText"),
  settingsModal: document.querySelector("#settingsModal"),
  closeSettingsModal: document.querySelector("#closeSettingsModal"),
  buildWeissDbBtn: document.querySelector("#buildWeissDbBtn"),
  buildHololiveDbBtn: document.querySelector("#buildHololiveDbBtn"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  ttsJsonExportDirInput: document.querySelector("#ttsJsonExportDirInput"),
  settingsLog: document.querySelector("#settingsLog"),
  builderModal: document.querySelector("#builderModal"),
  closeBuilderModal: document.querySelector("#closeBuilderModal"),
  builderHeading: document.querySelector("#builderHeading"),
  builderSubheading: document.querySelector("#builderSubheading"),
  builderGameInput: document.querySelector("#builderGameInput"),
  builderSearchInput: document.querySelector("#builderSearchInput"),
  builderSeriesLabel: document.querySelector("#builderSeriesLabel"),
  builderSeriesSelect: document.querySelector("#builderSeriesSelect"),
  builderSeriesButton: document.querySelector("#builderSeriesButton"),
  builderSeriesMenu: document.querySelector("#builderSeriesMenu"),
  builderSearchBtn: document.querySelector("#builderSearchBtn"),
  builderTypeFilter: document.querySelector("#builderTypeFilter"),
  builderColorFilter: document.querySelector("#builderColorFilter"),
  builderLevelLabel: document.querySelector("#builderLevelLabel"),
  builderLevelMin: document.querySelector("#builderLevelMin"),
  builderLevelMax: document.querySelector("#builderLevelMax"),
  builderCostMin: document.querySelector("#builderCostMin"),
  builderCostMax: document.querySelector("#builderCostMax"),
  builderPowerMin: document.querySelector("#builderPowerMin"),
  builderPowerMax: document.querySelector("#builderPowerMax"),
  builderSoulMin: document.querySelector("#builderSoulMin"),
  builderSoulMax: document.querySelector("#builderSoulMax"),
  builderTriggerFilter: document.querySelector("#builderTriggerFilter"),
  builderHideAltCards: document.querySelector("#builderHideAltCards"),
  builderClearFiltersBtn: document.querySelector("#builderClearFiltersBtn"),
  builderResultCount: document.querySelector("#builderResultCount"),
  builderDeckCount: document.querySelector("#builderDeckCount"),
  builderResults: document.querySelector("#builderResults"),
  builderValidation: document.querySelector("#builderValidation"),
  builderDeckList: document.querySelector("#builderDeckList"),
  builderClearBtn: document.querySelector("#builderClearBtn"),
  builderApplyBtn: document.querySelector("#builderApplyBtn"),
  collectionModal: document.querySelector("#collectionModal"),
  closeCollectionModal: document.querySelector("#closeCollectionModal"),
  collectionGameFilter: document.querySelector("#collectionGameFilter"),
  collectionSeriesLabel: document.querySelector("#collectionSeriesLabel"),
  collectionSeriesSelect: document.querySelector("#collectionSeriesSelect"),
  collectionSeriesButton: document.querySelector("#collectionSeriesButton"),
  collectionSeriesMenu: document.querySelector("#collectionSeriesMenu"),
  collectionViewFilter: document.querySelector("#collectionViewFilter"),
  collectionSearchInput: document.querySelector("#collectionSearchInput"),
  collectionSearchBtn: document.querySelector("#collectionSearchBtn"),
  collectionTypeFilter: document.querySelector("#collectionTypeFilter"),
  collectionColorFilter: document.querySelector("#collectionColorFilter"),
  collectionLevelMin: document.querySelector("#collectionLevelMin"),
  collectionLevelMax: document.querySelector("#collectionLevelMax"),
  collectionCostMin: document.querySelector("#collectionCostMin"),
  collectionCostMax: document.querySelector("#collectionCostMax"),
  collectionPowerMin: document.querySelector("#collectionPowerMin"),
  collectionPowerMax: document.querySelector("#collectionPowerMax"),
  collectionSoulMin: document.querySelector("#collectionSoulMin"),
  collectionSoulMax: document.querySelector("#collectionSoulMax"),
  collectionTriggerFilter: document.querySelector("#collectionTriggerFilter"),
  collectionHideAltCards: document.querySelector("#collectionHideAltCards"),
  collectionClearFiltersBtn: document.querySelector("#collectionClearFiltersBtn"),
  collectionResultCount: document.querySelector("#collectionResultCount"),
  collectionGrid: document.querySelector("#collectionGrid"),
};

await boot();

el.search.addEventListener("input", renderDeckList);
el.gameFilter.addEventListener("change", renderDeckList);
el.newDeckBtn.addEventListener("click", newDeck);
el.saveDeckBtn.addEventListener("click", saveDeck);
el.deleteDeckBtn.addEventListener("click", deleteSelectedDeck);
el.builderBtn.addEventListener("click", openBuilderModal);
el.collectionBtn.addEventListener("click", openCollectionModal);
el.resolveBtn.addEventListener("click", resolveDeckText);
el.encoreBtn.addEventListener("click", fillFromEncore);
el.decklogBtn.addEventListener("click", fillFromDecklog);
el.ttsBtn.addEventListener("click", generateTts);
el.settingsBtn.addEventListener("click", openSettingsModal);
el.closeCardModal.addEventListener("click", closeCardModal);
el.closeSettingsModal.addEventListener("click", closeSettingsModal);
el.buildWeissDbBtn.addEventListener("click", buildWeissCardDb);
el.buildHololiveDbBtn.addEventListener("click", buildHololiveCardDb);
el.saveSettingsBtn.addEventListener("click", saveSettings);
el.closeBuilderModal.addEventListener("click", closeBuilderModal);
el.builderGameInput.addEventListener("change", switchBuilderGame);
el.builderSearchBtn.addEventListener("click", searchBuilderCards);
el.builderSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchBuilderCards();
});
el.builderSeriesSelect.addEventListener("change", searchBuilderCards);
el.builderSeriesButton.addEventListener("click", toggleBuilderSeriesMenu);
el.builderSeriesMenu.addEventListener("click", selectBuilderSeriesFromMenu);
for (const input of builderFilterInputs()) input.addEventListener("change", searchBuilderCards);
el.builderClearFiltersBtn.addEventListener("click", clearBuilderFilters);
el.builderClearBtn.addEventListener("click", clearBuilderDeck);
el.builderApplyBtn.addEventListener("click", applyBuilderDeck);
el.closeCollectionModal.addEventListener("click", closeCollectionModal);
el.collectionSearchBtn.addEventListener("click", searchCollectionCards);
el.collectionSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchCollectionCards();
});
el.collectionGameFilter.addEventListener("change", switchCollectionGame);
el.collectionViewFilter.addEventListener("change", searchCollectionCards);
el.collectionSeriesButton.addEventListener("click", toggleCollectionSeriesMenu);
el.collectionSeriesMenu.addEventListener("click", selectCollectionSeriesFromMenu);
for (const input of collectionFilterInputs()) input.addEventListener("change", searchCollectionCards);
el.collectionClearFiltersBtn.addEventListener("click", clearCollectionFilters);
el.cardModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-card]")) closeCardModal();
});
el.settingsModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-settings]")) closeSettingsModal();
});
el.builderModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-builder]")) closeBuilderModal();
});
document.addEventListener("click", (event) => {
  if (!el.builderSeriesMenu.hidden && !event.target.closest(".builder-series-field")) closeBuilderSeriesMenu();
  if (!el.collectionSeriesMenu.hidden && !event.target.closest(".builder-series-field")) closeCollectionSeriesMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!el.builderSeriesMenu.hidden) {
    closeBuilderSeriesMenu();
    return;
  }
  if (!el.cardModal.hidden) {
    closeCardModal();
    return;
  }
  if (!el.settingsModal.hidden) {
    closeSettingsModal();
    return;
  }
  if (!el.collectionModal.hidden) {
    closeCollectionModal();
    return;
  }
  if (!el.builderModal.hidden) closeBuilderModal();
});

async function boot() {
  await api("/api/health");
  await loadSettings();
  await loadCollection();
  await loadDecks();
  if (state.decks[0]) selectDeck(state.decks[0].id);
  else newDeck();
}

async function loadSettings() {
  const result = await api("/api/settings");
  el.ttsJsonExportDirInput.value = result.settings?.ttsJsonExportDir || "";
}

async function loadDecks() {
  const result = await api("/api/decks");
  state.decks = result.decks || [];
  renderDeckList();
}

async function loadCollection() {
  const result = await api("/api/collection");
  state.collection = result.collection || { cards: {} };
}

function renderDeckList() {
  const search = el.search.value.trim().toLowerCase();
  const game = el.gameFilter.value;
  const decks = state.decks
    .filter((deck) => game === "All Games" || deck.game === game)
    .filter((deck) => !search || deckSearch(deck).includes(search))
    .sort((a, b) => `${a.game} ${a.name}`.localeCompare(`${b.game} ${b.name}`));

  el.deckList.innerHTML = decks.map((deck) => `
    <article class="deck-item ${deck.id === state.selectedId ? "active" : ""}" data-id="${escapeAttr(deck.id)}">
      ${deck.imageUrl ? `<img class="deck-thumb" src="${escapeAttr(deck.imageUrl)}" alt="">` : `<div class="deck-thumb"></div>`}
      <div>
        <div class="deck-name">${escapeHtml(deck.name)}</div>
        <div class="deck-sub">${escapeHtml(deck.game)}<br>${escapeHtml(deck.status)} - ${escapeHtml(countSummary(deck))}</div>
      </div>
    </article>
  `).join("");

  for (const item of el.deckList.querySelectorAll(".deck-item")) {
    item.addEventListener("click", () => selectDeck(item.dataset.id));
  }
}

function selectDeck(id) {
  state.selectedId = id;
  state.resolved = null;
  const deck = selectedDeck();
  if (!deck) return;

  el.nameInput.value = deck.name || "";
  el.gameInput.value = deck.game || "Weiss Schwarz";
  el.statusInput.value = deck.status || "Testing";
  el.tagsInput.value = deck.tags || "";
  el.imageUrlInput.value = deck.imageUrl || "";
  el.sourceUrlInput.value = deck.sourceUrl || "";
  el.notesInput.value = deck.notes || "";
  el.deckText.value = "";

  renderDeckList();
  renderDeck(deck);
  log("");
}

function newDeck() {
  state.selectedId = "";
  state.resolved = null;
  el.nameInput.value = "";
  el.gameInput.value = "Weiss Schwarz";
  el.statusInput.value = "Testing";
  el.tagsInput.value = "";
  el.imageUrlInput.value = "";
  el.sourceUrlInput.value = "";
  el.notesInput.value = "";
  el.deckText.value = "";
  el.importStatus.classList.remove("bad");
  renderDeck(emptyDeck());
  renderDeckList();
  log("Paste a Weiss decklist, or fill it from Encore/Decklog, then import the decklist.");
}

async function resolveDeckText() {
  setBusy(el.resolveBtn, true, "Resolving...");
  try {
    const result = await api("/api/weiss/resolve", { deckText: el.deckText.value });
    state.resolved = result;
    el.importStatus.textContent = result.missing.length
      ? `${result.missing.length} missing cards`
      : `Resolved ${result.totalCards} cards`;
    el.importStatus.classList.toggle("bad", Boolean(result.missing.length));
    renderDeck({ ...formDeck(), cards: result.cards });
    if (result.missing.length) {
      log(`Missing:\n${result.missing.map((item) => `line ${item.line}: ${item.number}`).join("\n")}`);
    } else {
      log(result.ambiguous.length ? `Imported with ${result.ambiguous.length} fallback(s).` : "Decklist imported cleanly.");
    }
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.resolveBtn, false, "Import Decklist");
  }
}

async function fillFromEncore() {
  setBusy(el.encoreBtn, true, "Filling...");
  try {
    const result = await api("/api/weiss/encore", { url: el.deckUrlInput.value });
    if (!result.ok) throw new Error(result.error || "Encore import failed.");
    el.deckText.value = result.deckText;
    el.nameInput.value ||= result.deckName;
    el.sourceUrlInput.value = el.deckUrlInput.value;
    el.importStatus.textContent = `Filled ${result.cards} cards from Encore`;
    log("Decklist box filled from Encore. Click Import Decklist when it looks right.");
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.encoreBtn, false, "Fill Encore");
  }
}

async function fillFromDecklog() {
  setBusy(el.decklogBtn, true, "Filling...");
  try {
    const result = await api("/api/decklog/import", { url: el.deckUrlInput.value });
    if (!result.ok) throw new Error(result.error || "Decklog import failed.");
    if (result.detectedGame && result.detectedGame !== "Unknown") {
      el.gameInput.value = result.detectedGame;
    }
    const isHololive = result.detectedGame === "Hololive OCG";
    el.deckText.value = result.deckText;
    el.nameInput.value ||= result.deckName;
    el.sourceUrlInput.value = el.deckUrlInput.value;
    if (isHololive && result.resolvedCards?.length) {
      state.resolved = {
        cards: result.resolvedCards,
        totalCards: result.cards,
        uniqueCards: result.uniqueCards,
        missing: [],
        ambiguous: [],
      };
      renderDeck({ ...formDeck(), cards: result.resolvedCards });
    }
    el.importStatus.textContent = `Filled ${result.cards} cards from Decklog`;
    log(isHololive
      ? "Hololive Decklog imported. Review the decklist box, then Save."
      : "Decklist box filled from Decklog. Click Import Decklist when it looks right.");
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.decklogBtn, false, "Fill Decklog");
  }
}

async function saveDeck() {
  const deck = formDeck();
  if (!deck.name.trim()) {
    log("Deck name is required.", true);
    return;
  }

  if (state.resolved?.cards?.length) {
    deck.cards = state.resolved.cards;
  } else if (selectedDeck()?.cards?.length) {
    deck.cards = selectedDeck().cards;
  }

  setBusy(el.saveDeckBtn, true, "Saving...");
  try {
    const result = await api("/api/decks", deck);
    await loadDecks();
    selectDeck(result.deck.id);
    log("Saved.");
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.saveDeckBtn, false, "Save");
  }
}

async function deleteSelectedDeck() {
  const deck = selectedDeck();
  if (!deck) return;
  if (!confirm(`Delete "${deck.name}"?`)) return;
  await fetch(`/api/decks/${encodeURIComponent(deck.id)}`, { method: "DELETE" });
  await loadDecks();
  if (state.decks[0]) selectDeck(state.decks[0].id);
  else newDeck();
}

async function generateTts() {
  const deck = selectedDeck();
  if (!deck) {
    log("Save the deck before generating TTS output.", true);
    return;
  }

  setBusy(el.ttsBtn, true, "Generating...");
  try {
    const result = await api("/api/tts/weiss", { deckId: deck.id });
    if (!result.ok) throw new Error(result.error || "TTS generation failed.");
    log([
      `Generated ${result.cards} cards across ${result.sheets} sheet(s).`,
      `Saved object: ${result.outputPath}`,
      `Next steps: ${result.readmePath}`,
      ...result.sheetUrls.map((url) => `Sheet: ${url}`),
    ].join("\n"));
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.ttsBtn, false, "TTS");
  }
}

function renderDeck(deck) {
  const counts = deckCounts(deck);
  el.deckTitle.textContent = deck.name || "Unsaved deck";
  el.deckMeta.textContent = `${deck.game || "Weiss Schwarz"} - ${deck.status || "Testing"} - ${countSummary(deck)}`;

  const cards = [...(deck.cards || [])].sort((a, b) => Number(isClimax(a)) - Number(isClimax(b)) || a.number.localeCompare(b.number));
  renderSummaryStats(deck, counts, cards.length);
  renderMissingCards(deck);

  el.cardGrid.innerHTML = cards.map((card, index) => `
    <article class="card ${isClimax(card) ? "climax" : ""}" data-card-index="${index}" tabindex="0">
      <div class="card-media">
        ${card.imageUrl ? `<img src="${escapeAttr(card.imageUrl)}" alt="">` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">x${card.qty} ${escapeHtml(card.name)}</div>
        <div class="card-meta">${escapeHtml(card.number)}<br>${escapeHtml(card.cardType || card.section || "")} ${escapeHtml(card.color || "")}</div>
      </div>
    </article>
  `).join("");

  for (const tile of el.cardGrid.querySelectorAll(".card")) {
    tile.addEventListener("click", () => openCardModal(cards[Number(tile.dataset.cardIndex)]));
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCardModal(cards[Number(tile.dataset.cardIndex)]);
      }
    });
  }
}

function renderMissingCards(deck) {
  if (!deck.cards?.length) {
    el.missingCardsPanel.innerHTML = "";
    return;
  }

  const missing = deckMissingFromCollection(deck);
  if (!missing.length) {
    el.missingCardsPanel.innerHTML = `
      <details class="missing-details">
        <summary><strong>Collection</strong><span class="ok">You own everything in this deck.</span></summary>
      </details>
    `;
    return;
  }

  const total = missing.reduce((sum, card) => sum + card.missingQty, 0);
  el.missingCardsPanel.innerHTML = `
    <details class="missing-details">
      <summary><strong>Needs buying</strong><span>${total} cards across ${missing.length} unique</span></summary>
      <div class="missing-list">
        ${missing.map((card) => `
          <div>
            <span>x${card.missingQty}</span>
            <strong>${escapeHtml(card.name)}</strong>
            <small>${escapeHtml(card.number)} - own ${card.ownedQty}/${card.required}</small>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function deckMissingFromCollection(deck) {
  const owned = state.collection.cards || {};
  return (deck.cards || [])
    .map((card) => {
      const required = Number(card.qty || 0);
      const ownedQty = Number(owned[card.number] || 0);
      return { ...card, required, ownedQty, missingQty: Math.max(0, required - ownedQty) };
    })
    .filter((card) => card.missingQty > 0)
    .sort((a, b) => a.number.localeCompare(b.number));
}

function renderSummaryStats(deck, counts, uniqueCards) {
  const stats = deck.game === "Hololive OCG"
    ? [
        ["Oshi", counts.oshi],
        ["Main", counts.main],
        ["Cheer", counts.cheer],
        ["Unique", uniqueCards],
      ]
    : [
        ["Total", counts.total],
        ["Unique", uniqueCards],
        ["Missing", state.resolved?.missing?.length || 0],
        ["Fallbacks", state.resolved?.ambiguous?.length || 0],
      ];

  el.summaryStats.innerHTML = stats.map(([label, value]) => `
    <div class="stat"><span>${Number(value || 0).toLocaleString()}</span><small>${escapeHtml(label)}</small></div>
  `).join("");
}

function openCardModal(card) {
  if (!card) return;

  el.modalCardName.textContent = card.name || "Unknown card";
  el.modalCardNumber.textContent = `x${card.qty || 1} ${card.number || ""}`;
  el.modalCardImageWrap.classList.toggle("climax", isClimax(card));
  el.modalCardImageWrap.innerHTML = card.imageUrl ? `<img src="${escapeAttr(card.imageUrl)}" alt="">` : "No image";

  const details = [
    ["Type", card.cardType || card.section],
    ["Color", card.color],
    ["Level", card.level],
    ["Cost", card.cost],
    ["Power", card.power],
    ["Soul", card.soul],
    ["Trigger", card.trigger],
    ["Rarity", card.rarity],
    ["LIFE", card.life],
    ["Bloom", card.bloomLevel],
    ["HP", card.hp],
    ["Baton Pass", card.batonPass],
    ["Card Set", card.cardSet],
    ["Tags", card.tags],
  ].filter(([, value]) => String(value || "").trim());

  el.modalCardDetails.innerHTML = details.map(([label, value]) => `
    <dt>${escapeHtml(label)}</dt>
    <dd>${detailValueHtml(card, label, value)}</dd>
  `).join("") + (card.detailUrl ? `
    <dt>Link</dt>
    <dd><a href="${escapeAttr(card.detailUrl)}" target="_blank" rel="noopener noreferrer">Official Site</a></dd>
  ` : "");

  el.modalCardText.innerHTML = cardRulesHtml(card);
  el.cardModal.classList.toggle("over-builder", !el.builderModal.hidden || !el.collectionModal.hidden);
  el.cardModal.hidden = false;
}

function closeCardModal() {
  el.cardModal.classList.remove("over-builder");
  el.cardModal.hidden = true;
}

function cardRulesHtml(card) {
  const lines = [];

  if (card.text) lines.push(card.text);

  for (const keyword of card.keywords || []) {
    const header = [keyword.type, keyword.name].filter(Boolean).join(": ");
    lines.push([header, keyword.text].filter(Boolean).join("\n"));
  }

  for (const art of card.arts || []) {
    const cost = Array.isArray(art.cost) && art.cost.length ? `[${art.cost.map(normalizeEnergyToken).join(" ")}] ` : "";
    const damage = art.damage ? ` ${art.damage}` : "";
    const special = art.special ? ` ${normalizeEnergyText(art.special)}` : "";
    const header = `${cost}${art.name || "Art"}${damage}${special}`.trim();
    lines.push([header, art.text].filter(Boolean).join("\n"));
  }

  for (const skill of card.oshiSkills || []) {
    const header = [skill.label, skill.name].filter(Boolean).join(": ");
    lines.push([header, skill.text].filter(Boolean).join("\n"));
  }

  const extraText = card.extraText || card.extra?.text || "";
  if (extraText) lines.push([card.extra?.label || "Extra", extraText].join("\n"));

  const text = lines.filter(Boolean).join("\n\n") || "No card text stored.";
  return isHololiveCard(card) ? energyHtml(text) : escapeHtml(text);
}

function detailValueHtml(card, label, value) {
  if (isHololiveCard(card) && ["Baton Pass", "Tags"].includes(label)) return energyHtml(value);
  return escapeHtml(value);
}

function isHololiveCard(card) {
  return card.game === "Hololive OCG"
    || Array.isArray(card.arts)
    || Array.isArray(card.keywords)
    || Boolean(card.batonPass || card.bloomLevel || card.hp || card.life || card.extraText);
}

function energyHtml(value) {
  return escapeHtml(normalizeEnergyText(value)).replace(/\b([RGBYPW])(\+50)?\b/g, (_, code, bonus) =>
    `<span class="energy energy-${code}">${code}${bonus || ""}</span>`
  );
}

function normalizeEnergyText(value) {
  return String(value || "")
    .replaceAll("赤", "R")
    .replaceAll("青", "B")
    .replaceAll("緑", "G")
    .replaceAll("黄", "Y")
    .replaceAll("紫", "P")
    .replaceAll("白", "W")
    .replaceAll("◇", "W");
}

function normalizeEnergyToken(value) {
  return normalizeEnergyText(value).trim();
}

function openSettingsModal() {
  el.settingsLog.textContent = "";
  el.settingsModal.hidden = false;
}

function closeSettingsModal() {
  el.settingsModal.hidden = true;
}

async function buildWeissCardDb() {
  setBusy(el.buildWeissDbBtn, true, "Building...");
  el.settingsLog.textContent = "Building Weiss card database. This can take a few minutes...";

  try {
    const result = await api("/api/weiss/build-db", {});
    renderBuildJob(result.job);

    while (true) {
      await sleep(1500);
      const status = await api("/api/weiss/build-db/status");
      const job = status.job;
      renderBuildJob(job);

      if (!job || job.status !== "running") {
        break;
      }
    }
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.buildWeissDbBtn, false, "Build Weiss Card DB");
  }
}

async function saveSettings() {
  setBusy(el.saveSettingsBtn, true, "Saving...");
  try {
    const result = await api("/api/settings", {
      ttsJsonExportDir: el.ttsJsonExportDirInput.value.trim(),
    });
    el.ttsJsonExportDirInput.value = result.settings?.ttsJsonExportDir || "";
    el.settingsLog.textContent = "Settings saved.";
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.saveSettingsBtn, false, "Save Settings");
  }
}

async function buildHololiveCardDb() {
  setBusy(el.buildHololiveDbBtn, true, "Building...");
  el.settingsLog.textContent = "Building Hololive card database. This can take a few minutes...";

  try {
    const result = await api("/api/hololive/build-db", {});
    renderBuildJob(result.job, "hololive");

    while (true) {
      await sleep(1500);
      const status = await api("/api/hololive/build-db/status");
      const job = status.job;
      renderBuildJob(job, "hololive");

      if (!job || job.status !== "running") break;
    }
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.buildHololiveDbBtn, false, "Build Hololive Card DB");
  }
}

function renderBuildJob(job, game = "weiss") {
  if (!job) {
    el.settingsLog.textContent = "No build has started.";
    return;
  }

  const countKey = game === "hololive" ? "hololiveCards" : "weissCards";
  const gameName = game === "hololive" ? "Hololive" : "Weiss";
  const heading = job.status === "complete"
    ? `${gameName} build complete: ${Number(job[countKey] || 0).toLocaleString()} cards.`
    : job.status === "failed"
      ? `${gameName} build failed: ${job.error || "Unknown error"}`
      : `${gameName} build running...`;

  el.settingsLog.textContent = [heading, "", job.log || ""].join("\n").trim();
}

async function openBuilderModal() {
  const game = el.gameInput.value === "Hololive OCG" ? "Hololive OCG" : "Weiss Schwarz";
  el.gameInput.value = game;
  el.builderGameInput.value = game;
  const current = state.resolved?.cards?.length ? state.resolved.cards : selectedDeck()?.cards || [];
  state.builderCards = current
    .filter((card) => (card.game || game) === game)
    .map((card) => ({ ...card, qty: Number(card.qty || 1) }));
  el.builderModal.hidden = false;
  await loadBuilderSeries();
  await loadHololiveSets();
  renderBuilderSeriesOptions();
  el.builderSeriesSelect.value = builderSeriesId();
  syncBuilderGameUi();
  if (game === "Hololive OCG" && !hasHololiveOshi(state.builderCards)) {
    clearBuilderFilters(false);
    primeHololiveOshiFilter();
  }
  syncBuilderSeriesButton();
  renderBuilderDeck();
  searchBuilderCards();
}

function closeBuilderModal() {
  closeBuilderSeriesMenu();
  el.builderModal.hidden = true;
}

async function searchBuilderCards() {
  setBusy(el.builderSearchBtn, true, "Searching...");
  try {
    const params = new URLSearchParams({
      game: el.builderGameInput.value,
      q: el.builderSearchInput.value.trim(),
      title: el.builderSeriesSelect.value,
    });
    appendBuilderFilterParams(params);
    const result = el.builderGameInput.value === "Hololive OCG"
      ? await api(`/api/collection/cards/search?${params.toString()}`)
      : await api(`/api/weiss/search?${params.toString()}`);
    state.builderResults = result.cards || [];
    renderBuilderResults();
  } catch (error) {
    el.builderResults.innerHTML = `<div class="builder-note bad">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(el.builderSearchBtn, false, "Search");
  }
}

async function loadBuilderSeries() {
  if (state.builderSeries.length) return;
  const result = await api("/api/weiss/series");
  state.builderSeries = result.series || [];
  renderBuilderSeriesOptions();
}

function renderBuilderSeriesOptions() {
  const current = el.builderSeriesSelect.value || builderSeriesId();
  const options = builderSeriesOptions();
  const label = builderSeriesKind();
  el.builderSeriesLabel.textContent = label;
  el.builderSeriesSelect.innerHTML = [
    `<option value="">All ${label.toLowerCase()}</option>`,
    ...options.map((series) => {
      const optionLabel = builderSeriesLabel(series);
      return `<option value="${escapeAttr(series.id || series.code || series.name)}">${escapeHtml(optionLabel)}</option>`;
    }),
  ].join("");
  el.builderSeriesMenu.innerHTML = [
    `<button type="button" data-builder-series="">All ${label.toLowerCase()}</button>`,
    ...options.map((series) => {
      const optionLabel = builderSeriesLabel(series);
      return `<button type="button" data-builder-series="${escapeAttr(series.id || series.code || series.name)}">${escapeHtml(optionLabel)}</button>`;
    }),
  ].join("");
  el.builderSeriesSelect.value = [...el.builderSeriesSelect.options].some((option) => option.value === current) ? current : "";
  syncBuilderSeriesButton();
}

function builderSeriesLabel(series) {
  return `${series.name || series.code} - ${Number(series.cards || 0).toLocaleString()} cards`;
}

function builderSeriesOptions() {
  return el.builderGameInput.value === "Hololive OCG" ? state.hololiveSets : state.builderSeries;
}

function builderSeriesKind() {
  return el.builderGameInput.value === "Hololive OCG" ? "Card set" : "Series";
}

async function switchBuilderGame() {
  el.gameInput.value = el.builderGameInput.value;
  if (el.builderGameInput.value === "Hololive OCG") await loadHololiveSets();
  state.builderCards = state.builderCards.filter((card) => (card.game || el.builderGameInput.value) === el.builderGameInput.value);
  el.builderSeriesSelect.value = "";
  renderBuilderSeriesOptions();
  syncBuilderGameUi();
  clearBuilderFilters(false);
  primeHololiveOshiFilter();
  renderBuilderDeck();
  searchBuilderCards();
}

function syncBuilderGameUi() {
  const isHolo = el.builderGameInput.value === "Hololive OCG";
  el.builderHeading.textContent = isHolo ? "Hololive Deck Builder" : "Weiss Deck Builder";
  el.builderSubheading.textContent = isHolo
    ? "Choose a card set, then build Oshi / Main / Cheer."
    : "Neo-Standard: choose a series, build to 50 cards, max 8 climaxes, max 4 copies.";
  el.builderLevelLabel.textContent = isHolo ? "Bloom" : "Level";
  for (const item of document.querySelectorAll(".builder-weiss-filter")) item.hidden = isHolo;
  syncBuilderFilterOptions();
}

function syncBuilderFilterOptions() {
  const game = el.builderGameInput.value === "Hololive OCG" ? "Hololive OCG" : "Weiss Schwarz";
  const options = BUILDER_FILTER_OPTIONS[game];
  replaceSelectOptions(el.builderTypeFilter, options.types);
  replaceSelectOptions(el.builderColorFilter, options.colors);
}

function replaceSelectOptions(select, options) {
  const current = select.value;
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`)
    .join("");
  select.value = [...select.options].some((option) => option.value === current) ? current : "";
}

function toggleBuilderSeriesMenu(event) {
  event.stopPropagation();
  el.builderSeriesMenu.hidden = !el.builderSeriesMenu.hidden;
}

function closeBuilderSeriesMenu() {
  el.builderSeriesMenu.hidden = true;
}

function selectBuilderSeriesFromMenu(event) {
  const button = event.target.closest("[data-builder-series]");
  if (!button) return;
  el.builderSeriesSelect.value = button.dataset.builderSeries;
  syncBuilderSeriesButton();
  closeBuilderSeriesMenu();
  searchBuilderCards();
}

function syncBuilderSeriesButton() {
  const selected = selectedBuilderSeries();
  el.builderSeriesButton.textContent = selected ? builderSeriesLabel(selected) : `All ${builderSeriesKind().toLowerCase()}`;
}

async function openCollectionModal() {
  el.collectionModal.hidden = false;
  await loadBuilderSeries();
  await loadHololiveSets();
  renderCollectionSeriesOptions();
  syncCollectionFilterVisibility();
  searchCollectionCards();
}

function closeCollectionModal() {
  closeCollectionSeriesMenu();
  el.collectionModal.hidden = true;
}

function renderCollectionSeriesOptions() {
  const current = el.collectionSeriesSelect.value;
  const options = collectionSeriesOptions();
  const label = collectionSeriesKind();
  el.collectionSeriesLabel.textContent = label;
  el.collectionSeriesSelect.innerHTML = [
    `<option value="">All ${label.toLowerCase()}</option>`,
    ...options.map((series) => `<option value="${escapeAttr(series.id || series.code || series.name)}">${escapeHtml(collectionSeriesOptionLabel(series))}</option>`),
  ].join("");
  el.collectionSeriesMenu.innerHTML = [
    `<button type="button" data-collection-series="">All ${label.toLowerCase()}</button>`,
    ...options.map((series) => `<button type="button" data-collection-series="${escapeAttr(series.id || series.code || series.name)}">${escapeHtml(collectionSeriesOptionLabel(series))}</button>`),
  ].join("");
  el.collectionSeriesSelect.value = [...el.collectionSeriesSelect.options].some((option) => option.value === current) ? current : "";
  syncCollectionSeriesButton();
}

async function loadHololiveSets() {
  if (state.hololiveSets.length) return;
  const result = await api("/api/collection/hololive/sets");
  state.hololiveSets = result.sets || [];
}

function collectionSeriesOptions() {
  return el.collectionGameFilter.value === "Hololive OCG" ? state.hololiveSets : state.builderSeries;
}

function collectionSeriesKind() {
  return el.collectionGameFilter.value === "Hololive OCG" ? "Card set" : "Series";
}

function collectionSeriesOptionLabel(series) {
  return `${series.name || series.code} - ${Number(series.cards || 0).toLocaleString()} cards`;
}

function toggleCollectionSeriesMenu(event) {
  event.stopPropagation();
  el.collectionSeriesMenu.hidden = !el.collectionSeriesMenu.hidden;
}

function closeCollectionSeriesMenu() {
  el.collectionSeriesMenu.hidden = true;
}

function selectCollectionSeriesFromMenu(event) {
  const button = event.target.closest("[data-collection-series]");
  if (!button) return;
  el.collectionSeriesSelect.value = button.dataset.collectionSeries;
  syncCollectionSeriesButton();
  closeCollectionSeriesMenu();
  searchCollectionCards();
}

function syncCollectionSeriesButton() {
  const selected = collectionSeriesOptions().find((series) => String(series.id || series.code || series.name) === el.collectionSeriesSelect.value);
  el.collectionSeriesButton.textContent = selected ? collectionSeriesOptionLabel(selected) : `All ${collectionSeriesKind().toLowerCase()}`;
}

async function searchCollectionCards() {
  setBusy(el.collectionSearchBtn, true, "Searching...");
  try {
    const params = new URLSearchParams({
      game: el.collectionGameFilter.value,
      q: el.collectionSearchInput.value.trim(),
      title: el.collectionSeriesSelect.value,
      view: el.collectionViewFilter.value,
    });
    appendCollectionFilterParams(params);
    const result = await api(`/api/collection/cards/search?${params.toString()}`);
    state.collectionResults = result.cards || [];
    renderCollectionCards();
  } catch (error) {
    el.collectionGrid.innerHTML = `<div class="builder-note bad">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(el.collectionSearchBtn, false, "Search");
  }
}

function switchCollectionGame() {
  el.collectionSeriesSelect.value = "";
  renderCollectionSeriesOptions();
  syncCollectionFilterVisibility();
  clearCollectionFilters(false);
  searchCollectionCards();
}

function syncCollectionFilterVisibility() {
  const isWeiss = el.collectionGameFilter.value === "Weiss Schwarz";
  for (const item of document.querySelectorAll(".collection-weiss-filter")) item.hidden = !isWeiss;
}

function collectionFilterInputs() {
  return [
    el.collectionTypeFilter,
    el.collectionColorFilter,
    el.collectionLevelMin,
    el.collectionLevelMax,
    el.collectionCostMin,
    el.collectionCostMax,
    el.collectionPowerMin,
    el.collectionPowerMax,
    el.collectionSoulMin,
    el.collectionSoulMax,
    el.collectionTriggerFilter,
    el.collectionHideAltCards,
  ];
}

function appendCollectionFilterParams(params) {
  const values = {
    type: el.collectionTypeFilter.value,
    color: el.collectionColorFilter.value,
    levelMin: el.collectionLevelMin.value,
    levelMax: el.collectionLevelMax.value,
    costMin: el.collectionCostMin.value,
    costMax: el.collectionCostMax.value,
    powerMin: el.collectionPowerMin.value,
    powerMax: el.collectionPowerMax.value,
    soulMin: el.collectionSoulMin.value,
    soulMax: el.collectionSoulMax.value,
    trigger: el.collectionTriggerFilter.value,
    hideAlt: el.collectionHideAltCards.checked ? "1" : "",
  };

  for (const [key, value] of Object.entries(values)) {
    if (String(value || "").trim()) params.set(key, value);
  }
}

function clearCollectionFilters(search = true) {
  for (const input of collectionFilterInputs()) {
    if (input.type === "checkbox") input.checked = false;
    else input.value = "";
  }
  if (search) searchCollectionCards();
}

function renderCollectionCards() {
  el.collectionResultCount.textContent = `${state.collectionResults.length.toLocaleString()} shown`;
  el.collectionGrid.innerHTML = state.collectionResults.map((card, index) => `
    <article class="collection-card" data-collection-card="${index}" tabindex="0">
      <div class="builder-card-media">
        ${card.imageUrl ? `<img src="${escapeAttr(card.imageUrl)}" alt="">` : ""}
        ${card.ownedQty ? `<span>x${card.ownedQty}</span>` : ""}
      </div>
      <div>
        <strong>${escapeHtml(card.name)}</strong>
        <span>${escapeHtml(card.number)} - ${escapeHtml(card.cardType || "")} ${escapeHtml(card.color || "")}</span>
      </div>
      <div class="collection-controls">
        <button data-collection-minus="${escapeAttr(card.number)}">-</button>
        <input data-collection-qty="${escapeAttr(card.number)}" type="number" min="0" value="${Number(card.ownedQty || 0)}">
        <button data-collection-plus="${escapeAttr(card.number)}">+</button>
      </div>
    </article>
  `).join("") || `<div class="builder-note">No cards found.</div>`;

  for (const tile of el.collectionGrid.querySelectorAll("[data-collection-card]")) {
    tile.addEventListener("click", () => openCardModal({ ...state.collectionResults[Number(tile.dataset.collectionCard)], qty: Number(state.collectionResults[Number(tile.dataset.collectionCard)]?.ownedQty || 0) }));
  }

  for (const button of el.collectionGrid.querySelectorAll("[data-collection-minus]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      changeOwnedQty(button.dataset.collectionMinus, -1);
    });
  }
  for (const button of el.collectionGrid.querySelectorAll("[data-collection-plus]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      changeOwnedQty(button.dataset.collectionPlus, 1);
    });
  }
  for (const input of el.collectionGrid.querySelectorAll("[data-collection-qty]")) {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => setOwnedQty(input.dataset.collectionQty, Number(input.value || 0)));
  }
}

async function changeOwnedQty(number, delta) {
  const current = Number(state.collection.cards?.[number] || 0);
  await setOwnedQty(number, Math.max(0, current + delta));
}

async function setOwnedQty(number, qty) {
  const result = await api("/api/collection/cards", { number, qty });
  state.collection = result.collection || { cards: {} };
  for (const card of state.collectionResults) {
    if (card.number === number) card.ownedQty = Number(state.collection.cards[number] || 0);
  }
  if (el.collectionViewFilter.value === "all") renderCollectionCards();
  else await searchCollectionCards();
  renderDeck(formDeck());
}

function builderFilterInputs() {
  return [
    el.builderTypeFilter,
    el.builderColorFilter,
    el.builderLevelMin,
    el.builderLevelMax,
    el.builderCostMin,
    el.builderCostMax,
    el.builderPowerMin,
    el.builderPowerMax,
    el.builderSoulMin,
    el.builderSoulMax,
    el.builderTriggerFilter,
    el.builderHideAltCards,
  ];
}

function appendBuilderFilterParams(params) {
  const isHolo = el.builderGameInput.value === "Hololive OCG";
  const values = {
    type: el.builderTypeFilter.value,
    color: el.builderColorFilter.value,
    levelMin: el.builderLevelMin.value,
    levelMax: el.builderLevelMax.value,
    costMin: isHolo ? "" : el.builderCostMin.value,
    costMax: isHolo ? "" : el.builderCostMax.value,
    powerMin: isHolo ? "" : el.builderPowerMin.value,
    powerMax: isHolo ? "" : el.builderPowerMax.value,
    soulMin: isHolo ? "" : el.builderSoulMin.value,
    soulMax: isHolo ? "" : el.builderSoulMax.value,
    trigger: isHolo ? "" : el.builderTriggerFilter.value,
    hideAlt: !isHolo && el.builderHideAltCards.checked ? "1" : "",
  };

  for (const [key, value] of Object.entries(values)) {
    if (String(value || "").trim()) params.set(key, value);
  }
}

function clearBuilderFilters(search = true) {
  for (const input of builderFilterInputs()) {
    if (input.type === "checkbox") input.checked = false;
    else input.value = "";
  }
  if (search) searchBuilderCards();
}

function renderBuilderResults() {
  el.builderResultCount.textContent = `${state.builderResults.length.toLocaleString()} shown`;
  el.builderResults.innerHTML = state.builderResults.map((card, index) => {
    const selectedQty = builderQtyFor(card.number);
    return `
    <article class="builder-card ${selectedQty ? "in-deck" : ""}" data-builder-card="${index}" tabindex="0">
      <div class="builder-card-media">
        ${card.imageUrl ? `<img src="${escapeAttr(card.imageUrl)}" alt="">` : ""}
        ${selectedQty ? `<span>x${selectedQty}</span>` : ""}
      </div>
      <div>
        <strong>${escapeHtml(card.name)}</strong>
        <span>${escapeHtml(card.number)} - ${escapeHtml(card.cardType || "")} ${escapeHtml(card.color || "")}</span>
      </div>
      <button data-builder-add="${index}">Add</button>
    </article>
  `;
  }).join("") || `<div class="builder-note">No cards found.</div>`;

  for (const tile of el.builderResults.querySelectorAll("[data-builder-card]")) {
    tile.addEventListener("click", () => openCardModal(normalizeBuilderCard(state.builderResults[Number(tile.dataset.builderCard)])));
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCardModal(normalizeBuilderCard(state.builderResults[Number(tile.dataset.builderCard)]));
      }
    });
  }

  for (const button of el.builderResults.querySelectorAll("[data-builder-add]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      addBuilderCard(state.builderResults[Number(button.dataset.builderAdd)]);
    });
  }
}

function addBuilderCard(card) {
  if (!card) return;
  const existing = state.builderCards.find((item) => item.number === card.number);
  if (existing) existing.qty += 1;
  else state.builderCards.push(normalizeBuilderCard(card));

  if (el.builderGameInput.value !== "Hololive OCG" && !el.builderSeriesSelect.value) {
    el.builderSeriesSelect.value = seriesIdForCodes([titleCode(card.number)]);
  }
  syncBuilderSeriesButton();
  renderBuilderDeck();
  if (el.builderGameInput.value === "Hololive OCG" && isOshiCard(card) && el.builderTypeFilter.value) {
    clearBuilderFilters(false);
    searchBuilderCards();
  } else {
    renderBuilderResults();
  }
}

function changeBuilderQty(number, delta) {
  const card = state.builderCards.find((item) => item.number === number);
  if (!card) return;
  card.qty += delta;
  if (card.qty <= 0) state.builderCards = state.builderCards.filter((item) => item.number !== number);
  renderBuilderDeck();
  renderBuilderResults();
}

function builderQtyFor(number) {
  return Number(state.builderCards.find((card) => card.number === number)?.qty || 0);
}

function renderBuilderDeck() {
  const sorted = [...state.builderCards].sort((a, b) => Number(isClimax(a)) - Number(isClimax(b)) || a.number.localeCompare(b.number));
  const total = sorted.reduce((sum, card) => sum + Number(card.qty || 0), 0);
  el.builderDeckCount.textContent = `${total}/50 cards`;
  el.builderDeckList.innerHTML = sorted.map((card) => `
    <article class="builder-deck-row" data-builder-selected="${escapeAttr(card.number)}" tabindex="0">
      <div class="builder-deck-image">
        ${card.imageUrl ? `<img src="${escapeAttr(card.imageUrl)}" alt="">` : ""}
        <span>x${card.qty}</span>
      </div>
      <div class="builder-deck-copy">
        <strong>${escapeHtml(card.name)}</strong>
        <small>${escapeHtml(card.number)} - ${escapeHtml(card.cardType || "")} ${escapeHtml(card.color || "")}</small>
      </div>
      <div class="builder-deck-controls">
        <button data-builder-minus="${escapeAttr(card.number)}">-</button>
        <button data-builder-plus="${escapeAttr(card.number)}">+</button>
      </div>
    </article>
  `).join("") || `<div class="builder-note">No cards in deck yet.</div>`;

  for (const tile of el.builderDeckList.querySelectorAll("[data-builder-selected]")) {
    tile.addEventListener("click", () => openCardModal(state.builderCards.find((card) => card.number === tile.dataset.builderSelected)));
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCardModal(state.builderCards.find((card) => card.number === tile.dataset.builderSelected));
      }
    });
  }

  for (const button of el.builderDeckList.querySelectorAll("[data-builder-minus]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      changeBuilderQty(button.dataset.builderMinus, -1);
    });
  }
  for (const button of el.builderDeckList.querySelectorAll("[data-builder-plus]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      changeBuilderQty(button.dataset.builderPlus, 1);
    });
  }

  renderBuilderValidation();
}

function renderBuilderValidation() {
  const v = el.builderGameInput.value === "Hololive OCG"
    ? validateHololiveDeck(state.builderCards)
    : validateWeissNeoStandard(state.builderCards, selectedBuilderSeries());
  el.builderValidation.innerHTML = `
    <div class="builder-counts">
      ${v.counts.map((count) => `<span class="${count.ok ? "ok" : "bad"}">${escapeHtml(count.label)}</span>`).join("")}
    </div>
    ${v.issues.length ? `<ul>${v.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : `<div class="ok">${escapeHtml(v.passText)}</div>`}
  `;
}

function validateWeissNeoStandard(cards, selectedSeries) {
  const total = cards.reduce((sum, card) => sum + Number(card.qty || 0), 0);
  const climax = cards.filter(isClimax).reduce((sum, card) => sum + Number(card.qty || 0), 0);
  const titles = [...new Set(cards.map((card) => titleCode(card.number)).filter(Boolean))];
  const allowedCodes = new Set((selectedSeries?.codes || []).map((code) => code.toUpperCase()));
  const outsideSeries = allowedCodes.size ? titles.filter((code) => !allowedCodes.has(code)) : [];
  const issues = [];

  if (total !== 50) issues.push("Deck must contain exactly 50 cards.");
  if (climax > 8) issues.push("Deck may contain at most 8 climax cards.");
  if (outsideSeries.length) issues.push(`These cards are outside ${selectedSeries.name}: ${outsideSeries.join(", ")}.`);
  if (!allowedCodes.size && titles.length > 1) issues.push("Neo-Standard decks may only include cards from one title.");

  for (const card of cards) {
    if (Number(card.qty || 0) > 4) issues.push(`${card.number} has ${card.qty} copies. Maximum is 4.`);
  }

  return {
    total,
    climax,
    title: selectedSeries ? `${selectedSeries.name} (${(selectedSeries.codes || []).join(", ")})` : titles[0] || "",
    titleOk: allowedCodes.size ? outsideSeries.length === 0 : titles.length <= 1,
    counts: [
      { label: `Total ${total}/50`, ok: total === 50 },
      { label: `Climax ${climax}/8`, ok: climax <= 8 },
      { label: `Series ${selectedSeries ? `${selectedSeries.name} (${(selectedSeries.codes || []).join(", ")})` : titles[0] || "-"}`, ok: allowedCodes.size ? outsideSeries.length === 0 : titles.length <= 1 },
    ],
    passText: "Neo-Standard checks pass.",
    issues,
  };
}

function validateHololiveDeck(cards) {
  const counts = deckCounts({ game: "Hololive OCG", cards });
  const issues = [];
  if (counts.oshi !== 1) issues.push("Hololive decks should have exactly 1 Oshi card.");
  if (counts.main !== 50) issues.push("Hololive main deck should contain exactly 50 cards.");
  if (counts.cheer > 20) issues.push("Cheer deck should contain at most 20 cards.");
  for (const card of cards) {
    if (Number(card.qty || 0) > 4 && !isHololiveExtraCard(card)) {
      issues.push(`${card.number} has ${card.qty} copies. Maximum is 4 unless the card has Extra.`);
    }
  }

  return {
    counts: [
      { label: `Oshi ${counts.oshi}/1`, ok: counts.oshi === 1 },
      { label: `Main ${counts.main}/50`, ok: counts.main === 50 },
      { label: `Cheer ${counts.cheer}/20`, ok: counts.cheer <= 20 },
    ],
    passText: "Hololive deck checks pass.",
    issues,
  };
}

function clearBuilderDeck() {
  if (!confirm("Clear builder deck?")) return;
  state.builderCards = [];
  primeHololiveOshiFilter();
  renderBuilderDeck();
  searchBuilderCards();
}

function applyBuilderDeck() {
  const cards = state.builderCards.map((card) => ({ ...card }));
  el.gameInput.value = el.builderGameInput.value;
  state.resolved = {
    cards,
    totalCards: cards.reduce((sum, card) => sum + Number(card.qty || 0), 0),
    uniqueCards: cards.length,
    missing: [],
    ambiguous: [],
  };
  el.deckText.value = cards.map((card) => `${card.number}\t${card.qty}\t${card.name}`).join("\n");
  renderDeck({ ...formDeck(), cards });
  closeBuilderModal();
  log("Builder deck applied. Save the deck to keep it.");
}

function normalizeBuilderCard(card) {
  const game = el.builderGameInput.value;
  return {
    qty: 1,
    number: card.number,
    name: card.name,
    game,
    section: builderSection(card, game),
    cardType: card.cardType || "",
    color: card.color || "",
    level: card.level || "",
    bloomLevel: card.bloomLevel || "",
    cost: card.cost || "",
    power: card.power || "",
    hp: card.hp || "",
    life: card.life || "",
    batonPass: card.batonPass || "",
    soul: card.soul || "",
    trigger: card.trigger || "",
    rarity: card.rarity || "",
    text: card.text || card.abilityText || "",
    cardSet: card.cardSet || "",
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    arts: Array.isArray(card.arts) ? card.arts : [],
    oshiSkills: Array.isArray(card.oshiSkills) ? card.oshiSkills : [],
    extra: card.extra || { label: "", text: "" },
    extraText: card.extraText || card.extra?.text || "",
    isExtra: Boolean(card.isExtra || card.extraText || card.extra?.text),
    tags: card.tags || "",
    tagsList: Array.isArray(card.tagsList) ? card.tagsList : [],
    imageUrl: card.imageUrl || "",
    detailUrl: card.detailUrl || "",
  };
}

function hasHololiveOshi(cards) {
  return cards.some(isOshiCard);
}

function primeHololiveOshiFilter() {
  if (el.builderGameInput.value === "Hololive OCG" && !hasHololiveOshi(state.builderCards)) {
    el.builderTypeFilter.value = "Oshi";
  }
}

function isOshiCard(card) {
  return String(card.cardType || card.section || "").toLowerCase().includes("oshi");
}

function isHololiveExtraCard(card) {
  return Boolean(card.isExtra)
    || /you may include any number/i.test(`${card.extraText || ""} ${card.extra?.text || ""}`);
}

function builderSection(card, game) {
  if (game !== "Hololive OCG") return isClimax(card) ? "Climax" : card.cardType || "Main";
  const type = String(card.cardType || "").toLowerCase();
  if (type.includes("oshi")) return "Oshi";
  if (type.includes("cheer")) return "Cheer";
  return "Main";
}

function builderSeriesId() {
  if (el.builderGameInput.value === "Hololive OCG") {
    const sets = [...new Set(state.builderCards.flatMap((card) => String(card.cardSet || "").split(/\r?\n/).map((set) => set.trim()).filter(Boolean)))];
    const match = state.hololiveSets.find((set) => sets.includes(set.name));
    return match?.id || "";
  }
  const codes = [...new Set(state.builderCards.map((card) => titleCode(card.number)).filter(Boolean))];
  return seriesIdForCodes(codes);
}

function seriesIdForCodes(codes) {
  if (!codes.length) return "";
  const normalized = codes.map((code) => code.toUpperCase());
  const match = state.builderSeries.find((series) => {
    const seriesCodes = new Set((series.codes || [series.code]).map((code) => code.toUpperCase()));
    return normalized.every((code) => seriesCodes.has(code));
  });
  return match?.id || normalized[0];
}

function selectedBuilderSeries() {
  const selected = el.builderSeriesSelect.value;
  return builderSeriesOptions().find((series) => String(series.id || series.code || series.name) === selected) || null;
}

function titleCode(number) {
  return String(number || "").split("/")[0].toUpperCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formDeck() {
  return {
    id: state.selectedId,
    name: el.nameInput.value.trim(),
    game: el.gameInput.value,
    status: el.statusInput.value,
    tags: el.tagsInput.value.trim(),
    imageUrl: el.imageUrlInput.value.trim(),
    sourceUrl: el.sourceUrlInput.value.trim(),
    notes: el.notesInput.value.trim(),
    cards: selectedDeck()?.cards || [],
  };
}

function selectedDeck() {
  return state.decks.find((deck) => deck.id === state.selectedId);
}

function emptyDeck() {
  return { name: "", game: "Weiss Schwarz", status: "Testing", cards: [] };
}

function cardTotal(deck) {
  return (deck.cards || []).reduce((sum, card) => sum + Number(card.qty || 1), 0);
}

function deckCounts(deck) {
  const counts = {
    total: 0,
    main: 0,
    cheer: 0,
    oshi: 0,
    climax: 0,
    displayTotal: 0,
  };

  for (const card of deck.cards || []) {
    const qty = Number(card.qty || 1);
    counts.total += qty;

    const section = String(card.section || "").toLowerCase();
    if (section === "oshi") counts.oshi += qty;
    else if (section === "cheer") counts.cheer += qty;
    else if (isClimax(card)) counts.climax += qty;
    else counts.main += qty;
  }

  counts.displayTotal = deck.game === "Hololive OCG" ? counts.main : counts.total;
  return counts;
}

function countSummary(deck) {
  const counts = deckCounts(deck);
  if (deck.game === "Hololive OCG") {
    return `Main ${counts.main} / Cheer ${counts.cheer} / Oshi ${counts.oshi}`;
  }
  return `${counts.total} cards`;
}

function isClimax(card) {
  return String(card.cardType || card.section || "").toLowerCase().includes("climax");
}

function deckSearch(deck) {
  return [
    deck.name,
    deck.game,
    deck.status,
    deck.tags,
    deck.notes,
    ...(deck.cards || []).flatMap((card) => [card.number, card.name, card.cardType, card.color]),
  ].join(" ").toLowerCase();
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function setBusy(button, busy, text) {
  button.disabled = busy;
  button.textContent = text;
}

function log(message, bad = false) {
  el.log.textContent = message || "";
  el.log.classList.toggle("bad", bad);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
