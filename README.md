# HermanVibeSlop

**Bouldering Herman and the Sloppy Rocks** — a Boulder Dash-style game with 100 procedurally generated caves.

That's right: one hundred. Every single one of them conjured out of thin air by an algorithm, which means no two playthroughs feel quite the same, and every so often the cave generator hands you something genuinely mean. You've been warned.

## Play

Open `index.html` in a browser and you're off — no build step, no server, no ceremony. If your browser is the suspicious type and blocks ES modules on `file://` (some do), just run:

```
python3 -m http.server
```

and mosey on over to http://localhost:8000.

The game grows with your window, but only in whole-number multiples of its native
size — 2x, 3x, whatever fits — so the pixels stay razor sharp. No blurry
fractional stretching in this cave.

## Development, one revision at a time

This whole game is an experiment in building with AI: each revision below came
out of the same loop — describe the change, let the agent make it, play the
cave, decide what's next. The style, the sounds, the music, the royal logo,
the border rats: all of it accreted revision by revision like this.

<table>
  <tr>
    <td align="center"><img src="readme/images/thumbs/revision%201.png" width="300" alt="Revision 1"></td>
    <td align="center"><img src="readme/images/thumbs/revision%202.png" width="300" alt="Revision 2"></td>
    <td align="center"><img src="readme/images/thumbs/revision%202-2.png" width="300" alt="Revision 2-2"></td>
  </tr>
  <tr>
    <td align="center">revision 1</td>
    <td align="center">revision 2</td>
    <td align="center">revision 2-2</td>
  </tr>
</table>

## Controls

- **Move:** arrow keys or WASD. Herman digs where he walks.
- **SPACE:** start the game, keep going, next cave. The universal "yes" button.
- **C:** pick up right where you left off in a saved game.
- **P:** pause. Coffee breaks are allowed.
- **R:** restart the cave. We won't judge. Much.

## Rules

Dig through dirt. Shove boulders around like you own the place. Collect flowers until the exit door deigns to open, then stroll through it like the champion you are. The doors ask for more flowers the deeper you go — and from cave 11 on they turn red and demand three keys on top of it, so keep your eyes open for the little gold things.

A locked door is a gray door. It only wakes up — flashing yellow, or flashing red with its key slots — the moment you can actually walk through it.

A word on boulders, because they have rules now. Dig out the dirt under one and stand
there, and it will hover over your head, politely waiting. Step out from under it,
though, and it drops — with a rumble while it rolls and a thud when it lands. If it
perches on something round it tries to slide off sideways, and if a falling boulder
catches you, it moves right into your tile and that's a SPLAT: the character is
deleted, a splat sound plays, and the cave does not pause for your funeral. Feel free
to watch the avalanche you caused behind the dimmed game-over screen before pressing
space to try again.

The butterflies have a party trick, though: pop one with a boulder and it bursts into
flowers. Decide for yourself whether that makes it better or worse.

And mind the cave itself: the generator is out to get you. It balances boulders on
tempting out-of-the-way flowers and posts a sniper rock in the column above the exit
door, waiting for someone who isn't paying attention. The walls thicken and the
boulders pile up as the caves get deeper, and the clock gets meaner too.

## Structure

For the curious and the code-inclined:

- `index.html` — the page shell and HUD
- `styles.css` — all the pretty
- `src/engine.js` — the brain: pure game logic. Cave generation, physics, enemies, movement. Zero DOM, zero drama.
- `src/main.js` — the face: rendering, input, and the game state machine that keeps it all honest
- `tiles/` — every 16x16 sprite as an editable PNG, plus the palette
- `tools/tiles_io.py` — bake your tile edits into the game (see `tiles/README.md`)
- `assets/cave_bg.gif` — the animated mossy-cobblestone-and-water background
- `tools/make_background.py` — regenerate that background
- `assets/frame.png` — the cobble-and-vine border around the game window
- `tools/make_frame.py` — regenerate that border
- `assets/hud_cobble.gif` — the rotating brick-red cobblestone HUD bar
- `tools/make_hud_gif.js` — regenerate that bar
- `assets/sfx/` — the boulder sounds: rumble, thud, splat, and Herman's steps
- `tools/make_sfx.py` — synthesize those sounds from scratch (royalty-free by construction)
- `readme/images/` — full-size development screenshots; `tools/make_thumbs.py` shrinks them into `readme/images/thumbs/` for the grid above

Feeling artistic? Every sprite in the game is a 16x16 PNG you can redraw in
LibreSprite — Herman's creepy purple-lipped face included. Edit a tile, run one
command, and your art is in the game.
