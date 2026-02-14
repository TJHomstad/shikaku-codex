# Shikaku (MVP Scaffold)

This repo now contains an initialized desktop-web Shikaku scaffold based on `PRD.md`.

## Run locally

1. `npm run serve`
2. Open `http://localhost:4173`

## Included in this init

- Home, Level Select, Puzzle, Solved modal flow
- Dedicated `how-to-play.html` and `privacy.html`
- Rectangle draw/erase interactions with validation, red invalid-box highlighting, and toasts
- Board lock until “Press here to begin”, timer, undo/redo, pause, clear all, restart
- Live drag-size indicator while selecting rectangles
- Auto-fill for clue value `1` cells on fresh load/restart
- Local persistence for in-progress puzzle and top 50 times per puzzle
- Sample canonical catalog in `assets/` (Levels 1-10 for each size/difficulty)

## Catalog notes

The PRD target catalog is 1,250 puzzles. This initialization currently includes the first 10 levels for each size/difficulty pair (250 puzzles total) so the app is runnable immediately.

## Current status (February 14, 2026)

- Implemented: playable desktop MVP with local persistence and deterministic static catalog assets.
- Implemented: random-level selection from available canonical levels for selected size/difficulty.
- Pending: expand catalog from 250 to 1,250 puzzles.
- Pending: add solver-backed solvability/uniqueness validation pipeline for final curation.

To regenerate sample assets:

- `npm run generate:catalog`
