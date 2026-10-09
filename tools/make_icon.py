#!/usr/bin/env python3
"""Generate build/icon.png and build/icon.ico for the desktop builds.

Ports the royal-logo builder from src/main.js (the robe, ruff and Herman's
face) onto a square black canvas, then writes a 512px PNG plus a multi-size
Windows .ico. Run after changing the logo art:

    python3 tools/make_icon.py
"""
import math
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build")

PAL = {
    "K": (0x00, 0x00, 0x00), "O": (0x80, 0x80, 0x00), "R": (0x80, 0x00, 0x00),
    "r": (0xFF, 0x00, 0x00), "G": (0x00, 0xFF, 0x00), "g": (0x00, 0x80, 0x00),
    "A": (0x80, 0x80, 0x80), "Y": (0xFF, 0xFF, 0x00), "N": (0x00, 0x00, 0x80),
    "B": (0x00, 0x00, 0xFF), "W": (0xF0, 0xF0, 0xF0), "w": (0xFF, 0xFF, 0xFF),
    "S": (0xF5, 0x91, 0x8F), "V": (0xC0, 0x00, 0xC0),
}

# the face, no body (rows 0-7 of HERMAN_ART in src/main.js)
FACE = [
    "...wwwwKKwwww...",
    "...wwwwwwwwww...",
    "..wwBBBwwBBBww..",
    ".wwwBYBSSBYBwww.",
    "wwwwBBBKKBBBwwww",
    "wVVVVVVVVVVVVVVw",
    "wVKKKKwKwKwKKKVw",
    "wwVVKKKKKKKKVVww",
]

W, H, CX, CY = 34, 26, 16.5, 12.5
RX, RY, RXI, RYI = 16, 11.5, 11, 7.5


def build_logo():
    grid = [["."] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            dx, dy = x - CX, y - CY
            ang = math.atan2(dy, dx)
            d = math.sqrt(dx * dx / (RX * RX) + dy * dy / (RY * RY))
            d2 = math.sqrt(dx * dx / (RXI * RXI) + dy * dy / (RYI * RYI))
            fringe = math.floor((ang + math.pi) / (math.pi / 7)) % 2 == 0
            edge = 1.0 if fringe else 0.86
            ruff_pt = math.floor((ang + math.pi) / (math.pi / 5)) % 2 == 0
            r_edge = 1.0 if ruff_pt else 0.82
            ch = None
            if d2 <= r_edge and d2 >= 0.68:
                ch = "Y" if d2 > r_edge - 0.15 else ("O" if (x + y) % 2 else "Y")
            elif d2 < 0.68 and d <= edge:
                if abs(d - 0.74) < 0.05:
                    ch = "Y"
                elif abs(d - 0.5) < 0.06 and (x + 3 * y) % 6 == 0:
                    ch = "Y"
                else:
                    ch = "r" if (x + y) % 7 == 0 else "R"
            elif d <= edge:
                if d > edge - 0.12:
                    ch = "Y"
                elif abs(d - 0.74) < 0.05:
                    ch = "Y"
                else:
                    ch = "r" if (x + y) % 7 == 0 else "R"
            if ch:
                grid[y][x] = ch
    for y, row in enumerate(FACE):
        for x, ch in enumerate(row):
            if ch != ".":
                grid[9 + y][9 + x] = ch
    # crop to content
    xs = [x for y in range(H) for x in range(W) if grid[y][x] != "."]
    ys = [y for y in range(H) for x in range(W) if grid[y][x] != "."]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    return [[grid[y][x] for x in range(x0, x1 + 1)] for y in range(y0, y1 + 1)]


def main():
    logo = build_logo()
    lw, lh = len(logo[0]), len(logo)
    scale = 16  # 32x22 art -> ~512x352
    big = Image.new("RGB", (lw * scale, lh * scale), (0, 0, 0))
    px = big.load()
    for y in range(lh):
        for x in range(lw):
            col = PAL.get(logo[y][x])
            if col:
                for sy in range(scale):
                    for sx in range(scale):
                        px[x * scale + sx, y * scale + sy] = col
    icon = Image.new("RGBA", (512, 512), (0, 0, 0, 255))
    icon.paste(big, ((512 - big.width) // 2, (512 - big.height) // 2))

    os.makedirs(OUT, exist_ok=True)
    icon.save(os.path.join(OUT, "icon.png"), optimize=True)
    icon.save(os.path.join(OUT, "icon.ico"),
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("wrote build/icon.png (512x512) and build/icon.ico (%dx%d logo, scale %d)" % (lw, lh, scale))


if __name__ == "__main__":
    main()
