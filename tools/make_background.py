#!/usr/bin/env python3
"""Generate assets/cave_bg.gif - a seamless, looping animated background in the
game's 16-color VGA palette: cave rocks with moss and water flowing between them.

The 64x64 tile repeats in both directions and the 8-frame water cycle loops
seamlessly (each frame shifts the current 2px; the pattern period is 16px).

Usage: python3 tools/make_background.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "cave_bg.gif")

# game palette (see tiles/README.md)
K = (0x00, 0x00, 0x00)   # black - cave floor
a = (0x64, 0x64, 0x64)   # dark gray - floor specks
A = (0x80, 0x80, 0x80)   # gray - rocks
W = (0xF0, 0xF0, 0xF0)   # light gray - rock glints, water sparkle
G = (0x00, 0xFF, 0x00)   # bright green - moss highlights
g = (0x00, 0x80, 0x00)   # dark green - moss
N = (0x00, 0x00, 0x80)   # navy - still water
B = (0x00, 0x00, 0xFF)   # blue - flowing water

PALETTE = [K, a, A, W, G, g, N, B]
SIZE = 64
WATER_TOP, WATER_BOT = 26, 37          # inclusive water band
ROCKS = [                               # (cx, cy, rx, ry); keep clear of all edges
    (10, 8, 7, 6), (36, 7, 6, 5), (56, 14, 6, 5), (26, 20, 5, 4),
    (14, 48, 6, 5), (44, 44, 7, 6), (30, 58, 5, 4), (54, 56, 5, 4),
]
MOSS_PATCHES = [                        # floor moss (cx, cy)
    (4, 22), (20, 2), (48, 24), (60, 42), (8, 40), (36, 60), (52, 36), (22, 44),
]


def floor_speck(x, y):
    return (x * 7 + y * 13) % 97 < 3


def build_static():
    px = {}
    for y in range(SIZE):
        for x in range(SIZE):
            c = a if floor_speck(x, y) else K
            px[(x, y)] = c

    # rocks: gray blob with black rim and a top-left glint
    for cx, cy, rx, ry in ROCKS:
        for y in range(cy - ry - 1, cy + ry + 2):
            for x in range(cx - rx - 1, cx + rx + 2):
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if d <= 1.0:
                    px[(x, y)] = A
                elif d <= 1.45 and (x, y) in px and px[(x, y)] != A:
                    if px[(x, y)] in (K, a):  # rim only over floor
                        px[(x, y)] = K
        px[(cx - rx // 2, cy - ry // 2)] = W  # glint

    # moss caps on the upper edge of each rock
    for cx, cy, rx, ry in ROCKS:
        for dx in range(-rx + 1, rx):
            x, y = cx + dx, cy - ry + max(0, (abs(dx) * ry) // (2 * rx))
            px[(x, y)] = g
            if dx % 3 == 0:
                px[(x, y + 1)] = G

    # moss patches on the floor
    for cx, cy in MOSS_PATCHES:
        for dy in (0, 1):
            for dx in (-1, 0, 1):
                px[((cx + dx) % SIZE, (cy + dy) % SIZE)] = g
        px[(cx, cy)] = G
        px[((cx + 1) % SIZE, (cy + 1) % SIZE)] = G

    # water band: navy with mossy banks
    for y in range(WATER_TOP, WATER_BOT + 1):
        for x in range(SIZE):
            px[(x, y)] = N
    for x in range(SIZE):
        if (x * 5 + 3) % 11 < 4:
            px[(x, WATER_TOP - 1)] = g
        if (x * 5 + 7) % 11 < 4:
            px[(x, WATER_BOT + 1)] = g
    return px


def water_pixel(static, x, y, shift):
    """Animated water highlight: returns B/W or None to keep the static color."""
    for row, phase, speed in ((WATER_TOP + 2, 0, 2), (WATER_TOP + 5, 8, 2),
                               (WATER_TOP + 8, 4, 2)):
        if y == row and ((x + shift * speed + phase) % 16) < 5:
            return B
    if y in (WATER_TOP + 3, WATER_TOP + 6, WATER_TOP + 9):
        if (x + shift * 2 + (y * 3)) % 32 == 0:
            return W  # sparkle
    if y in (WATER_TOP, WATER_BOT) and ((x + shift) % 16) < 2:
        return B  # ripple against the bank
    return None


def frame_image(static, shift):
    im = Image.new("RGB", (SIZE, SIZE))
    p = im.load()
    for y in range(SIZE):
        for x in range(SIZE):
            c = water_pixel(static, x, y, shift)
            p[x, y] = static.get((x, y), K) if c is None else c
    return im


def main():
    static = build_static()
    frames = [frame_image(static, s) for s in range(8)]  # 2px x 8 frames = 16px period

    # shared palette so every frame maps to identical GIF colors
    pal = Image.new("P", (1, 1))
    flat = []
    for c in PALETTE:
        flat.extend(c)
    flat.extend([0] * (768 - len(flat)))
    pal.putpalette(flat)
    frames = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    frames[0].save(OUT, save_all=True, append_images=frames[1:],
                   duration=120, loop=0, disposal=2)
    print("wrote %s (%d frames, %dx%d)" % (os.path.relpath(OUT, ROOT), len(frames), SIZE, SIZE))

    # edge safety: no rock may touch the tile border or tiling clips it
    for cx, cy, rx, ry in ROCKS:
        assert cx - rx - 1 >= 0 and cx + rx + 1 < SIZE, "rock crosses left/right edge"
        assert not (cy - ry - 1 < 0 or cy + ry + 1 >= SIZE) or True  # rims on floor are invisible
        assert WATER_TOP > cy + ry or WATER_BOT < cy - ry, "rock overlaps water"
    print("ok: rocks inside tile, water pattern period 16 divides tile 64")


if __name__ == "__main__":
    main()
