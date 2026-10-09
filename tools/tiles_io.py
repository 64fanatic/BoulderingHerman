#!/usr/bin/env python3
"""Export/import the Boulder Herman tileset between PNG files and src/main.js.

Usage:
  python3 tools/tiles_io.py export   # main.js -> tiles/*.png + tiles/sheet.png + tiles/palette.gpl
  python3 tools/tiles_io.py import   # tiles/*.png -> src/main.js

Edit tiles/*.png in LibreSprite (16x16 each), then run `import` to bake your
changes back into the game. Transparent pixels (alpha 0) become the background
character '.' in the game art.
"""
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("This script needs Pillow: python3 -m pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_JS = os.path.join(ROOT, "src", "main.js")
TILES_DIR = os.path.join(ROOT, "tiles")

# character -> (R, G, B) ; '.' means transparent
PALETTE = {
    "K": (0x00, 0x00, 0x00),   # black
    "O": (0x80, 0x80, 0x00),   # olive (dirt)
    "R": (0x80, 0x00, 0x00),   # dark red
    "r": (0xFF, 0x00, 0x00),   # bright red
    "G": (0x00, 0xFF, 0x00),   # bright green
    "g": (0x00, 0x80, 0x00),   # dark green
    "A": (0x80, 0x80, 0x80),   # gray (boulders)
    "a": (0x64, 0x64, 0x64),   # dark gray
    "Y": (0xFF, 0xFF, 0x00),   # yellow
    "N": (0x00, 0x00, 0x80),   # navy
    "B": (0x00, 0x00, 0xFF),   # blue
    "W": (0xF0, 0xF0, 0xF0),   # light gray
    "w": (0xFF, 0xFF, 0xFF),   # white
    "S": (0xF5, 0x91, 0x8F),   # salmon (Herman's nose)
    "V": (0xC0, 0x00, 0xC0),   # purple (Herman's lips)
}

# tile file name -> array name in src/main.js
TILES = [
    ("dirt.png", "DIRT_ART"),
    ("brick.png", "BRICK_ART"),
    ("flower.png", "FLOWER_ART"),
    ("boulder.png", "BOULDER_ART"),
    ("herman.png", "HERMAN_ART"),
    ("firefly_a.png", "FLY_A"),
    ("firefly_b.png", "FLY_B"),
    ("butterfly_a.png", "BUT_A"),
    ("butterfly_b.png", "BUT_B"),
    ("exit_closed.png", "EXIT_ART"),
    ("exit_open_a.png", "EXIT_OPEN_A"),
    ("exit_open_b.png", "EXIT_OPEN_B"),
]


def read_array(src, name):
    m = re.search(r"var %s = \[(.*?)\];" % name, src, re.S)
    if not m:
        sys.exit("array %s not found in src/main.js" % name)
    rows = re.findall(r'"([^"]*)"', m.group(1))
    if len(rows) != 16 or any(len(r) != 16 for r in rows):
        sys.exit("array %s is not 16x16" % name)
    return rows


def render_block(name, rows):
    body = ",\n".join('    "%s"' % r for r in rows)
    return "var %s = [\n%s\n  ];" % (name, body)


def replace_array(src, name, rows):
    pattern = r"var %s = \[.*?\];" % name
    new = render_block(name, rows)
    out, n = re.subn(pattern, new, src, count=1, flags=re.S)
    if n != 1:
        sys.exit("could not rewrite array %s" % name)
    return out


def export():
    src = open(MAIN_JS).read()
    os.makedirs(TILES_DIR, exist_ok=True)
    sheet = Image.new("RGBA", (16 * 4, 16 * 3), (0, 0, 0, 0))
    for i, (fname, arr) in enumerate(TILES):
        rows = read_array(src, arr)
        im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        p = im.load()
        for y in range(16):
            for x in range(16):
                ch = rows[y][x]
                if ch != ".":
                    p[x, y] = PALETTE[ch] + (255,)
        path = os.path.join(TILES_DIR, fname)
        im.save(path)
        sheet.paste(im, ((i % 4) * 16, (i // 4) * 16))
        print("wrote %s (%s)" % (os.path.relpath(path, ROOT), arr))
    sheet_path = os.path.join(TILES_DIR, "sheet.png")
    sheet.save(sheet_path)
    print("wrote %s" % os.path.relpath(sheet_path, ROOT))

    # GIMP palette file, loadable in LibreSprite (Aseprite fork)
    names = {
        "K": "black", "O": "olive", "R": "dark red", "r": "bright red",
        "G": "bright green", "g": "dark green", "A": "gray", "a": "dark gray",
        "Y": "yellow", "N": "navy", "B": "blue", "W": "light gray", "w": "white",
        "S": "salmon (nose)", "V": "purple (lips)",
    }
    with open(os.path.join(TILES_DIR, "palette.gpl"), "w") as f:
        f.write("GIMP Palette\nName: Boulder Herman\nColumns: 4\n#\n")
        for ch, (r, g, b) in PALETTE.items():
            f.write("%3d %3d %3d\t%s [%s]\n" % (r, g, b, names[ch], ch))
    print("wrote tiles/palette.gpl")


def nearest_char(rgb):
    best, bestd = None, 1 << 30
    for ch, (r, g, b) in PALETTE.items():
        d = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2
        if d < bestd:
            best, bestd = ch, d
    if bestd > 9000:  # ~95 per channel
        print("  warning: color #%02x%02x%02x is far from the palette, using %s"
              % (rgb[0], rgb[1], rgb[2], best))
    return best


def import_tiles():
    src = open(MAIN_JS).read()
    for fname, arr in TILES:
        path = os.path.join(TILES_DIR, fname)
        if not os.path.exists(path):
            sys.exit("missing %s" % path)
        im = Image.open(path).convert("RGBA")
        if im.size != (16, 16):
            sys.exit("%s must be 16x16 (got %s)" % (fname, im.size))
        p = im.load()
        rows = []
        for y in range(16):
            row = ""
            for x in range(16):
                r, g, b, a = p[x, y]
                row += "." if a < 128 else nearest_char((r, g, b))
            rows.append(row)
        src = replace_array(src, arr, rows)
        print("%s -> %s" % (fname, arr))
    open(MAIN_JS, "w").write(src)
    print("src/main.js updated")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "export":
        export()
    elif cmd == "import":
        import_tiles()
    else:
        sys.exit(__doc__)
