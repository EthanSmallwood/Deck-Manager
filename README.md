# Deckmanager

Local deck manager for Bushiroad-style card games, starting with Weiss Schwarz.

## Run

```powershell
node app/server.mjs
```

Then open the printed local URL, usually:

```text
http://127.0.0.1:17777/
```

## Current Features

- Stores decks in `data/decks.json`.
- Imports Weiss decks from pasted decklists.
- Imports Encore Decks URLs.
- Resolves Weiss cards from `data/cards/weiss-cards.json`.
- Generates Tabletop Simulator saved objects and local sheet images in `outputs/`.

Keep the app running while Tabletop Simulator imports generated local sheet URLs.

