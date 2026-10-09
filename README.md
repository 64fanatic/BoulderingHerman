# Bouldering Herman and the Sloppy Rocks

This is a Boulder Dash-style game with 100 procedurally generated caves, but it's actually a fan game inspired by Herman and the Falling Rocks for Windows 3.x developed by CARMACON, Inc. who incredibly still has an active website where you can...mail order your full release physical game after enjoying the Shareware (demo) release from 1992.

https://carmacon.com/hermfrk.html

https://www.mobygames.com/game/233178/herman-and-the-falling-rocks/

That concept is the base I'm working with and I'll add some more features beyond what the 1992 original was capable of in my vibe slop edumacation journey, and probably end up going too far is a couple places.

Check out LGR's game review for more historical context:

[![LGR's Herman and the Falling Rocks review](https://img.youtube.com/vi/k5U0mz8ZPm0/maxresdefault.jpg)](https://www.youtube.com/watch?v=k5U0mz8ZPm0)

Procedural generation of course, which means no two play-throughs feel quite the same. The more caves you clear, the harder and meaner the cave generator gets. To a point anyway and this is WIP. I'm focused on making that curve actually fun, it's roughly sketched in currently.

## Play

Releases page for Linux AppImage and Windows executable.

Open `index.html` in a browser and you're off. If your browser is the suspicious type and blocks ES modules on `file://` (some do), just run:

```
python3 -m http.server
```

and then head over to http://localhost:8000.

The game screen integer scales with your web browser window. No fractional scaling in this cave.

## Development, one revision at a time

This whole game is an experiment in building with French tier AI while barely qualifying as a script kiddie: each revision below came
out of the same loop — describe the change, let the agent make it, play the caves, decide what's next.

<table>
  <tr>
    <td align="center"><img src="readme/images/thumbs/revision%201.png" width="300" alt="Revision 1-1"></td>
    <td align="center"><img src="readme/images/thumbs/revision%202.png" width="300" alt="Revision 2-1"></td>
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

## Gameplay Description:

Dig through dirt, avoid boulders and other surprises. Collect flowers until the exit door deigns to open, and descend deeper still. The doors ask for more flowers the deeper you go — and eventually they demand three keys on top of it, so keep your eyes open for the little gold things.

A locked door is a gray door. When you've unlocked a door it will stat flashing yellow, or flashing red with its key slots — the moment you can actually walk through it.

A word on boulders because they have rules now. Dig out the dirt under one and stand
there, and it will hover over your head politely waiting. Step out from under it,
though, and it drops with a rumble while it rolls and a thud when it lands. If the rock
perches on something round it tries to slide off sideways, and if a falling boulder
crushes you, that's a SPLAT.

The butterflies have a party trick: pop one with a boulder and it bursts into
flowers. Decide for yourself risk/reward.

## Feeling Artistic?

Every sprite in the tiles folder is a 16x16 PNG you can redraw in
LibreSprite — Herman's creepy... purple? lipped face included. Edit a tile, run one
command, and your art is in the game.
