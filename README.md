# slop for flip flop

A pixel-art arcade game about a black Mistral claquette lost on a beach in Koh Samui that drifted
75 km across the Gulf of Thailand and washed up on Koh Tao.

Guide the flip flop north. Avoid surfers, sharks and breaking waves.

## Run it locally

```bash
bun run install-all     # once: uv sync, bun install, generate the API client
mistral apps dev        # Postgres, the API, the web app and the gateway
```

The gateway opens the app; the web app alone is on <http://localhost:3001>.

Without the Mistral CLI, the two halves run on their own, against a Postgres you provide:

```bash
bunx nx run db:migrate   # create the scores table
bunx nx run api:serve    # :3000
bunx nx run web:dev      # :3001
```

## Controls

| Input | Action |
| --- | --- |
| Arrows / WASD | Steer the flip flop |
| Left / Right on SPEED | Change the speed setting |
| Enter / Space | Select, confirm, skip the intro |
| Escape | Back to menu |
| M | Mute |
| Drag | Touch and mouse steering |

## Speed

Set in the menu and remembered between sessions. A slower sea also means a longer crossing, so
spawn rates are scaled by flow to keep hazards-per-km meaningful rather than merely stretching the
clock.

| Level | Flow | Hazards per km | Typical run |
| --- | --- | --- | --- |
| CALM | 0.78x | 0.82x | ~140 s |
| DRIFT | 1.00x | 1.00x | ~110 s |
| SWELL | 1.26x | 1.14x | ~88 s |
| STORM | 1.55x | 1.28x | ~71 s |

## Rules

Each run opens on the Koh Samui beach: two slides on the sand, the swash runs up twice, and the
second one takes the left slide out to sea. Enter skips it.

```
coconut  +60      star  +250 and a glow      turtle  +1 life (max 5)
```

- Three lives. Surfers and sharks cost one on contact; so does a wave wall.
- Waves span the screen with one moving gap — line up early and slip through.
- Sharks drift toward you, so do not sit still.
- Chaining pickups builds a multiplier up to x9; it decays after ~3 seconds.
- Landfall at 75 km pays a 2500 bonus plus 750 per life remaining.

## Layout

```
apps/
├── web/src/game/      the game, as ES modules
│   ├── palette.ts     colour keys the sprite art is authored in
│   ├── font.ts        5x7 pixel font drawn from strings
│   ├── sprites.ts     sprite atlas authored as character rows
│   ├── audio.ts       WebAudio chiptune and sound effects
│   ├── scores.ts      the board: API-backed, localStorage-mirrored
│   ├── world.ts       procedural ocean, islands, menu backdrop
│   ├── entities.ts    player, hazards, pickups, particles
│   ├── game.ts        state machine, spawning, collisions, HUD
│   ├── runtime.ts     canvas scaling, input, fixed-step loop
│   ├── use-game.ts    the React effect that mounts and tears it down
│   └── game-cabinet.tsx   the page around the canvas
└── api/src/api/routers/api/public/scores.py   GET and POST /api/scores

packages/py/db/src/db/
├── models/scores.py       the scores table
└── accessors/scores.py    the only place it is queried
```

All art is generated from code — there are no image or audio files.

The game began as a standalone build: one HTML file, `window` globals, and Node verification
harnesses under `devtools/`. The modules above are that code as ES modules, and the assertions
`devtools/selftest.cjs` made now live in `apps/web/src/game/*.test.ts`.

## High scores

The board is a shared table in Postgres, read and written through `/api/scores`. The browser keeps
its own copy in `localStorage`, so a run offline, or against an API that is down, still records its
score locally and shows the last board it saw.

## Development

```bash
bunx nx run web:test                 # the game's tests, including the 4-minute soak
bunx nx run-many --target=build      # build both apps
bunx nx run-many --target=check      # type-check, and check the API client for drift
bunx nx run db:revision --message "…"  # a migration, after changing a model
```
