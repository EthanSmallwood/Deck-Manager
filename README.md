# Deckmanager

Local deck manager for Weiss Schwarz, Hololive OCG, Riftbound, and Union Arena decks, with card database tools, deck building, collection tracking, proxy image helpers, and Tabletop Simulator export.

## Run

Use Node.js from the project root:

```powershell
npm start
```

or:

```powershell
node app/server.mjs
```

Then open the printed local URL, usually:

```text
http://127.0.0.1:17777/
```

Windows helper scripts are also included:

```text
Start-Deckmanager.bat
Start-Deckmanager.ps1
```

## Features

- Save and manage local deck records.
- Import Weiss Schwarz decks from pasted lists, Encore Decks URLs, and Decklog URLs.
- Import Hololive OCG decks from Decklog URLs.
- Import Riftbound decks from Piltover Archive URLs, with deck sections for legend, champion, deck, runes, battlefields, and sideboard.
- Import Union Arena decks from ExBurst JP and EN URLs, with automatic game detection.
- Render translated Union Arena JP card images from ExBurst and replace deck images from the `Translate` action.
- Build/update local Weiss, Hololive, Riftbound, and Union Arena card databases from scraper scripts.
- Build decks from searchable card databases, with scroll-to-load results.
- Track owned cards in the collection page, including owned/unowned views and sorting by series, number, name, or quantity owned.
- Show missing/needs-buying counts for saved decks.
- Export supported decks as Tabletop Simulator saved object JSON.

## Import URLs

Paste a supported URL into the import box and press `Import`. Deckmanager detects the game where the source makes that possible.

Supported sources include:

- Encore Decks Weiss Schwarz deck URLs.
- Decklog Weiss Schwarz and Hololive OCG deck URLs.
- Piltover Archive Riftbound deck URLs, such as `https://piltoverarchive.com/decks/view/...`.
- ExBurst Union Arena JP deck URLs, such as `https://exburst.dev/ua/deck/...`.
- ExBurst Union Arena EN deck URLs, such as `https://exburst.dev/ua/en/deck/...`.

For Union Arena JP decks, the `Translate` button uses ExBurst's rendered translated card view for each unique card and caches the PNG output in `outputs/ua-rendered/`.

## Tabletop Simulator Export

The `TTS` button exports the selected saved deck.

Weiss Schwarz exports use generated local card sheets in `outputs/tts/`. Character cards include a simple power counter in TTS.

Hololive OCG exports use individual `CardCustom` entries shaped like existing workshop Hololive objects. Oshi, Cheer, and holomem cards are tagged for matching table snap zones. Support Mascot, Fan, and Tool cards can be equipped as markers from the right-click menu.

Keep Deckmanager running while Tabletop Simulator imports any generated local URLs. After importing, upload custom assets to Steam Cloud inside TTS and save the object again.

## Settings

Open `Settings` in the app to:

- Build the Weiss card database.
- Build the Hololive card database.
- Build the Riftbound card database.
- Build the Union Arena EN and JP card databases.
- Clear generated TTS card and sheet image caches.
- Choose the folder where exported TTS saved object JSON files are written.

By default, the TTS export folder is:

```text
Documents\My Games\Tabletop Simulator\Saves\Saved Objects\Deckmanager Export
```

## Local Data

Runtime data is stored locally:

- `data/decks.json` - saved decks
- `data/settings.json` - app settings
- `data/collection.json` - owned card counts
- `data/cards/weiss-cards.json` - Weiss card database
- `data/cards/hololive-cards.json` - Hololive card database
- `data/cards/riftbound-cards.json` - generated Riftbound card database
- `data/cards/union-arena-cards.json` - generated Union Arena EN card database
- `data/cards/union-arena-jp-cards.json` - generated Union Arena JP card database
- `outputs/` - generated TTS exports/assets

The clear cache setting removes generated image folders under `outputs/tts/` while leaving saved deck JSON and app data alone.

Personal/runtime files, generated output folders, and newly generated card databases are ignored by git where appropriate.

## Database Scripts

The card database builders can also be run from the command line:

```powershell
npm run scrape:riftbound
npm run scrape:union-arena
npm run scrape:union-arena-jp
```

Union Arena JP render helpers can be run directly when debugging a single card:

```powershell
npm run render:union-arena-card -- --number NIK-1-006
```

## Notes

This is a local-first app. It does not need a hosted backend, and it expects to be run from the project folder so relative paths for card databases and generated TTS assets resolve correctly.
