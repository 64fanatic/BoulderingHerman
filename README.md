# HermanVibeSlop

**Boulder Herman** — a Boulder Dash-style game with 100 procedurally generated caves.

## Play

Open `index.html` in a browser (no build, no server). ES modules may be blocked on `file://` in some
browsers; if so, run `python3 -m http.server` and open http://localhost:8000.

## Controls

- Move: arrows / WASD
- SPACE: start / continue / next cave
- C: continue saved game
- P: pause, R: restart cave

## Rules

Dig through dirt, push boulders, collect diamonds. Grab enough diamonds to open the exit door,
then step through. Falling boulders crush you, fireflies and butterflies alike — but butterflies
burst into diamonds.

## Structure

- `index.html` — page shell and HUD
- `styles.css` — all styling
- `src/engine.js` — pure game logic: cave generation, physics, enemies, movement (no DOM)
- `src/main.js` — rendering, input, game state machine
# Boulder Herman
