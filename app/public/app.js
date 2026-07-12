import { deckSectionOrder, normalizeDeckSection, sectionGroupsForGame } from "/shared/deck-sections.mjs";
import { validateHololiveDeck } from "/shared/game-rules/hololive.mjs";
import { validateRiftboundDeck } from "/shared/game-rules/riftbound.mjs";
import { validateUnionArenaDeck } from "/shared/game-rules/union-arena.mjs";
import { filterRestrictionsForGame } from "/shared/game-rules/restrictions.mjs";
import { validateWeissDeck } from "/shared/game-rules/weiss.mjs";

const state = {
  decks: [],
  selectedId: "",
  resolved: null,
  builderCards: [],
  builderResults: [],
  builderResultsTotal: 0,
  builderResultsHasMore: false,
  builderResultsLoading: false,
  builderSeries: [],
  builderJpSeries: [],
  hololiveSets: [],
  hololiveJpSets: [],
  riftboundSets: [],
  unionArenaSets: [],
  unionArenaJpSets: [],
  collection: { cards: {} },
  collectionResults: [],
  collectionResultsTotal: 0,
  collectionResultsHasMore: false,
  collectionResultsLoading: false,
  modalCard: null,
  selectedRestrictionGame: "Weiss Schwarz (EN)",
  settings: { cardGameRestrictions: { lastUpdated: "", entries: [] } },
};

const SEARCH_PAGE_SIZE = 120;

const BUILDER_FILTER_OPTIONS = {
  "Weiss Schwarz (EN)": {
    types: [["", "All"], ["Character", "Character"], ["Event", "Event"], ["Climax", "Climax"]],
    colors: [["", "All"], ["yellow", "Yellow"], ["green", "Green"], ["red", "Red"], ["blue", "Blue"]],
  },
  "Weiss Schwarz (JP)": {
    types: [["", "All"], ["Character", "Character"], ["Event", "Event"], ["Climax", "Climax"]],
    colors: [["", "All"], ["yellow", "Yellow"], ["green", "Green"], ["red", "Red"], ["blue", "Blue"]],
  },
  "Hololive OCG (EN)": {
    types: [["", "All"], ["Oshi", "Oshi"], ["holomem", "Holomem"], ["Support", "Support"], ["Cheer", "Cheer"]],
    colors: [["", "All"], ["Y", "Yellow"], ["G", "Green"], ["R", "Red"], ["B", "Blue"], ["W", "White"], ["P", "Purple"]],
  },
  "Hololive OCG (JP)": {
    types: [["", "All"], ["Oshi", "Oshi"], ["holomem", "Holomem"], ["Support", "Support"], ["Cheer", "Cheer"]],
    colors: [["", "All"], ["Y", "Yellow"], ["G", "Green"], ["R", "Red"], ["B", "Blue"], ["W", "White"], ["P", "Purple"]],
  },
  "Riftbound": {
    types: [["", "All"], ["Unit", "Unit"], ["Spell", "Spell"], ["Rune", "Rune"], ["Gear", "Gear"], ["Legend", "Legend"], ["Battlefield", "Battlefield"], ["Card", "Card"]],
    colors: [["", "All"], ["body", "Body"], ["calm", "Calm"], ["chaos", "Chaos"], ["fury", "Fury"], ["mind", "Mind"], ["order", "Order"]],
  },
  "Union Arena (EN)": {
    types: [["", "All"], ["Character", "Character"], ["Site", "Site"], ["Event", "Event"]],
    colors: [["", "All"], ["Yellow", "Yellow"], ["Purple", "Purple"], ["Red", "Red"], ["Blue", "Blue"], ["Green", "Green"], ["Rainbow", "Rainbow"]],
  },
  "Union Arena (JP)": {
    types: [["", "All"], ["Character", "Character"], ["Site", "Site"], ["Event", "Event"]],
    colors: [["", "All"], ["Yellow", "Yellow"], ["Purple", "Purple"], ["Red", "Red"], ["Blue", "Blue"], ["Green", "Green"], ["Rainbow", "Rainbow"]],
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
  translateBtn: document.querySelector("#translateBtn"),
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
  importUrlBtn: document.querySelector("#importUrlBtn"),
  deckText: document.querySelector("#deckText"),
  weissJpImportInput: document.querySelector("#weissJpImportInput"),
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
  modalCardActions: document.querySelector("#modalCardActions"),
  modalCardText: document.querySelector("#modalCardText"),
  settingsModal: document.querySelector("#settingsModal"),
  closeSettingsModal: document.querySelector("#closeSettingsModal"),
  buildWeissDbBtn: document.querySelector("#buildWeissDbBtn"),
  buildWeissJpDbBtn: document.querySelector("#buildWeissJpDbBtn"),
  buildHololiveDbBtn: document.querySelector("#buildHololiveDbBtn"),
  buildHololiveJpDbBtn: document.querySelector("#buildHololiveJpDbBtn"),
  buildRiftboundDbBtn: document.querySelector("#buildRiftboundDbBtn"),
  buildUnionArenaDbBtn: document.querySelector("#buildUnionArenaDbBtn"),
  buildUnionArenaJpDbBtn: document.querySelector("#buildUnionArenaJpDbBtn"),
  clearImageCacheBtn: document.querySelector("#clearImageCacheBtn"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  ttsJsonExportDirInput: document.querySelector("#ttsJsonExportDirInput"),
  restrictionGameInput: document.querySelector("#restrictionGameInput"),
  restrictionDateInput: document.querySelector("#restrictionDateInput"),
  restrictionsList: document.querySelector("#restrictionsList"),
  addRestrictionBtn: document.querySelector("#addRestrictionBtn"),
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
  collectionSortInput: document.querySelector("#collectionSortInput"),
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
el.translateBtn.addEventListener("click", translateCurrentDeck);
el.resolveBtn.addEventListener("click", resolveDeckText);
el.importUrlBtn.addEventListener("click", importFromUrl);
el.ttsBtn.addEventListener("click", generateTts);
el.settingsBtn.addEventListener("click", openSettingsModal);
el.closeCardModal.addEventListener("click", closeCardModal);
el.closeSettingsModal.addEventListener("click", closeSettingsModal);
el.buildWeissDbBtn.addEventListener("click", buildWeissCardDb);
el.buildWeissJpDbBtn.addEventListener("click", buildWeissJpCardDb);
el.buildHololiveDbBtn.addEventListener("click", buildHololiveCardDb);
el.buildHololiveJpDbBtn.addEventListener("click", buildHololiveJpCardDb);
el.buildRiftboundDbBtn.addEventListener("click", buildRiftboundCardDb);
el.buildUnionArenaDbBtn.addEventListener("click", buildUnionArenaCardDb);
el.buildUnionArenaJpDbBtn.addEventListener("click", buildUnionArenaJpCardDb);
el.clearImageCacheBtn.addEventListener("click", clearImageCache);
el.saveSettingsBtn.addEventListener("click", saveSettings);
el.addRestrictionBtn.addEventListener("click", addRestrictionRow);
el.restrictionsList.addEventListener("click", handleRestrictionListClick);
el.restrictionGameInput.addEventListener("change", switchRestrictionGame);
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
el.builderResults.addEventListener("scroll", maybeLoadMoreBuilderCards);
el.builderClearBtn.addEventListener("click", clearBuilderDeck);
el.builderApplyBtn.addEventListener("click", applyBuilderDeck);
el.closeCollectionModal.addEventListener("click", closeCollectionModal);
el.collectionSearchBtn.addEventListener("click", searchCollectionCards);
el.collectionSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchCollectionCards();
});
el.collectionGameFilter.addEventListener("change", switchCollectionGame);
el.collectionViewFilter.addEventListener("change", searchCollectionCards);
el.collectionSortInput.addEventListener("change", searchCollectionCards);
el.collectionSeriesButton.addEventListener("click", toggleCollectionSeriesMenu);
el.collectionSeriesMenu.addEventListener("click", selectCollectionSeriesFromMenu);
for (const input of collectionFilterInputs()) input.addEventListener("change", searchCollectionCards);
el.collectionClearFiltersBtn.addEventListener("click", clearCollectionFilters);
el.collectionGrid.addEventListener("scroll", maybeLoadMoreCollectionCards);
el.cardModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-card]")) closeCardModal();
});
el.modalCardActions.addEventListener("click", (event) => {
  const proxyButton = event.target.closest("[data-generate-proxy]");
  if (proxyButton) generateProxyForModalCard(proxyButton);
  const unionArenaButton = event.target.closest("[data-render-union-arena]");
  if (unionArenaButton) renderUnionArenaCardForModal(unionArenaButton);
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
  state.settings = result.settings || { cardGameRestrictions: { lastUpdated: "", entries: [] } };
  el.ttsJsonExportDirInput.value = result.settings?.ttsJsonExportDir || "";
  el.restrictionGameInput.value = state.selectedRestrictionGame;
  renderRestrictionsEditor();
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
    .filter((deck) => game === "All Games" || appGame(deck.game) === game)
    .filter((deck) => !search || deckSearch(deck).includes(search))
    .sort((a, b) => `${a.game} ${a.name}`.localeCompare(`${b.game} ${b.name}`));

  el.deckList.innerHTML = decks.map((deck) => `
    <article class="deck-item ${deck.id === state.selectedId ? "active" : ""}" data-id="${escapeAttr(deck.id)}">
      ${deck.imageUrl ? `<img class="deck-thumb" src="${escapeAttr(deck.imageUrl)}" alt="">` : `<div class="deck-thumb"></div>`}
      <div>
        <div class="deck-name">${escapeHtml(deck.name)}</div>
        <div class="deck-sub">${escapeHtml(appGame(deck.game))}<br>${escapeHtml(deck.status)} - ${escapeHtml(countSummary(deck))}</div>
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
  el.gameInput.value = appGame(deck.game || "Weiss Schwarz (EN)");
  el.statusInput.value = deck.status || "Testing";
  el.tagsInput.value = deck.tags || "";
  el.imageUrlInput.value = deck.imageUrl || "";
  el.sourceUrlInput.value = deck.sourceUrl || "";
  el.notesInput.value = deck.notes || "";
  el.deckText.value = "";
  el.weissJpImportInput.checked = appGame(deck.game) === "Weiss Schwarz (JP)" || deck.weissLocale === "jp" || (deck.cards || []).some((card) => card.locale === "jp");

  renderDeckList();
  renderDeck(deck);
  log("");
}

function newDeck() {
  state.selectedId = "";
  state.resolved = null;
  el.nameInput.value = "";
  el.gameInput.value = "Weiss Schwarz (EN)";
  el.statusInput.value = "Testing";
  el.tagsInput.value = "";
  el.imageUrlInput.value = "";
  el.sourceUrlInput.value = "";
  el.notesInput.value = "";
  el.deckText.value = "";
  el.weissJpImportInput.checked = false;
  el.importStatus.classList.remove("bad");
  renderDeck(emptyDeck());
  renderDeckList();
  log("Paste a Weiss decklist, or fill it from Encore/Decklog, then import the decklist.");
}

async function resolveDeckText() {
  setBusy(el.resolveBtn, true, "Resolving...");
  try {
    const locale = el.weissJpImportInput.checked ? "jp" : "en";
    const result = await api("/api/weiss/resolve", { deckText: el.deckText.value, locale });
    state.resolved = result;
    el.gameInput.value = locale === "jp" ? "Weiss Schwarz (JP)" : "Weiss Schwarz (EN)";
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

async function importFromUrl() {
  const value = el.deckUrlInput.value.trim();
  setBusy(el.importUrlBtn, true, "Importing...");
  try {
    await massImportFromUrls(value);
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.importUrlBtn, false, "Import");
  }
}

async function massImportFromUrls(value) {
  const result = await api("/api/import/mass", {
    input: value,
    save: true,
    defaultStatus: el.statusInput.value,
    defaultTags: el.tagsInput.value.trim(),
  });

  if (result.savedDecks?.length) {
    await loadDecks();
    state.selectedId = result.savedDecks.at(-1)?.id || state.selectedId;
    renderDeckList();
  }

  const selected = result.savedDecks?.at(-1) || result.imported?.at(-1)?.deck;
  if (selected) {
    selectImportedDeckPreview(selected);
  }

  const imported = result.imported || [];
  const failed = result.failed || [];
  const missingTotal = imported.reduce((sum, item) => sum + Number(item.missingCount || 0), 0);
  el.importStatus.textContent = `Imported ${imported.length}; failed ${failed.length}; missing ${missingTotal}`;
  el.importStatus.classList.toggle("bad", Boolean(failed.length || missingTotal));

  log(massImportSummary(result), Boolean(failed.length));
}

function selectImportedDeckPreview(deck) {
  el.nameInput.value = deck.name || "";
  el.gameInput.value = appGame(deck.game);
  el.statusInput.value = deck.status || "Testing";
  el.tagsInput.value = deck.tags || "";
  el.sourceUrlInput.value = deck.sourceUrl || "";
  el.deckText.value = deck.deckText || "";
  el.weissJpImportInput.checked = appGame(deck.game) === "Weiss Schwarz (JP)" || deck.weissLocale === "jp";
  state.resolved = {
    cards: deck.cards || [],
    totalCards: cardTotal(deck),
    uniqueCards: deck.cards?.length || 0,
    missing: [],
    ambiguous: [],
  };
  renderDeck(deck);
}

function massImportSummary(result) {
  const lines = [
    `Mass import complete: ${result.imported?.length || 0} imported, ${result.failed?.length || 0} failed.`,
  ];
  for (const item of result.imported || []) {
    lines.push(`OK: ${item.deckName} [${item.game}] - ${item.cards} cards${item.missingCount ? `, ${item.missingCount} missing` : ""}${item.saved ? " - saved" : ""}`);
  }
  for (const item of result.failed || []) {
    lines.push(`FAILED: ${item.source} - ${item.error}`);
  }
  return lines.join("\n");
}

async function fillFromEncore() {
  const result = await api("/api/weiss/encore", { url: el.deckUrlInput.value });
  if (!result.ok) throw new Error(result.error || "Encore import failed.");
  state.resolved = null;
  el.gameInput.value = "Weiss Schwarz (EN)";
  el.deckText.value = result.deckText;
  el.nameInput.value ||= result.deckName;
  el.sourceUrlInput.value = el.deckUrlInput.value;
  el.importStatus.textContent = `Filled ${result.cards} cards from Encore`;
  log("Decklist box filled from Encore. Click Import Decklist when it looks right.");
}

async function fillFromDecklog() {
  const result = await api("/api/decklog/import", { url: el.deckUrlInput.value });
  if (!result.ok) throw new Error(result.error || "Decklog import failed.");
  state.resolved = null;
  if (result.detectedGame && result.detectedGame !== "Unknown") {
    el.gameInput.value = appGame(result.detectedGame);
  }
  const isHololive = isHololiveGame(result.detectedGame);
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

async function translateCurrentDeck() {
  const deck = formDeck();
  const cards = state.resolved?.cards?.length ? state.resolved.cards : deck.cards || [];
  const unionArenaJpCards = cards.filter(isUnionArenaJpCard);
  if (unionArenaJpCards.length) {
    await renderUnionArenaDeckImages(deck, cards, unionArenaJpCards);
    return;
  }
  const weissCards = cards.filter((card) => isWeissGame(card.game || "Weiss Schwarz (EN)"));
  if (!weissCards.length) {
    log("No Weiss cards in this deck to translate.", true);
    return;
  }

  setBusy(el.translateBtn, true, "Translating...");
  try {
    const result = await api("/api/weiss/translate", { cards: weissCards.map((card) => ({ number: card.number })) });
    const translations = new Map((result.translations || []).map((item) => [item.number, item]));
    const translatedCards = cards.map((card) => {
      const translation = translations.get(card.number);
      if (!translation?.ok) return card;
      return {
        ...card,
        name: translation.name || card.name,
        text: translation.text || card.text,
        tags: translation.traits || card.tags,
        tagsList: Array.isArray(translation.attributes) && translation.attributes.length
          ? translation.attributes
          : card.tagsList,
        cardType: translation.cardType || card.cardType,
        section: translation.cardType || card.section,
        color: translation.color || card.color,
        level: translation.level || card.level,
        cost: translation.cost || card.cost,
        power: translation.power || card.power,
        soul: translation.soul || card.soul,
        trigger: translation.trigger || card.trigger,
        rarity: translation.rarity || card.rarity,
        translationUrl: translation.url || card.translationUrl || "",
      };
    });

    setBusy(el.translateBtn, true, "Proxying...");
    const proxyResult = await api("/api/weiss/proxy-deck", { name: deck.name || "deck", cards: translatedCards });
    const proxiedCards = applyProxyImages(translatedCards, proxyResult.generated || []);

    state.resolved = {
      ...(state.resolved || {}),
      cards: proxiedCards,
      missing: state.resolved?.missing || [],
      ambiguous: state.resolved?.ambiguous || [],
      totalCards: proxiedCards.reduce((sum, card) => sum + Number(card.qty || 0), 0),
      uniqueCards: proxiedCards.length,
    };
    const translatedDeck = { ...deck, cards: proxiedCards };

    if (state.selectedId) {
      const saved = await api("/api/decks", translatedDeck);
      await loadDecks();
      state.selectedId = saved.deck?.id || state.selectedId;
      renderDeckList();
    }

    renderDeck(translatedDeck);

    const translated = (result.translations || []).filter((item) => item.ok);
    const missing = (result.translations || []).filter((item) => !item.ok);
    const throttled = missing.some((item) => item.throttled);
    const missLines = missing.map((item) => {
      const urls = item.triedUrls?.length ? item.triedUrls.join(" | ") : item.url;
      return `${item.number}: ${urls}${item.error ? ` (${item.error})` : ""}`;
    }).join("\n");
    const sourceNames = [...new Set(translated.map((item) => item.source || "Heart of the Cards"))];
    const sourceText = sourceNames.length ? ` from ${sourceNames.join(" and ")}` : "";
    const summary = throttled
      ? `Translated ${translated.length} card(s)${sourceText}; stopped because HOTC asked us to go slower. Press Translate again later.`
      : `Translated ${translated.length} card(s)${sourceText}${missing.length ? `; ${missing.length} not found.` : "."}`;
    const proxySummary = `Generated ${proxyResult.generatedCount || 0} translated proxy image(s)${proxyResult.skippedCount ? `; skipped ${proxyResult.skippedCount}.` : "."}`;
    log([
      summary,
      proxySummary,
      state.selectedId ? "Saved translated text and proxy images to the deck." : "Save the deck to keep translated text and proxy images.",
      missLines ? `Debug URLs:\n${missLines}` : "",
    ].filter(Boolean).join("\n"));
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.translateBtn, false, "Translate");
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
  el.deckMeta.textContent = `${appGame(deck.game)} - ${deck.status || "Testing"} - ${countSummary(deck)}`;

  const cards = normalizeDisplayCards(deck, deck.cards || []).sort((a, b) => deckCardSort(deck, a, b));
  const uniqueCards = deck.game === "Riftbound" ? mergeRiftboundDisplayCards(cards).length : cards.length;
  renderSummaryStats(deck, counts, uniqueCards);
  renderMissingCards(deck);

  if (deck.game === "Riftbound" || isUnionArenaGame(deck.game)) {
    renderSectionedDeckCards(deck, cards);
    return;
  }

  el.cardGrid.innerHTML = cards.map((card, index) => cardTileHtml(card, index)).join("");
  bindDeckCardTiles(cards);
}

function renderSectionedDeckCards(deck, cards) {
  const displayCards = mergeRiftboundDisplayCards(cards).sort((a, b) => deckCardSort(deck, a, b));
  const groups = sectionGroupsForGame(deck.game)
    .map((label) => [label, displayCards.filter((card) => normalizeDeckSection(card, deck.game) === label)])
    .filter(([label, group]) => !["Sideboard", "Action Points"].includes(label) || group.length);

  el.cardGrid.innerHTML = groups.map(([label, group]) => `
    <section class="deck-section">
      <header>
        <h3>${escapeHtml(label)}</h3>
        <span>${group.reduce((sum, card) => sum + Number(card.qty || 0), 0)} cards</span>
      </header>
      <div class="deck-section-grid">
        ${group.map((card) => cardTileHtml(card, displayCards.indexOf(card), { riftbound: deck.game === "Riftbound" })).join("") || `<div class="deck-section-empty">No ${escapeHtml(label.toLowerCase())} cards.</div>`}
      </div>
    </section>
  `).join("");
  bindDeckCardTiles(displayCards);
}

function cardTileHtml(card, index, options = {}) {
  const canSetChampion = options.riftbound && normalizeDeckSection(card, "Riftbound") === "Deck";
  return `
    <article class="card ${isClimax(card) ? "climax" : ""}" data-card-index="${index}" tabindex="0">
      <div class="card-media">
        ${displayImageUrl(card) ? `<img src="${escapeAttr(displayImageUrl(card))}" alt="">` : ""}
        ${restrictionOverlayHtml(card, card.game || el.gameInput.value)}
      </div>
      <div class="card-body">
        <div class="card-title">x${card.qty} ${escapeHtml(card.name)}</div>
        <div class="card-meta">${escapeHtml(card.number)}<br>${escapeHtml(card.cardType || card.section || "")} ${escapeHtml(card.color || "")}</div>
        ${restrictionBadgeHtml(card, card.game || el.gameInput.value)}
      </div>
      ${canSetChampion ? `<button class="card-action" type="button" data-set-riftbound-champion="${index}">Set champion</button>` : ""}
    </article>
  `;
}

function bindDeckCardTiles(cards) {
  for (const tile of el.cardGrid.querySelectorAll(".card")) {
    tile.addEventListener("click", () => openCardModal(cards[Number(tile.dataset.cardIndex)]));
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCardModal(cards[Number(tile.dataset.cardIndex)]);
      }
    });
  }
  for (const button of el.cardGrid.querySelectorAll("[data-set-riftbound-champion]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setRiftboundChampion(Number(button.dataset.setRiftboundChampion));
    });
  }
}

function normalizeDisplayCards(deck, cards) {
  return (cards || []).map((card) => ({
    ...card,
    game: appGame(card.game || deck.game),
    section: normalizeDeckSection(card, deck.game),
  }));
}

function restrictionBadgeHtml(card, game = card?.game || "") {
  const restriction = restrictionForCard(card, game);
  if (!restriction) return "";
  const label = restrictionLabel(restriction);
  return `<div class="restriction-badge restriction-${escapeAttr(restriction.kind)}">${escapeHtml(label)}</div>`;
}

function restrictionOverlayHtml(card, game = card?.game || "") {
  const restriction = restrictionForCard(card, game);
  if (!restriction) return "";
  return `<div class="restriction-overlay restriction-${escapeAttr(restriction.kind)}">${escapeHtml(restrictionShortLabel(restriction))}</div>`;
}

function restrictionForCard(card, game = card?.game || "") {
  const restrictions = currentRestrictionsForGame(game).entries || [];
  const cardName = normalizeRestrictionMatchText(card.name || card.englishName || card.title);
  const cardNumber = normalizeRestrictionNumber(card.number || card.cardNo || card.originalId);
  return restrictions.find((entry) => {
    const entryName = normalizeRestrictionMatchText(entry.name);
    const numbers = (entry.numbers || []).map(normalizeRestrictionNumber);
    if (numbers.length) return cardNumber && numbers.includes(cardNumber);
    return entryName && entryName === cardName;
  }) || null;
}

function restrictionLabel(entry) {
  if (entry.kind === "banned") return "Banned";
  if (entry.kind === "restricted") return `Limited to ${entry.limit}`;
  if (entry.kind === "choice") return `Choice: ${entry.group || "restricted group"}`;
  if (entry.kind === "combination") return `Shared limit ${entry.limit}: ${entry.group || "group"}`;
  return entry.kind || "Restricted";
}

function restrictionShortLabel(entry) {
  if (entry.kind === "banned") return "Banned";
  if (entry.kind === "restricted") return `Limit ${entry.limit}`;
  if (entry.kind === "choice") return "Choice";
  if (entry.kind === "combination") return `Shared ${entry.limit}`;
  return "Restricted";
}

function normalizeRestrictionMatchText(value) {
  return String(value || "").toLowerCase().replace(/[\u201c\u201d]/g, "\"").replace(/\s+/g, " ").trim();
}

function normalizeRestrictionNumber(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}

async function renderUnionArenaDeckImages(deck, cards, unionArenaJpCards) {
  const uniqueCards = [];
  const seen = new Set();
  for (const card of unionArenaJpCards) {
    const key = String(card.number || "").trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueCards.push(card);
  }

  setBusy(el.translateBtn, true, "Rendering...");
  try {
    setBusy(el.translateBtn, true, `Rendering ${uniqueCards.length}`);
    const result = await api("/api/union-arena/render-cards", { cards: uniqueCards });
    const rendered = result.rendered || [];

    const renderedCards = applyProxyImages(cards, rendered);
    state.resolved = {
      ...(state.resolved || {}),
      cards: renderedCards,
      missing: state.resolved?.missing || [],
      ambiguous: state.resolved?.ambiguous || [],
      totalCards: renderedCards.reduce((sum, card) => sum + Number(card.qty || 0), 0),
      uniqueCards: renderedCards.length,
    };
    const renderedDeck = { ...deck, cards: renderedCards };

    if (state.selectedId) {
      const saved = await api("/api/decks", renderedDeck);
      await loadDecks();
      state.selectedId = saved.deck?.id || state.selectedId;
      renderDeckList();
    }

    renderDeck(renderedDeck);
    log([
      `Rendered ${rendered.length}/${uniqueCards.length} Union Arena JP card image(s) from ExBurst.`,
      result.cached ? `${result.cached} image(s) were already cached.` : "",
      state.selectedId ? "Saved rendered images to the deck." : "Save the deck to keep rendered images.",
    ].filter(Boolean).join("\n"));
  } catch (error) {
    log(error.message, true);
  } finally {
    setBusy(el.translateBtn, false, "Translate");
  }
}

function renderMissingCards(deck) {
  if (!deck.cards?.length) {
    el.missingCardsPanel.innerHTML = "";
    return;
  }

  const validationHtml = deckValidationHtml(deck);
  const missing = deckMissingFromCollection(deck);
  if (!missing.length) {
    el.missingCardsPanel.innerHTML = `
      ${validationHtml}
      <details class="missing-details">
        <summary><strong>Collection</strong><span class="ok">You own everything in this deck.</span></summary>
      </details>
    `;
    return;
  }

  const total = missing.reduce((sum, card) => sum + card.missingQty, 0);
  el.missingCardsPanel.innerHTML = `
    ${validationHtml}
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
  const stats = isHololiveGame(deck.game)
    ? [
        ["Oshi", counts.oshi],
        ["Main", counts.main],
        ["Cheer", counts.cheer],
        ["Unique", uniqueCards],
      ]
    : deck.game === "Riftbound"
      ? sectionGroupsForGame(deck.game).map((label) => [label, counts.sections[label] || 0]).filter(([label, value]) => label !== "Sideboard" || value)
        .concat([["Unique", uniqueCards]])
      : isUnionArenaGame(deck.game)
        ? [
            ["Main", counts.sections.Main || 0],
            ["Action Points", counts.sections["Action Points"] || 0],
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
  state.modalCard = card;

  el.modalCardName.textContent = card.name || "Unknown card";
  el.modalCardNumber.textContent = `x${card.qty || 1} ${card.number || ""}`;
  el.modalCardImageWrap.classList.toggle("climax", isClimax(card));
  el.modalCardImageWrap.innerHTML = displayImageUrl(card) ? `<img src="${escapeAttr(displayImageUrl(card))}" alt="">` : "No image";

  const isUnionArena = isUnionArenaGame(card.game);
  const details = isUnionArena ? unionArenaCardDetails(card) : [
    ["Type", card.cardType || card.section],
    ["Color", card.color],
    ["Level", card.level],
    ["Cost", card.cost],
    ["Energy", card.energy],
    ["Energy Cost", card.energyCost],
    ["Generated Energy", card.generatedEnergy],
    ["AP", card.ap],
    ["Power", card.power],
    ["BP", card.bp],
    ["Might", card.might],
    ["Might Bonus", card.mightBonus],
    ["Soul", card.soul],
    ["Trigger", card.trigger],
    ["Rarity", card.rarity],
    ["LIFE", card.life],
    ["Bloom", card.bloomLevel],
    ["HP", card.hp],
    ["Baton Pass", card.batonPass],
    ["Card Set", card.cardSet],
    ["Set Code", card.setCode],
    ["Series", card.seriesName || card.series],
    ["Abbreviation", card.abbreviation],
    ["Original ID", card.originalId],
    ["Supertype", card.supertype],
    ["Variant", card.variantType],
    ["Artist", card.artist],
    [isUnionArena ? "Features" : "Tags", isUnionArena ? card.features : card.tags],
  ].filter(([, value]) => String(value || "").trim());

  el.modalCardDetails.innerHTML = details.map(([label, value]) => `
    <dt>${escapeHtml(label)}</dt>
    <dd>${detailValueHtml(card, label, value)}</dd>
  `).join("") + (card.detailUrl ? `
    <dt>Link</dt>
    <dd><a href="${escapeAttr(card.detailUrl)}" target="_blank" rel="noopener noreferrer">Official Site</a></dd>
  ` : "") + (card.translationUrl ? `
    <dt>Translation</dt>
    <dd><a href="${escapeAttr(card.translationUrl)}" target="_blank" rel="noopener noreferrer">Translation Source</a></dd>
  ` : "");
  el.modalCardActions.innerHTML = cardActionButtonsHtml(card);

  el.modalCardText.innerHTML = cardRulesHtml(card);
  el.cardModal.classList.toggle("over-builder", !el.builderModal.hidden || !el.collectionModal.hidden);
  el.cardModal.hidden = false;
}

function closeCardModal() {
  state.modalCard = null;
  el.cardModal.classList.remove("over-builder");
  el.cardModal.hidden = true;
}

function cardActionButtonsHtml(card) {
  return [
    proxyCardButtonHtml(card),
    unionArenaRenderButtonHtml(card),
  ].filter(Boolean).join("");
}

function proxyCardButtonHtml(card) {
  if (!isTranslatedJpWeissCard(card)) return "";
  return `
    <button type="button" data-generate-proxy>
      Generate Proxy
    </button>
  `;
}

function deckValidationHtml(deck) {
  const game = appGame(deck.game);
  const validation = game === "Riftbound"
    ? validateRiftboundDeck(deck.cards || [], { restrictions: currentRestrictionsForGame(game) })
    : isHololiveGame(game)
      ? validateHololiveDeck(deck.cards || [], { restrictions: currentRestrictionsForGame(game) })
    : isUnionArenaGame(game)
      ? validateUnionArenaDeck(deck.cards || [], game, { restrictions: currentRestrictionsForGame(game) })
      : isWeissGame(game)
        ? validateWeissDeck(deck.cards || [], { restrictions: currentRestrictionsForGame(game) })
        : null;
  if (!validation) return "";

  const ok = validation.issues.length === 0;
  return `
    <details class="missing-details" open>
      <summary><strong>Deck validation</strong><span class="${ok ? "ok" : "bad"}">${ok ? validation.passText : `${validation.issues.length} issue(s)`}</span></summary>
      <div class="builder-counts">
        ${validation.counts.map((count) => `<span class="${count.ok ? "ok" : "bad"}">${escapeHtml(count.label)}</span>`).join("")}
      </div>
      ${validation.issues.length ? `<ul>${validation.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}
    </details>
  `;
}

function unionArenaRenderButtonHtml(card) {
  if (!isUnionArenaJpCard(card)) return "";
  return `
    <button type="button" data-render-union-arena>
      Render ExBurst Image
    </button>
  `;
}

async function generateProxyForModalCard(button) {
  const card = state.modalCard;
  if (!card) return;

  setBusy(button, true, "Generating...");
  try {
    const result = await api("/api/weiss/proxy-card", { card });
    card.proxyImageUrl = result.outputUrl;
    el.modalCardImageWrap.classList.toggle("climax", false);
    el.modalCardImageWrap.innerHTML = `<img src="${escapeAttr(result.outputUrl)}" alt="">`;
    setBusy(button, false, "Regenerate Proxy");
    log(`Generated proxy card image:\n${result.outputPath}`);
  } catch (error) {
    log(error.message, true);
    setBusy(button, false, "Generate Proxy");
  }
}

async function renderUnionArenaCardForModal(button) {
  const card = state.modalCard;
  if (!card) return;

  setBusy(button, true, "Rendering...");
  try {
    const result = await api("/api/union-arena/render-card", { card });
    card.proxyImageUrl = result.outputUrl;
    card.proxyOutputPath = result.outputPath || "";
    el.modalCardImageWrap.classList.toggle("climax", false);
    el.modalCardImageWrap.innerHTML = `<img src="${escapeAttr(result.outputUrl)}" alt="">`;
    setBusy(button, false, "Refresh ExBurst Image");
    log(`Rendered ExBurst card image:\n${result.outputPath}`);
  } catch (error) {
    log(error.message, true);
    setBusy(button, false, "Render ExBurst Image");
  }
}

function isTranslatedJpWeissCard(card) {
  return isWeissGame(card?.game)
    && Boolean(card.translationUrl)
    && /^https:\/\/ws-tcg\.com\//i.test(String(card.imageUrl || ""))
    && !/-E\d/i.test(String(card.number || ""));
}

function isUnionArenaJpCard(card) {
  return appGame(card?.game) === "Union Arena (JP)"
    && Boolean(card.renderedImagePageUrl || card.detailUrl);
}

function applyProxyImages(cards, generated) {
  const proxies = new Map((generated || []).map((item) => [String(item.number || "").trim().toUpperCase(), item]));
  return cards.map((card) => {
    const proxy = proxies.get(String(card.number || "").trim().toUpperCase());
    if (!proxy?.outputUrl) return card;
    return {
      ...card,
      proxyImageUrl: proxy.outputUrl,
      proxyOutputPath: proxy.outputPath || card.proxyOutputPath || "",
    };
  });
}

function displayImageUrl(card) {
  return card.proxyImageUrl || card.imageUrl || "";
}

function unionArenaCardDetails(card) {
  return [
    ["Color", card.color],
    ["Type", card.cardType || card.section],
    ["Rarity", card.rarity],
    ["ID", card.number],
    ["Power", card.bp || card.power],
    ["Cost (Energy)", card.energyCost || card.cost],
    ["Cost (AP)", card.ap],
    ["Energy Gen.", card.generatedEnergy],
    ["Features", card.features],
    ["Series", card.seriesName],
    ["Set", card.abbreviation],
    ["Original ID", card.originalId],
  ].filter(([, value]) => String(value || "").trim());
}

function setRiftboundChampion(index) {
  const cards = currentEditableCards();
  const displayCards = mergeRiftboundDisplayCards(cards).sort((a, b) => deckCardSort({ game: "Riftbound" }, a, b));
  const displayed = displayCards[index];
  const target = cards.find((card) => riftboundCardKey(card) === riftboundCardKey(displayed) && normalizeDeckSection(card, "Riftbound") === "Deck");
  if (!target) return;

  for (const card of cards) {
    if (normalizeDeckSection(card, "Riftbound") === "Champion") card.section = "Deck";
    card.riftboundChampion = false;
    card.isChosenChampion = false;
    card.tagsList = Array.isArray(card.tagsList) ? card.tagsList.filter((tag) => String(tag).toLowerCase() !== "chosen champion") : [];
    card.tags = String(card.tags || "").split(/\s*\/\s*|\s*,\s*/).map((tag) => tag.trim()).filter((tag) => tag && tag.toLowerCase() !== "chosen champion").join(" / ");
  }
  if (Number(target.qty || 0) > 1) {
    target.qty = Number(target.qty || 0) - 1;
    cards.push(markRiftboundChampionCard({ ...target, qty: 1 }));
  } else {
    Object.assign(target, markRiftboundChampionCard(target));
  }

  if (state.resolved?.cards?.length) state.resolved.cards = cards;
  const deck = selectedDeck();
  if (deck?.cards?.length && !state.resolved?.cards?.length) deck.cards = cards;
  renderDeck({ ...formDeck(), cards });
  log(`${target.name} set as Riftbound champion. Save the deck to keep it.`);
}

function markRiftboundChampionCard(card) {
  const tagsList = Array.isArray(card.tagsList) ? [...card.tagsList] : [];
  if (!tagsList.some((tag) => String(tag).toLowerCase() === "chosen champion")) tagsList.push("Chosen Champion");
  const tags = String(card.tags || "").split(/\s*\/\s*|\s*,\s*/).map((tag) => tag.trim()).filter(Boolean);
  if (!tags.some((tag) => tag.toLowerCase() === "chosen champion")) tags.push("Chosen Champion");
  return {
    ...card,
    section: "Champion",
    riftboundChampion: true,
    isChosenChampion: true,
    tags: tags.join(" / "),
    tagsList,
  };
}

function currentEditableCards() {
  if (state.resolved?.cards?.length) return state.resolved.cards;
  const deck = selectedDeck();
  return Array.isArray(deck?.cards) ? deck.cards : [];
}

function mergeRiftboundDisplayCards(cards) {
  const merged = [];
  const byKey = new Map();

  for (const card of cards) {
    const section = normalizeDeckSection(card, "Riftbound");
    const key = `${section}:${riftboundCardKey(card)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty = Number(existing.qty || 0) + Number(card.qty || 0);
    } else {
      const copy = { ...card, section };
      byKey.set(key, copy);
      merged.push(copy);
    }
  }

  return merged;
}

function riftboundCardKey(card) {
  return String(card?.variantId || card?.number || card?.cardId || card?.name || "");
}

function cardRulesHtml(card) {
  const lines = [];
  const hasHololiveStructuredText = isHololiveCard(card)
    && ((card.keywords || []).length || (card.arts || []).length || (card.oshiSkills || []).length || card.extraText || card.extra?.text);

  if (!hasHololiveStructuredText && (card.text || card.abilityText)) lines.push(card.text || card.abilityText);

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
  return isHololiveGame(card.game)
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
    setBusy(el.buildWeissDbBtn, false, "Build Weiss (EN) Card DB");
  }
}

async function buildWeissJpCardDb() {
  setBusy(el.buildWeissJpDbBtn, true, "Building...");
  el.settingsLog.textContent = "Building Japanese Weiss card database. This can take a few minutes...";

  try {
    const result = await api("/api/weiss/build-db", { locale: "jp" });
    renderBuildJob(result.job);

    while (true) {
      await sleep(1500);
      const status = await api("/api/weiss/build-db/status");
      const job = status.job;
      renderBuildJob(job);

      if (!job || job.status !== "running") break;
    }
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.buildWeissJpDbBtn, false, "Build JP Weiss Card DB");
  }
}

async function saveSettings() {
  setBusy(el.saveSettingsBtn, true, "Saving...");
  try {
    commitVisibleRestrictions();
    const result = await api("/api/settings", {
      ttsJsonExportDir: el.ttsJsonExportDirInput.value.trim(),
      cardGameRestrictions: state.settings.cardGameRestrictions,
    });
    state.settings = result.settings || state.settings;
    el.ttsJsonExportDirInput.value = result.settings?.ttsJsonExportDir || "";
    renderRestrictionsEditor();
    el.settingsLog.textContent = "Settings saved.";
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.saveSettingsBtn, false, "Save Settings");
  }
}

function currentRestrictionsForGame(game) {
  return filterRestrictionsForGame(state.settings?.cardGameRestrictions, game);
}

function renderRestrictionsEditor() {
  const restrictions = state.settings?.cardGameRestrictions || {};
  const entries = (restrictions.entries || []).filter((entry) => restrictionGameKey(entry.game) === restrictionGameKey(state.selectedRestrictionGame));
  el.restrictionGameInput.value = state.selectedRestrictionGame;
  el.restrictionDateInput.value = restrictions.lastUpdatedByGame?.[restrictionGameKey(state.selectedRestrictionGame)] || restrictions.lastUpdated || "";
  el.restrictionsList.innerHTML = entries.map((entry, index) => restrictionRowHtml(entry, index)).join("")
    || `<div class="restriction-empty">No restrictions yet. Add one when a game gets a ban list.</div>`;
}

function restrictionRowHtml(entry, index) {
  const numbers = (entry.numbers || []).join(", ");
  return `
    <div class="restriction-row" data-restriction-index="${index}">
      <select data-restriction-field="kind">
        ${restrictionOptions(["banned", "restricted", "choice", "combination"], entry.kind || "restricted")}
      </select>
      <input data-restriction-field="limit" type="number" min="0" value="${escapeAttr(Number.isFinite(Number(entry.limit)) ? String(entry.limit) : "")}">
      <input data-restriction-field="group" value="${escapeAttr(entry.group || "")}" placeholder="Set / choice group">
      <input data-restriction-field="name" value="${escapeAttr(entry.name || "")}" placeholder="Card name">
      <textarea data-restriction-field="numbers" rows="2" placeholder="Card numbers, comma separated">${escapeHtml(numbers)}</textarea>
      <button type="button" data-remove-restriction="${index}" aria-label="Remove restriction">Remove</button>
    </div>
  `;
}

function restrictionOptions(options, selected) {
  return options.map((option) => `<option${option === selected ? " selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function collectRestrictionEntries() {
  return [...el.restrictionsList.querySelectorAll(".restriction-row")].map((row) => {
    const value = (field) => row.querySelector(`[data-restriction-field="${field}"]`)?.value.trim() || "";
    return {
      game: state.selectedRestrictionGame,
      kind: value("kind").toLowerCase(),
      limit: value("limit") === "" ? "" : Number(value("limit")),
      group: value("group"),
      name: value("name"),
      numbers: value("numbers").split(",").map((number) => number.trim()).filter(Boolean),
    };
  }).filter((entry) => entry.game && entry.kind && (entry.name || entry.numbers.length));
}

function addRestrictionRow() {
  commitVisibleRestrictions();
  state.settings.cardGameRestrictions = {
    ...state.settings.cardGameRestrictions,
    entries: [
      ...(state.settings.cardGameRestrictions?.entries || []),
      { game: state.selectedRestrictionGame, kind: "restricted", limit: 1, group: "", name: "", numbers: [] },
    ],
  };
  renderRestrictionsEditor();
  el.restrictionsList.querySelector(".restriction-row:last-child input[data-restriction-field='name']")?.focus();
}

function handleRestrictionListClick(event) {
  const button = event.target.closest("[data-remove-restriction]");
  if (!button) return;
  const index = Number(button.dataset.removeRestriction);
  const entries = collectRestrictionEntries();
  entries.splice(index, 1);
  replaceRestrictionsForSelectedGame(entries);
  renderRestrictionsEditor();
}

function switchRestrictionGame() {
  commitVisibleRestrictions();
  state.selectedRestrictionGame = el.restrictionGameInput.value;
  renderRestrictionsEditor();
}

function commitVisibleRestrictions() {
  const restrictions = state.settings.cardGameRestrictions || { entries: [], lastUpdatedByGame: {} };
  const lastUpdatedByGame = { ...(restrictions.lastUpdatedByGame || {}) };
  lastUpdatedByGame[restrictionGameKey(state.selectedRestrictionGame)] = el.restrictionDateInput.value.trim();
  state.settings.cardGameRestrictions = {
    ...restrictions,
    lastUpdated: restrictions.lastUpdated || lastUpdatedByGame["weiss schwarz (en)"] || "",
    lastUpdatedByGame,
  };
  replaceRestrictionsForSelectedGame(collectRestrictionEntries());
}

function replaceRestrictionsForSelectedGame(entries) {
  const restrictions = state.settings.cardGameRestrictions || { entries: [] };
  const selectedKey = restrictionGameKey(state.selectedRestrictionGame);
  state.settings.cardGameRestrictions = {
    ...restrictions,
    entries: [
      ...(restrictions.entries || []).filter((entry) => restrictionGameKey(entry.game) !== selectedKey),
      ...entries,
    ],
  };
}

function restrictionGameKey(value) {
  const game = String(value || "").trim().toLowerCase();
  if (game === "weiss schwarz" || game === "weiss schwarz (en)" || game === "weiss" || game === "ws") return "weiss schwarz (en)";
  if (game === "weiss schwarz jp" || game === "weiss jp" || game === "ws jp" || game === "weiss schwarz (jp)") return "weiss schwarz (jp)";
  if (game === "hololive" || game === "hololive ocg" || game === "hololive ocg (en)" || game === "hocg" || game === "hocg en") return "hololive ocg";
  if (game === "hololive jp" || game === "hololive ocg jp" || game === "hololive ocg (jp)" || game === "hocg jp") return "hololive ocg (jp)";
  if (game === "union arena" || game === "union arena en" || game === "union arena (en)" || game === "ua" || game === "ua en") return "union arena (en)";
  if (game === "union arena jp" || game === "union arena (jp)" || game === "ua jp") return "union arena (jp)";
  if (game === "riftbound") return "riftbound";
  return game;
}

async function clearImageCache() {
  const confirmed = window.confirm("Delete generated cached TTS images? Saved object JSON files will stay.");
  if (!confirmed) return;

  setBusy(el.clearImageCacheBtn, true, "Clearing...");
  try {
    const result = await api("/api/cache/images", {});
    el.settingsLog.textContent = `Cleared ${Number(result.filesDeleted || 0).toLocaleString()} cached image file(s) from ${Number(result.directoriesDeleted || 0).toLocaleString()} folder(s).`;
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.clearImageCacheBtn, false, "Clear Cached Images");
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

async function buildHololiveJpCardDb() {
  setBusy(el.buildHololiveJpDbBtn, true, "Building...");
  el.settingsLog.textContent = "Building Hololive JP card database and applying translation sheet data...";

  try {
    const result = await api("/api/hololive/build-db", { locale: "jp" });
    renderBuildJob(result.job, "hololive");

    while (true) {
      await sleep(1500);
      const status = await api("/api/hololive/build-db/status");
      const job = status.job;
      renderBuildJob(job, "hololive");

      if (!job || job.status !== "running") break;
    }
    state.hololiveJpSets = [];
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.buildHololiveJpDbBtn, false, "Build Hololive JP Card DB");
  }
}

async function fillFromPiltover() {
  const result = await api("/api/riftbound/piltover", { url: el.deckUrlInput.value });
  if (!result.resolvedCards?.length) throw new Error(result.error || "Piltover import failed.");

  el.gameInput.value = "Riftbound";
  el.deckText.value = result.deckText || "";
  el.nameInput.value ||= result.deckName;
  el.sourceUrlInput.value = result.sourceUrl || el.deckUrlInput.value;
  state.resolved = {
    cards: result.resolvedCards,
    totalCards: result.cards,
    uniqueCards: result.uniqueCards,
    missing: result.missing || [],
    ambiguous: [],
  };
  renderDeck({ ...formDeck(), cards: result.resolvedCards });
  el.importStatus.textContent = result.missing?.length
    ? `Imported ${result.cards} Riftbound cards; ${result.missing.length} missing`
    : `Imported ${result.cards} Riftbound cards`;
  el.importStatus.classList.toggle("bad", Boolean(result.missing?.length));
  log(result.missing?.length
    ? `Riftbound Piltover deck imported with missing entries:\n${result.missing.map((card) => `${card.number} ${card.name}`).join("\n")}`
    : "Riftbound Piltover deck imported. Review, then Save.");
}

async function fillFromExburstUnionArena() {
  const result = await api("/api/union-arena/exburst", { url: el.deckUrlInput.value });
  if (!result.ok && !result.resolvedCards?.length) throw new Error(result.error || "ExBurst Union Arena import failed.");
  state.resolved = {
    cards: result.resolvedCards || [],
    totalCards: result.totalCards || result.cards || 0,
    uniqueCards: result.uniqueCards || result.resolvedCards?.length || 0,
    missing: result.missing || [],
    ambiguous: [],
  };
  el.gameInput.value = appGame(result.game);
  el.deckText.value = result.deckText || "";
  el.nameInput.value ||= result.deckName;
  el.sourceUrlInput.value = result.sourceUrl || el.deckUrlInput.value;
  renderDeck({ ...formDeck(), cards: result.resolvedCards || [] });
  el.importStatus.textContent = result.missing?.length
    ? `Imported ${result.cards || 0} Union Arena cards; ${result.missing.length} missing`
    : `Imported ${result.cards || 0} Union Arena cards`;
  el.importStatus.classList.toggle("bad", Boolean(result.missing?.length));
  log(result.missing?.length
    ? `Union Arena ExBurst deck imported with missing entries:\n${result.missing.map((card) => `${card.qty} x ${card.number}`).join("\n")}`
    : "Union Arena ExBurst deck imported. Review, then Save.");
}

async function buildRiftboundCardDb() {
  setBusy(el.buildRiftboundDbBtn, true, "Building...");
  el.settingsLog.textContent = "Building Riftbound card database from Piltover Archive...";

  try {
    const result = await api("/api/riftbound/build-db", {});
    renderBuildJob(result.job, "riftbound");

    while (true) {
      await sleep(1500);
      const status = await api("/api/riftbound/build-db/status");
      const job = status.job;
      renderBuildJob(job, "riftbound");

      if (!job || job.status !== "running") break;
    }
    state.riftboundSets = [];
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.buildRiftboundDbBtn, false, "Build Riftbound Card DB");
  }
}

async function buildUnionArenaCardDb() {
  setBusy(el.buildUnionArenaDbBtn, true, "Building...");
  el.settingsLog.textContent = "Building Union Arena (EN) card database from ExBurst...";

  try {
    const result = await api("/api/union-arena/build-db", { locale: "en" });
    renderBuildJob(result.job, "union-arena");

    while (true) {
      await sleep(1500);
      const status = await api("/api/union-arena/build-db/status");
      const job = status.job;
      renderBuildJob(job, "union-arena");

      if (!job || job.status !== "running") break;
    }
    state.unionArenaSets = [];
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.buildUnionArenaDbBtn, false, "Build Union Arena (EN) Card DB");
  }
}

async function buildUnionArenaJpCardDb() {
  setBusy(el.buildUnionArenaJpDbBtn, true, "Building...");
  el.settingsLog.textContent = "Building Union Arena (JP) card database from ExBurst...";

  try {
    const result = await api("/api/union-arena/build-db", { locale: "jp" });
    renderBuildJob(result.job, "union-arena");

    while (true) {
      await sleep(1500);
      const status = await api("/api/union-arena/build-db/status");
      const job = status.job;
      renderBuildJob(job, "union-arena");

      if (!job || job.status !== "running") break;
    }
    state.unionArenaJpSets = [];
  } catch (error) {
    el.settingsLog.textContent = error.message;
  } finally {
    setBusy(el.buildUnionArenaJpDbBtn, false, "Build Union Arena (JP) Card DB");
  }
}

function renderBuildJob(job, game = "weiss") {
  if (!job) {
    el.settingsLog.textContent = "No build has started.";
    return;
  }

  const countKey = game === "union-arena" ? "unionArenaCards" : game === "riftbound" ? "riftboundCards" : game === "hololive" ? "hololiveCards" : "weissCards";
  const gameName = game === "union-arena" ? `Union Arena (${job.locale === "jp" ? "JP" : "EN"})` : game === "riftbound" ? "Riftbound" : game === "hololive" ? `Hololive (${job.locale === "jp" ? "JP" : "EN"})` : "Weiss";
  const heading = job.status === "complete"
    ? `${gameName} build complete: ${Number(job[countKey] || 0).toLocaleString()} cards.`
    : job.status === "failed"
      ? `${gameName} build failed: ${job.error || "Unknown error"}`
      : `${gameName} build running...`;

  el.settingsLog.textContent = [heading, "", job.log || ""].join("\n").trim();
}

async function openBuilderModal() {
  const game = appGame(el.gameInput.value);
  el.gameInput.value = game;
  el.builderGameInput.value = game;
  const current = state.resolved?.cards?.length ? state.resolved.cards : selectedDeck()?.cards || [];
  state.builderCards = current
    .filter((card) => appGame(card.game || game) === game || (isWeissGame(game) && isWeissGame(card.game)))
    .map((card) => ({ ...card, qty: Number(card.qty || 1) }));
  el.builderModal.hidden = false;
  await loadGameSets(game);
  renderBuilderSeriesOptions();
  el.builderSeriesSelect.value = builderSeriesId();
  syncBuilderGameUi();
  if (isHololiveGame(game) && !hasHololiveOshi(state.builderCards)) {
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

async function searchBuilderCards({ append = false } = {}) {
  if (state.builderResultsLoading) return;
  state.builderResultsLoading = true;
  if (!append) setBusy(el.builderSearchBtn, true, "Searching...");
  try {
    const offset = append ? state.builderResults.length : 0;
    const params = new URLSearchParams({
      game: el.builderGameInput.value,
      q: el.builderSearchInput.value.trim(),
      title: el.builderSeriesSelect.value,
      offset: String(offset),
      limit: String(SEARCH_PAGE_SIZE),
    });
    appendBuilderFilterParams(params);
    const result = await api(`/api/collection/cards/search?${params.toString()}`);
    state.builderResults = append ? [...state.builderResults, ...(result.cards || [])] : result.cards || [];
    state.builderResultsTotal = Number(result.total || state.builderResults.length);
    state.builderResultsHasMore = Boolean(result.hasMore);
    renderBuilderResults();
  } catch (error) {
    el.builderResults.innerHTML = `<div class="builder-note bad">${escapeHtml(error.message)}</div>`;
  } finally {
    state.builderResultsLoading = false;
    if (!append) setBusy(el.builderSearchBtn, false, "Search");
  }
}

function maybeLoadMoreBuilderCards() {
  if (!state.builderResultsHasMore || state.builderResultsLoading) return;
  if (!isNearScrollBottom(el.builderResults)) return;
  searchBuilderCards({ append: true });
}

async function loadBuilderSeries(locale = "en") {
  const isJp = locale === "jp";
  if (isJp && state.builderJpSeries.length) return;
  if (!isJp && state.builderSeries.length) return;
  const result = await api(`/api/weiss/series?locale=${isJp ? "jp" : "en"}`);
  if (isJp) state.builderJpSeries = result.series || [];
  else state.builderSeries = result.series || [];
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
  if (el.builderGameInput.value === "Hololive OCG (EN)") return state.hololiveSets;
  if (el.builderGameInput.value === "Hololive OCG (JP)") return state.hololiveJpSets;
  if (el.builderGameInput.value === "Riftbound") return state.riftboundSets;
  if (el.builderGameInput.value === "Union Arena (EN)") return state.unionArenaSets;
  if (el.builderGameInput.value === "Union Arena (JP)") return state.unionArenaJpSets;
  if (el.builderGameInput.value === "Weiss Schwarz (JP)") return state.builderJpSeries;
  return state.builderSeries;
}

function builderSeriesKind() {
  return isWeissGame(el.builderGameInput.value) ? "Series" : "Card set";
}

async function switchBuilderGame() {
  const game = appGame(el.builderGameInput.value);
  el.builderGameInput.value = game;
  el.gameInput.value = game;
  await loadGameSets(game);
  state.builderCards = state.builderCards.filter((card) => (card.game || game) === game);
  el.builderSeriesSelect.value = "";
  renderBuilderSeriesOptions();
  syncBuilderGameUi();
  clearBuilderFilters(false);
  primeHololiveOshiFilter();
  renderBuilderDeck();
  searchBuilderCards();
}

function syncBuilderGameUi() {
  const isHolo = isHololiveGame(el.builderGameInput.value);
  const isRiftbound = el.builderGameInput.value === "Riftbound";
  const isUnionArena = isUnionArenaGame(el.builderGameInput.value);
  el.builderHeading.textContent = isHolo ? "Hololive Deck Builder" : isRiftbound ? "Riftbound Deck Builder" : isUnionArena ? "Union Arena Deck Builder" : "Weiss Deck Builder";
  el.builderSubheading.textContent = isHolo
    ? "Choose a card set, then build Oshi / Main / Cheer."
    : isRiftbound
      ? "Choose a set, search cards, and build a Riftbound list."
      : isUnionArena
        ? "Choose a series, search cards, and build a 50-card Union Arena deck."
    : "Neo-Standard: choose a series, build to 50 cards, max 8 climaxes, max 4 copies.";
  el.builderLevelLabel.textContent = isHolo ? "Bloom" : isRiftbound ? "Energy" : isUnionArena ? "Energy" : "Level";
  for (const item of document.querySelectorAll(".builder-weiss-filter")) item.hidden = isHolo || isRiftbound;
  syncBuilderFilterOptions();
}

function syncBuilderFilterOptions() {
  const game = appGame(el.builderGameInput.value);
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
  await loadGameSets(el.collectionGameFilter.value);
  renderCollectionSeriesOptions();
  syncCollectionFilterVisibility();
  syncCollectionFilterOptions();
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

async function loadHololiveSets(locale = "en") {
  const isJp = locale === "jp";
  if (isJp && state.hololiveJpSets.length) return;
  if (!isJp && state.hololiveSets.length) return;
  const result = await api(`/api/collection/hololive/sets?locale=${isJp ? "jp" : "en"}`);
  if (isJp) state.hololiveJpSets = result.sets || [];
  else state.hololiveSets = result.sets || [];
}

async function loadRiftboundSets() {
  if (state.riftboundSets.length) return;
  const result = await api("/api/collection/riftbound/sets");
  state.riftboundSets = result.sets || [];
}

async function loadUnionArenaSets(locale = "en") {
  const isJp = locale === "jp";
  if (isJp && state.unionArenaJpSets.length) return;
  if (!isJp && state.unionArenaSets.length) return;
  const result = await api(`/api/collection/union-arena/sets?locale=${isJp ? "jp" : "en"}`);
  if (isJp) state.unionArenaJpSets = result.sets || [];
  else state.unionArenaSets = result.sets || [];
}

async function loadGameSets(game) {
  const normalized = appGame(game);
  if (normalized === "Weiss Schwarz (EN)") await loadBuilderSeries("en");
  if (normalized === "Weiss Schwarz (JP)") await loadBuilderSeries("jp");
  if (normalized === "Hololive OCG (EN)") await loadHololiveSets("en");
  if (normalized === "Hololive OCG (JP)") await loadHololiveSets("jp");
  if (normalized === "Riftbound") await loadRiftboundSets();
  if (normalized === "Union Arena (EN)") await loadUnionArenaSets("en");
  if (normalized === "Union Arena (JP)") await loadUnionArenaSets("jp");
}

function collectionSeriesOptions() {
  if (el.collectionGameFilter.value === "Hololive OCG (EN)") return state.hololiveSets;
  if (el.collectionGameFilter.value === "Hololive OCG (JP)") return state.hololiveJpSets;
  if (el.collectionGameFilter.value === "Riftbound") return state.riftboundSets;
  if (el.collectionGameFilter.value === "Union Arena (EN)") return state.unionArenaSets;
  if (el.collectionGameFilter.value === "Union Arena (JP)") return state.unionArenaJpSets;
  if (el.collectionGameFilter.value === "Weiss Schwarz (JP)") return state.builderJpSeries;
  return state.builderSeries;
}

function collectionSeriesKind() {
  return isWeissGame(el.collectionGameFilter.value) ? "Series" : "Card set";
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

async function searchCollectionCards({ append = false } = {}) {
  if (state.collectionResultsLoading) return;
  state.collectionResultsLoading = true;
  if (!append) setBusy(el.collectionSearchBtn, true, "Searching...");
  try {
    const offset = append ? state.collectionResults.length : 0;
    const params = new URLSearchParams({
      game: el.collectionGameFilter.value,
      q: el.collectionSearchInput.value.trim(),
      title: el.collectionSeriesSelect.value,
      view: el.collectionViewFilter.value,
      sort: el.collectionSortInput.value,
      offset: String(offset),
      limit: String(SEARCH_PAGE_SIZE),
    });
    appendCollectionFilterParams(params);
    const result = await api(`/api/collection/cards/search?${params.toString()}`);
    state.collectionResults = append ? [...state.collectionResults, ...(result.cards || [])] : result.cards || [];
    state.collectionResultsTotal = Number(result.total || state.collectionResults.length);
    state.collectionResultsHasMore = Boolean(result.hasMore);
    renderCollectionCards();
  } catch (error) {
    el.collectionGrid.innerHTML = `<div class="builder-note bad">${escapeHtml(error.message)}</div>`;
  } finally {
    state.collectionResultsLoading = false;
    if (!append) setBusy(el.collectionSearchBtn, false, "Search");
  }
}

function maybeLoadMoreCollectionCards() {
  if (!state.collectionResultsHasMore || state.collectionResultsLoading) return;
  if (!isNearScrollBottom(el.collectionGrid)) return;
  searchCollectionCards({ append: true });
}

async function switchCollectionGame() {
  el.collectionGameFilter.value = appGame(el.collectionGameFilter.value);
  await loadGameSets(el.collectionGameFilter.value);
  el.collectionSeriesSelect.value = "";
  renderCollectionSeriesOptions();
  syncCollectionFilterVisibility();
  syncCollectionFilterOptions();
  clearCollectionFilters(false);
  searchCollectionCards();
}

function syncCollectionFilterVisibility() {
  const supportsAdvancedFilters = isWeissGame(el.collectionGameFilter.value) || isUnionArenaGame(el.collectionGameFilter.value);
  for (const item of document.querySelectorAll(".collection-weiss-filter")) item.hidden = !supportsAdvancedFilters;
}

function syncCollectionFilterOptions() {
  const options = BUILDER_FILTER_OPTIONS[appGame(el.collectionGameFilter.value)];
  replaceSelectOptions(el.collectionTypeFilter, options.types);
  replaceSelectOptions(el.collectionColorFilter, options.colors);
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
  el.collectionSortInput.value = "series";
  if (search) searchCollectionCards();
}

function resultCountText(shown, total) {
  if (total > shown) return `${shown.toLocaleString()} / ${total.toLocaleString()} shown`;
  return `${shown.toLocaleString()} shown`;
}

function loadMoreNote(hasMore) {
  if (hasMore) return `<div class="builder-note grid-wide">Scroll to load more</div>`;
  return "";
}

function isNearScrollBottom(element) {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - 240;
}

function renderCollectionCards() {
  el.collectionResultCount.textContent = resultCountText(state.collectionResults.length, state.collectionResultsTotal);
  const cardsHtml = state.collectionResults.map((card, index) => `
    <article class="collection-card" data-collection-card="${index}" tabindex="0">
      <div class="builder-card-media">
        ${card.imageUrl ? `<img src="${escapeAttr(card.imageUrl)}" alt="">` : ""}
        ${card.ownedQty ? `<span>x${card.ownedQty}</span>` : ""}
        ${restrictionOverlayHtml(card, el.collectionGameFilter.value)}
      </div>
      <div>
        <strong>${escapeHtml(card.name)}</strong>
        <span>${escapeHtml(card.number)} - ${escapeHtml(card.cardType || "")} ${escapeHtml(card.color || "")}</span>
        ${restrictionBadgeHtml(card, el.collectionGameFilter.value)}
      </div>
      <div class="collection-controls">
        <button data-collection-minus="${escapeAttr(card.number)}">-</button>
        <input data-collection-qty="${escapeAttr(card.number)}" type="number" min="0" value="${Number(card.ownedQty || 0)}">
        <button data-collection-plus="${escapeAttr(card.number)}">+</button>
      </div>
    </article>
  `).join("");
  el.collectionGrid.innerHTML = cardsHtml
    ? `${cardsHtml}${loadMoreNote(state.collectionResultsHasMore, state.collectionResultsLoading)}`
    : `<div class="builder-note grid-wide">No cards found.</div>`;

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
  const isHolo = isHololiveGame(el.builderGameInput.value);
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
  el.builderResultCount.textContent = resultCountText(state.builderResults.length, state.builderResultsTotal);
  const cardsHtml = state.builderResults.map((card, index) => {
    const selectedQty = builderQtyFor(card.number);
    return `
    <article class="builder-card ${selectedQty ? "in-deck" : ""}" data-builder-card="${index}" tabindex="0">
      <div class="builder-card-media">
        ${card.imageUrl ? `<img src="${escapeAttr(card.imageUrl)}" alt="">` : ""}
        ${selectedQty ? `<span>x${selectedQty}</span>` : ""}
        ${restrictionOverlayHtml(card, el.builderGameInput.value)}
      </div>
      <div>
        <strong>${escapeHtml(card.name)}</strong>
        <span>${escapeHtml(card.number)} - ${escapeHtml(card.cardType || "")} ${escapeHtml(card.color || "")}</span>
        ${restrictionBadgeHtml(card, el.builderGameInput.value)}
      </div>
      <button data-builder-add="${index}">Add</button>
    </article>
  `;
  }).join("");
  el.builderResults.innerHTML = cardsHtml
    ? `${cardsHtml}${loadMoreNote(state.builderResultsHasMore, state.builderResultsLoading)}`
    : `<div class="builder-note grid-wide">No cards found.</div>`;

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

  if (isWeissGame(el.builderGameInput.value) && !el.builderSeriesSelect.value) {
    el.builderSeriesSelect.value = seriesIdForCodes([titleCode(card.number)]);
  }
  syncBuilderSeriesButton();
  renderBuilderDeck();
  if (isHololiveGame(el.builderGameInput.value) && isOshiCard(card) && el.builderTypeFilter.value) {
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
  el.builderDeckCount.textContent = el.builderGameInput.value === "Riftbound" ? `${total} cards` : `${total}/50 cards`;
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
  const v = isHololiveGame(el.builderGameInput.value)
    ? validateHololiveDeck(state.builderCards, { restrictions: currentRestrictionsForGame(el.builderGameInput.value) })
    : el.builderGameInput.value === "Riftbound"
      ? validateRiftboundDeck(state.builderCards, { restrictions: currentRestrictionsForGame(el.builderGameInput.value) })
      : isUnionArenaGame(el.builderGameInput.value)
        ? validateUnionArenaDeck(state.builderCards, el.builderGameInput.value, { restrictions: currentRestrictionsForGame(el.builderGameInput.value) })
      : validateWeissDeck(state.builderCards, { selectedSeries: selectedBuilderSeries(), restrictions: currentRestrictionsForGame(el.builderGameInput.value) });
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
    id: card.id || "",
    variantId: card.variantId || "",
    cardId: card.cardId || "",
    number: card.number,
    name: card.name,
    game,
    section: builderSection(card, game),
    cardType: card.cardType || "",
    color: card.color || "",
    level: card.level || "",
    bloomLevel: card.bloomLevel || "",
    cost: card.cost || "",
    energy: card.energy || "",
    energyCost: card.energyCost || "",
    generatedEnergy: card.generatedEnergy || "",
    ap: card.ap || "",
    power: card.power || "",
    bp: card.bp || "",
    might: card.might || "",
    mightBonus: card.mightBonus || "",
    maxCopies: card.maxCopies || "",
    hp: card.hp || "",
    life: card.life || "",
    batonPass: card.batonPass || "",
    soul: card.soul || "",
    trigger: card.trigger || "",
    rarity: card.rarity || "",
    text: card.text || card.abilityText || "",
    cardSet: card.cardSet || "",
    setCode: card.setCode || "",
    set: card.set || "",
    series: card.series || "",
    seriesName: card.seriesName || "",
    abbreviation: card.abbreviation || "",
    originalId: card.originalId || "",
    isAlternate: Boolean(card.isAlternate),
    features: card.features || "",
    featureList: Array.isArray(card.featureList) ? card.featureList : [],
    supertype: card.supertype || "",
    variantType: card.variantType || "",
    variantLabel: card.variantLabel || "",
    artist: card.artist || "",
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    arts: Array.isArray(card.arts) ? card.arts : [],
    oshiSkills: Array.isArray(card.oshiSkills) ? card.oshiSkills : [],
    extra: card.extra || { label: "", text: "" },
    extraText: card.extraText || card.extra?.text || "",
    isExtra: Boolean(card.isExtra || card.extraText || card.extra?.text),
    tags: isUnionArenaGame(game) ? "" : card.tags || "",
    tagsList: isUnionArenaGame(game) ? [] : Array.isArray(card.tagsList) ? card.tagsList : [],
    imageUrl: card.imageUrl || "",
    rawImageUrl: card.rawImageUrl || "",
    renderedImagePageUrl: card.renderedImagePageUrl || "",
    detailUrl: card.detailUrl || "",
    jpName: card.jpName || "",
    jpText: card.jpText || "",
    jpAbilityText: card.jpAbilityText || "",
    translatedName: card.translatedName || "",
    translatedText: card.translatedText || "",
    translationSource: card.translationSource || "",
    translationNotes: card.translationNotes || "",
  };
}

function hasHololiveOshi(cards) {
  return cards.some(isOshiCard);
}

function primeHololiveOshiFilter() {
  if (isHololiveGame(el.builderGameInput.value) && !hasHololiveOshi(state.builderCards)) {
    el.builderTypeFilter.value = "Oshi";
  }
}

function isOshiCard(card) {
  return String(card.cardType || card.section || "").toLowerCase().includes("oshi");
}

function isHololiveCheerCard(card) {
  return String(card.cardType || card.section || "").toLowerCase().includes("cheer");
}

function isHololiveExtraCard(card) {
  return Boolean(card.isExtra)
    || /you may include any number/i.test(`${card.extraText || ""} ${card.extra?.text || ""}`);
}

function builderSection(card, game) {
  return normalizeDeckSection(card, game);
}

function builderSeriesId() {
  if (isHololiveGame(el.builderGameInput.value)) {
    const sets = [...new Set(state.builderCards.flatMap((card) => String(card.cardSet || "").split(/\r?\n/).map((set) => set.trim()).filter(Boolean)))];
    const match = builderSeriesOptions().find((set) => sets.includes(set.name));
    return match?.id || "";
  }
  if (el.builderGameInput.value === "Riftbound") {
    const sets = [...new Set(state.builderCards.flatMap((card) => [card.setCode, card.set, card.cardSet].map((set) => String(set || "").trim()).filter(Boolean)))];
    const match = state.riftboundSets.find((set) => sets.includes(String(set.id || "")) || sets.includes(String(set.code || "")) || sets.includes(String(set.name || "")));
    return match?.id || "";
  }
  if (isUnionArenaGame(el.builderGameInput.value)) {
    const sets = [...new Set(state.builderCards.flatMap((card) => [card.abbreviation, card.series, card.seriesName, card.cardSet].map((set) => String(set || "").trim()).filter(Boolean)))];
    const match = builderSeriesOptions().find((set) => sets.includes(String(set.id || "")) || sets.includes(String(set.code || "")) || sets.includes(String(set.name || "")));
    return match?.id || "";
  }
  const codes = [...new Set(state.builderCards.map((card) => titleCode(card.number)).filter(Boolean))];
  return seriesIdForCodes(codes);
}

function seriesIdForCodes(codes) {
  if (!codes.length) return "";
  const normalized = codes.map((code) => code.toUpperCase());
  const match = builderSeriesOptions().find((series) => {
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

function appGame(value) {
  const game = String(value || "").trim();
  if (game === "Weiss Schwarz" || game === "Weiss Schwarz (EN)") return "Weiss Schwarz (EN)";
  if (game === "Weiss Schwarz JP" || game === "Weiss Schwarz (JP)") return "Weiss Schwarz (JP)";
  if (game === "Union Arena" || game === "Union Arena (EN)") return "Union Arena (EN)";
  if (game === "Union Arena JP" || game === "Union Arena (JP)") return "Union Arena (JP)";
  if (game === "Hololive JP" || game === "Hololive OCG JP" || game === "Hololive OCG (JP)") return "Hololive OCG (JP)";
  if (game === "Hololive" || game === "Hololive OCG" || game === "Hololive OCG EN" || game === "Hololive OCG (EN)") return "Hololive OCG (EN)";
  if (game === "Hololive OCG (JP)" || game === "Riftbound") return game;
  return "Weiss Schwarz (EN)";
}

function isWeissGame(value) {
  const game = appGame(value);
  return game === "Weiss Schwarz (EN)" || game === "Weiss Schwarz (JP)";
}

function isHololiveGame(value) {
  const game = appGame(value);
  return game === "Hololive OCG (EN)" || game === "Hololive OCG (JP)";
}

function isUnionArenaGame(value) {
  const game = appGame(value);
  return game === "Union Arena (EN)" || game === "Union Arena (JP)";
}

function deckCardSort(deck, a, b) {
  if (deck.game === "Riftbound" || isUnionArenaGame(deck.game)) {
    return deckSectionOrder(a, deck.game) - deckSectionOrder(b, deck.game)
      || String(a.number || "").localeCompare(String(b.number || ""));
  }
  return Number(isClimax(a)) - Number(isClimax(b)) || String(a.number || "").localeCompare(String(b.number || ""));
}

function isPiltoverDeckUrl(value) {
  return /piltoverarchive\.com\/decks\/view\/[0-9a-f-]{36}/i.test(String(value || "").trim())
    || /^[0-9a-f-]{36}$/i.test(String(value || "").trim());
}

function isExburstUnionArenaDeckUrl(value) {
  return /exburst\.dev\/ua\/(?:en\/)?deck\/\d+/i.test(String(value || "").trim())
    || /exburst\.dev\/ua\/(?:en\/)?deckbuilder\/\d+/i.test(String(value || "").trim());
}

function isEncoreDeckUrl(value) {
  return /encoredecks\.com/i.test(String(value || "").trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formDeck() {
  const game = appGame(el.gameInput.value);
  const weissLocale = game === "Weiss Schwarz (JP)" || el.weissJpImportInput.checked ? "jp" : "en";
  return {
    id: state.selectedId,
    name: el.nameInput.value.trim(),
    game: game === "Weiss Schwarz (EN)" && weissLocale === "jp" ? "Weiss Schwarz (JP)" : game,
    status: el.statusInput.value,
    tags: el.tagsInput.value.trim(),
    imageUrl: el.imageUrlInput.value.trim(),
    weissLocale,
    sourceUrl: el.sourceUrlInput.value.trim(),
    notes: el.notesInput.value.trim(),
    cards: selectedDeck()?.cards || [],
  };
}

function selectedDeck() {
  return state.decks.find((deck) => deck.id === state.selectedId);
}

function emptyDeck() {
  return { name: "", game: "Weiss Schwarz (EN)", status: "Testing", cards: [] };
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
    sections: {},
  };

  for (const card of deck.cards || []) {
    const qty = Number(card.qty || 1);
    counts.total += qty;
    const section = normalizeDeckSection(card, deck.game);
    counts.sections[section] = (counts.sections[section] || 0) + qty;

    if (section === "Oshi") counts.oshi += qty;
    else if (section === "Cheer") counts.cheer += qty;
    else if (section === "Climax") counts.climax += qty;
    else if (isClimax(card)) counts.climax += qty;
    else counts.main += qty;
  }

  counts.displayTotal = isHololiveGame(deck.game) ? counts.main : counts.total;
  return counts;
}

function countSummary(deck) {
  const counts = deckCounts(deck);
  if (isHololiveGame(deck.game)) {
    return `Main ${counts.main} / Cheer ${counts.cheer} / Oshi ${counts.oshi}`;
  }
  if (isUnionArenaGame(deck.game)) {
    return `Main ${counts.sections.Main || 0} / AP ${counts.sections["Action Points"] || 0}`;
  }
  if (deck.game === "Riftbound") {
    return sectionGroupsForGame(deck.game)
      .map((section) => [section, counts.sections[section] || 0])
      .filter(([section, count]) => section !== "Sideboard" || count)
      .map(([section, count]) => `${section} ${count}`)
      .join(" / ");
  }
  return `${counts.total} cards`;
}

function isClimax(card) {
  const typeText = [
    card.type,
    card.cardType,
    card.card_kind,
    card.cardKind,
    card.kind,
    card.section,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return typeText.includes("climax") || typeText.includes("cx") || typeText.includes("\u30af\u30e9\u30a4\u30de\u30c3\u30af\u30b9");
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
