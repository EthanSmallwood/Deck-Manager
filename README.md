# Deckmanager

Local deck manager for Weiss Schwarz and Hololive OCG decks, with card database tools, deck building, collection tracking, and Tabletop Simulator export.

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
- Build/update local Weiss and Hololive card databases from the official English card lists.
- Build decks from searchable card databases, with scroll-to-load results.
- Track owned cards in the collection page, including owned/unowned views and sorting by series, number, name, or quantity owned.
- Show missing/needs-buying counts for saved decks.
- Export supported decks as Tabletop Simulator saved object JSON.

## Tabletop Simulator Export

The `TTS` button exports the selected saved deck.

Weiss Schwarz exports use generated local card sheets in `outputs/tts/`. Character cards include a simple power counter in TTS.

Hololive OCG exports use individual `CardCustom` entries shaped like existing workshop Hololive objects. Oshi, Cheer, and holomem cards are tagged for matching table snap zones. Support Mascot, Fan, and Tool cards can be equipped as markers from the right-click menu.

Keep Deckmanager running while Tabletop Simulator imports any generated local URLs. After importing, upload custom assets to Steam Cloud inside TTS and save the object again.

## Settings

Open `Settings` in the app to:

- Build the Weiss card database.
- Build the Hololive card database.
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
- `outputs/` - generated TTS exports/assets

The clear cache setting removes generated image folders under `outputs/tts/` while leaving saved deck JSON and app data alone.

The personal/runtime files and generated output folders are ignored by git where appropriate.

## Notes

This is a local-first app. It does not need a hosted backend, and it expects to be run from the project folder so relative paths for card databases and generated TTS assets resolve correctly.
