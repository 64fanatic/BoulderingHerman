# Tiles

Every 16x16 game tile lives here as an individual PNG you can edit in
[LibreSprite](https://libresprite.github.io/) (or any pixel-art editor).

| File | In the game |
|------|-------------|
| `dirt.png` | diggable dirt |
| `brick.png` | walls (border and interior) |
| `flower.png` | collectibles (the HUD calls them diamonds) |
| `boulder.png` | falling rocks |
| `herman.png` | the man himself |
| `firefly_a.png`, `firefly_b.png` | firefly, two animation frames |
| `butterfly_a.png`, `butterfly_b.png` | butterfly, two animation frames |
| `exit_closed.png`, `exit_open_a.png`, `exit_open_b.png` | exit door, closed and flashing-open |
| `sheet.png` | all tiles in one 4x3 grid, handy for overview |
| `palette.gpl` | the 16-color game palette |

## Editing workflow

1. Open a tile PNG in LibreSprite (e.g. `herman.png`).
2. Load the palette: `Palette > Load Palette` and pick `palette.gpl`.
   You are not forced to use it, but `import` snaps every pixel to the
   nearest of these 16 colors.
3. Paint. Transparent pixels (alpha 0, shown as the checkerboard) are the
   background: the cave shows through them in-game.
4. Save the PNG, then bake your change into the game:

```
python3 tools/tiles_io.py import
```

5. Reload `index.html` and your new tiles are live. Commit both the PNG and
   `src/main.js`.

## Going the other way

If you hand-edit the art arrays in `src/main.js`, regenerate the PNGs:

```
python3 tools/tiles_io.py export
```

The round trip is exact: `export` then `import` leaves `src/main.js`
byte-identical.

## Palette

| Char | Color | Hex |
|-------|-----------|-----------|
| K | black | `#000000` |
| O | olive (dirt) | `#808000` |
| R | dark red | `#800000` |
| r | bright red | `#ff0000` |
| G | bright green | `#00ff00` |
| g | dark green | `#008000` |
| A | gray (boulders) | `#808080` |
| a | dark gray | `#646464` |
| Y | yellow | `#ffff00` |
| N | navy | `#000080` |
| B | blue | `#0000ff` |
| W | light gray | `#f0f0f0` |
| w | white | `#ffffff` |
| S | salmon (Herman's nose) | `#f5918f` |
| V | purple (Herman's lips) | `#c000c0` |
