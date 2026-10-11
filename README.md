# Bouldering Herman and the Sloppy Rocks

This is a Boulder Dash-style game with 100 procedurally generated caves. Static on your end, not a random 100 each launch. Cool future maybe idea. This is actually a fan game inspired by a clone called Herman and the Falling Rocks for Windows 3.x developed by CARMACON, Inc. who incredibly still has an active website where you can...mail order your full release physical game after enjoying the Shareware (demo) release from 1992. Just click on the amazing box art:

[![Herman and the Falling Rocks](readme/images/frk_pk.gif)](https://carmacon.com/hermfrk.html)

https://www.mobygames.com/game/233178/herman-and-the-falling-rocks/

That concept is the base I'm working with and I'll add some more features beyond what the 1992 original was capable of in my agentic vibe slop curiosity project.

Check out LGR's game review for more historical context:

[![LGR's Herman and the Falling Rocks review](readme/images/OIP.jpg)](https://www.youtube.com/watch?v=k5U0mz8ZPm0)

The more caves you clear, the harder and meaner the cave generator gets. To a point anyway and this is WIP. I'm focused on making that curve actually fun, it's roughly sketched in currently.

## Play

Downloads from the [latest release](https://github.com/64fanatic/BoulderingHerman/releases/latest):

- [Linux AppImage](https://github.com/64fanatic/BoulderingHerman/releases/download/v0.5.1/Bouldering-Herman-and-the-Sloppy-Rocks-0.5.1.AppImage)
- [Windows executable](https://github.com/64fanatic/BoulderingHerman/releases/download/v0.5.1/Bouldering.Herman.and.the.Sloppy.Rocks.0.5.1.exe)

Or download the repo and open index.html.

The game screen integer scales with your browser window. No fractional scaling.

### AI PlayTest mode

On the title screen, press left/right on the START item to switch between **NORMAL** and **AI PLAYTEST**. In AI PLAYTEST the game plays itself. Currently the bot can get to Cave 25 before it gets stuck.

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
  <tr>
    <td align="center"><img src="readme/images/thumbs/revision%203-1.png" width="300" alt="Revision 3-1"></td>
    <td align="center"><img src="readme/images/thumbs/revision%203-2.png" width="300" alt="Revision 3-2"></td>
    <td align="center"><img src="readme/images/thumbs/revision%204-1.png" width="300" alt="Revision 4-1"></td>
  </tr>
  <tr>
    <td align="center">revision 3-1</td>
    <td align="center">revision 3-2</td>
    <td align="center">revision 4-1</td>
  </tr>
</table>

## Controls

- **Move:** arrow keys or WASD. Herman digs where he walks.
- **SPACE:** the universal "yes" — pick menu items, start, retry, keep going, next cave.
- **P** (or **ESC**): pause. The pause menu offers a resume or a clean quit back to the title.
- **R:** restart the cave. We won't judge. Much.
- **Menus:** navigate with the movement keys. LEVEL SELECT is a numpad grid. The AUDIO sub-menu has volume sliders and a sound test.

**Gamepads work too** (XInput and DirectInput): stick or D-pad moves and navigates, **A** is SPACE, **B** is ESC, **Start** pauses, **Select** restarts the cave. Plug in and press any button.

## Gameplay Description:

Dig through dirt, avoid boulders and other surprises. Collect flowers until the exit door deigns to open, and descend. The doors require more flowers the deeper you go, and eventually they need three keys on top of the flowers, so keep your eyes open.

A locked door is gray. When you've unlocked a door it will flash yellow, or flashing red with its key slots the moment you can actually walk through it.

A word on boulders because they have some genre rules. Dig out the dirt under one and stand
there, and it will hover over your head politely waiting. Step out from beneath and it drops. If the boulder
perches on something round (Flowers count as round) it tries to slide off sideways/diagonal.
You can push singular boulders if there's empty space around them.

The Butterflies have a secret. Fireflies are aggressive and give you nothing but trouble. Decide for yourself risk/reward.
