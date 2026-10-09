#!/usr/bin/env python3
"""Generate assets/frame.png - the thin cobblestone border with vines twisted
around it that frames the gameplay window. 656x368: an 8px cobble ring around
the 640x352 canvas hole (kept transparent). The vines dip a few pixels into
the hole so they overlap the level's boundary bricks on screen.

Usage: python3 tools/make_frame.py
"""
import math
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "frame.png")

FW, FH, RING = 656, 368, 8   # frame size, border thickness
K = (0x00, 0x00, 0x00, 255)
a = (0x64, 0x64, 0x64, 255)
A = (0x80, 0x80, 0x80, 255)
G = (0x00, 0xFF, 0x00, 255)
g = (0x00, 0x80, 0x00, 255)
CLEAR = (0, 0, 0, 0)


def h(x, y):
    v = (x * 2654435761 + y * 91648471) & 0xFFFFFFFF
    return (v ^ (v >> 16)) % 100


def cobble_strip(length):
    """One ring-thickness (8px) strip of small weathered cobbles.
    Returns a dict {(x, y): color} with x in 0..7 and y in 0..length-1
    (i.e. the strip runs along its y axis)."""
    px = {}
    for i in range(length):
        for t in range(RING):
            px[(t, i)] = K   # mortar base: the ring must be solid
    for i in range(length):
        row = i // 8
        # stones of ~8px pitch, offset every other row (running bond)
        cx = 4 + (4 if row % 2 else 0)
        for t in range(RING):
            dx = (i % 8) - cx % 8
            dy = t - 3.5
            dist = (dx / 3.4) ** 2 + (dy / 2.9) ** 2
            if dist <= 1.0:
                c = a
                if h(i, t) < 16:
                    c = K          # chipped
                elif dx + dy * 0.6 < -1.6 and h(i, t) < 45:
                    c = A          # worn smooth
                elif h(i * 3, t * 5) < 9:
                    c = g          # moss creeping up the stones
                px[(t, i)] = c
            elif h(i, t) < 20:
                px[(t, i)] = g     # moss in the mortar
    return px


def strip_h(px, y0):
    for (t, i), c in cobble_strip(FW).items():
        px[i, y0 + t] = c


def strip_v(px, x0):
    for (t, i), c in cobble_strip(FH - 2 * RING).items():
        px[x0 + t, RING + i] = c


def vine_h(px, top, phase):
    flip = not top
    for i in range(FW):
        w = int(round(2.2 * math.sin(i * 0.33 + phase)))
        base = (3 + w) if top else (FH - 4 - w)
        for t in range(-1, 2):
            if 0 <= base + t < FH:
                px[i, base + t] = g
        if (i + int(phase * 5)) % 9 == 0:  # a leaf every so often
            leaf = base - 1 if top else base + 1
            if 0 <= leaf < FH:
                px[i, leaf] = G
        # tendril: the vine reaches into the game window, over the boundary bricks
        if (i * 7 + int(phase * 13)) % 97 < 3:
            d = 4 + (i % 3)
            for k in range(1, d + 1):
                yy = (RING + k) if top else (FH - RING - 1 - k)
                xx = i + (k // 3)
                if xx < FW and RING <= yy < FH - RING:
                    px[xx, yy] = g if k < d else G


def vine_v(px, left, phase):
    flip = not left
    for i in range(FH):
        w = int(round(2.2 * math.sin(i * 0.33 + phase)))
        base = (3 + w) if left else (FW - 4 - w)
        for t in range(-1, 2):
            if 0 <= base + t < FW:
                px[base + t, i] = g
        if (i + int(phase * 5)) % 9 == 0:
            leaf = base - 1 if left else base + 1
            if 0 <= leaf < FW:
                px[leaf, i] = G
        if (i * 7 + int(phase * 13)) % 89 < 3:
            d = 4 + (i % 3)
            for k in range(1, d + 1):
                xx = (RING + k) if left else (FW - RING - 1 - k)
                yy = i + (k // 3)
                if yy < FH and RING <= xx < FW - RING:
                    px[xx, yy] = g if k < d else G


def main():
    im = Image.new("RGBA", (FW, FH), CLEAR)
    px = im.load()

    strip_h(px, 0)
    strip_h(px, FH - RING)
    strip_v(px, 0)
    strip_v(px, FW - RING)

    # vines twisting around the ring, one per edge, staggered phases
    vine_h(px, True, 0.0)
    vine_h(px, False, 1.9)
    vine_v(px, True, 3.8)
    vine_v(px, False, 5.5)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT)
    print("wrote %s (%dx%d, ring %dpx)" % (os.path.relpath(OUT, ROOT), FW, FH, RING))

    ring = sum(1 for y in range(FH) for x in range(FW)
               if (x < RING or y < RING or x >= FW - RING or y >= FH - RING))
    painted = sum(1 for y in range(FH) for x in range(FW)
                  if (x < RING or y < RING or x >= FW - RING or y >= FH - RING)
                  and px[x, y][3] == 255)
    tendrils = sum(1 for y in range(RING, FH - RING) for x in range(RING, FW - RING)
                   if px[x, y][3] == 255)
    print("ring coverage: %d/%d pixels, vine tendrils over the hole: %d" % (painted, ring, tendrils))


if __name__ == "__main__":
    main()
