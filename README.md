# Shikaku (MVP Scaffold)

This repo now contains an initialized desktop-web Shikaku scaffold based on `PRD.md`.

## Run locally

1. Start API: `npm run serve:api`
2. Start web app: `npm run serve`
3. Open `http://localhost:4173`
4. Optional API override: append `?api_base=http://localhost:8787` to the URL (or set `<meta name="shikaku-api-base" ...>` in `index.html`)
5. Optional secure cookie mode for HTTPS testing: `COOKIE_SECURE=true npm run serve:api`

## Deploy API on Railway

1. In Railway, create a new project from this GitHub repo.
2. Deploy the root service (Railway uses `railway.json` and runs `npm start`).
3. Add a Railway volume and mount it at `/data`.
4. Set environment variables:
- `DATA_DIR=/data`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=Lax`
- `CORS_ORIGINS=https://derpydonut.com,https://www.derpydonut.com,http://localhost:4173,http://127.0.0.1:4173`
5. Add custom domain `api.derpydonut.com` to the Railway service.
6. In DNS, point `api.derpydonut.com` to Railway using the target Railway gives you.

Notes:
- The frontend defaults to `https://api.derpydonut.com` when loaded on `derpydonut.com` or `www.derpydonut.com`.
- If you test against the temporary `*.up.railway.app` URL, use `COOKIE_SAME_SITE=None` and keep `COOKIE_SECURE=true`.
- Example env file: `server/.env.example`.

## Test users

- `Dad` / `donut`
- `Mom` / `donut`
- `Stephen` / `donut`
- `Lydia` / `donut`
- `Emmy` / `tacos`
- `Hazel` / `pizza`

## Included in this init

- Home, Level Select, Puzzle, Solved modal flow
- Guest-first play flow with optional login (first name + password) via local API session cookie
- Global leaderboard (top 15 per level) with unique per-user best time
- Dedicated `how-to-play.html` and `privacy.html`
- Rectangle draw/erase interactions with validation, red invalid-box highlighting, and toasts
- Board lock until “Press here to begin”, timer, undo/redo, pause, clear all, restart
- Live drag-size indicator while selecting rectangles
- Auto-fill for clue value `1` cells on fresh load/restart
- Local persistence for in-progress puzzle and local top 50 times per puzzle
- Full canonical catalog in `assets/` (Levels 1-50 for each size/difficulty)

## Catalog notes

The PRD target catalog is 1,250 puzzles. This build now includes the full 50 levels for each size/difficulty pair.

## Current status (February 14, 2026)

- Implemented: playable desktop MVP with local persistence and deterministic static catalog assets.
- Implemented: random-level selection from available canonical levels for selected size/difficulty.
- Pending: add solver-backed solvability/uniqueness validation pipeline for final curation.

To regenerate catalog assets:

- `npm run generate:catalog`
