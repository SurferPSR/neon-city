# NEON CITY

A small, original browser driving game set in a procedural neon city. All visuals are generated in code; the project does not use brands, characters, music, or models from other games.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Use `W`/`↑` to accelerate, `S`/`↓` to brake or reverse, `A`/`←` to steer left, and `D`/`→` to steer right. Hold `Space` for the handbrake. Press `V` to switch between the chase and overhead cameras, and `Esc` to pause.

## Build

```sh
npm run build
npm run preview
```

## Stage 1 scope

- Procedural 8 × 8 city blocks with instanced buildings, windows, palms, streets, sidewalks, and road markings.
- Rapier rigid-body vehicle with acceleration, braking, handbrake slides, and building collisions.
- Third-person chase camera, stylized sunset-to-night sky, fog, and neon bloom.
- 36 neon orb pickups with a live score counter in the HUD.
- Keyboard controls, start screen, speed HUD, and pause screen.

Later stages from the design brief (traffic, pursuit, spendable currency, radio, rain, and deployment) are not part of this first playable build.
