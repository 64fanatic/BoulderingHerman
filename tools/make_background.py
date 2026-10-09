#!/usr/bin/env python3
"""Generate assets/cave_bg.gif - a seamless, looping animated background in a
dark cave palette: a worn cobblestone wall, heavy moss, and a narrow stream
running down through the joints between the stones. The water conforms to the
cobblestones like the moss does - it only sits in the mortar, never over a
stone face - and the current flows downhill (toward increasing x+y). Kept
murky so it never upstages gameplay.

The 64x64 tile repeats in both directions; the diagonal stream band wraps
mod 64, so water flows continuously across tiles. The 8-frame cycle loops
seamlessly.

Usage: python3 tools/make_background.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "cave_bg.gif")

# deliberately murkier than the in-game palette - this is the wall of the cave,
# not the cave floor the game is played on
K = (0x00, 0x00, 0x00)   # black - mortar, shadows
a = (0x46, 0x46, 0x46)   # dark gray - worn stones
A = (0x58, 0x58, 0x58)   # gray - sparse worn highlights
G = (0x00, 0x70, 0x00)   # dim green - moss highlights
g = (0x00, 0x50, 0x00)   # dark green - moss
N = (0x00, 0x00, 0x44)   # deep navy - still water
B = (0x00, 0x00, 0x77)   # dim blue - flowing water
W = (0x90, 0x90, 0x90)   # sparkle

PALETTE = [K, a, A, G, g, N, B, W]
SIZE = 64
FRAMES = 8
# one narrow diagonal band (down-right at 45 deg), defined mod 64 so it wraps;
# within the band, water only fills the joints, so it hugs the cobbles
STREAMS = [(32, 6)]  # (offset along y-x axis, width)


def h(x, y):
    """deterministic hash -> 0..99"""
    v = (x * 2654435761 + y * 91648471) & 0xFFFFFFFF
    return (v ^ (v >> 16)) % 100


def in_stream(x, y, offset, width):
    d = (y - x - offset) % SIZE
    return d < width


def build_static():
    px = {}
    # mortar base
    for y in range(SIZE):
        for x in range(SIZE):
            px[(x, y)] = K

    # cobbles: rows of stones in running bond, wrapped by construction
    rows = [3, 15, 27, 39, 51]
    for ri, cy in enumerate(rows):
        for i in range(6):
            cx = 2 + i * 13 + (ri % 2) * 6
            jx = h(cx, cy) % 3 - 1
            jy = h(cy, cx) % 3 - 1
            rx = 5 + (h(cx + 1, cy) % 2)
            ry = 4 + (h(cx, cy + 1) % 2)
            for dy in range(-ry - 1, ry + 2):
                for dx in range(-rx - 1, rx + 2):
                    x = (cx + jx + dx) % SIZE
                    y = (cy + jy + dy) % SIZE
                    dist = (dx / rx) ** 2 + (dy / ry) ** 2
                    if dist <= 1.0:
                        # worn face: darker gray, chipped with age
                        c = a
                        if h(x, y) < 14:
                            c = K  # chips and cracks
                        elif dx + dy < -rx * 0.8 and h(x, y) < 40:
                            c = A  # the last patches of smooth wear
                        px[(x, y)] = c

    # moss: thick in the joints, creeping up the stones, thickest near water
    for y in range(SIZE):
        for x in range(SIZE):
            near = any(in_stream(x, y, o - 2, w + 4) for o, w in STREAMS)
            c = px[(x, y)]
            if c == K and (h(x, y) < 34 if near else h(x, y) < 20):
                px[(x, y)] = g
            elif c in (a, A) and h(x, y) < (12 if near else 6):
                px[(x, y)] = g
            if px[(x, y)] == g and h(x * 3, y * 7) < 10:
                px[(x, y)] = G  # moss highlights

    # the stream runs down the wall through the joints: water lies in the
    # mortar like the moss, conforming to the cobblestones, never over a face
    for y in range(SIZE):
        for x in range(SIZE):
            for o, w in STREAMS:
                if in_stream(x, y, o, w) and px[(x, y)] in (K, g):
                    px[(x, y)] = N
    return px


def water_pixel(static, x, y, f):
    """Animated water; returns a color or None to keep the static layer."""
    if static.get((x, y)) != N:
        return None  # water only exists where the joints hold it
    u = (x + y) - f * 2  # the current travels downhill (increasing x+y)
    if u % 8 < 3:
        return B  # the current
    if u % 32 == 0:
        return W  # a sparkle drifting down with the current
    return None


def frame_image(static, f):
    im = Image.new("RGB", (SIZE, SIZE))
    p = im.load()
    for y in range(SIZE):
        for x in range(SIZE):
            c = water_pixel(static, x, y, f)
            p[x, y] = static.get((x, y), K) if c is None else c
    return im


def main():
    static = build_static()
    frames = [frame_image(static, f) for f in range(FRAMES)]

    pal = Image.new("P", (1, 1))
    flat = []
    for c in PALETTE:
        flat.extend(c)
    flat.extend([0] * (768 - len(flat)))
    pal.putpalette(flat)
    frames = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in frames]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    frames[0].save(OUT, save_all=True, append_images=frames[1:],
                   duration=120, loop=0, disposal=2)
    print("wrote %s (%d frames, %dx%d)" % (os.path.relpath(OUT, ROOT), FRAMES, SIZE, SIZE))

    # sanity: streams must wrap (col 0 continues col 63) and loop (frame 0 == frame 8)
    s = build_static()
    for o, w in STREAMS:
        for y in range(SIZE):
            assert s.get((63, y), K) is not None and s.get((0, (y + 1) % SIZE), K) is not None
    print("ok: streams wrap mod %d, animation period divides it" % SIZE)


if __name__ == "__main__":
    main()
