#!/usr/bin/env python3
"""Thumbnail the full-size screenshots in readme/images/ into
readme/images/thumbs/. The README progress grid points at the thumbs, so the
page stays light. Once a thumbnail is written the full-size source is deleted
(the README never links it, and git history keeps the originals). Run this
after dropping in a new screenshot:

    python3 tools/make_thumbs.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "readme", "images")
OUT = os.path.join(SRC, "thumbs")
WIDTH = 640  # displayed at ~300px, so it stays crisp on hi-dpi screens


def main():
    os.makedirs(OUT, exist_ok=True)
    made = freed = 0
    for name in sorted(os.listdir(SRC)):
        if not name.lower().endswith(".png"):
            continue
        path = os.path.join(SRC, name)
        was = os.path.getsize(path)
        im = Image.open(path).convert("RGB")
        h = round(im.height * WIDTH / im.width)
        im = im.resize((WIDTH, h), Image.LANCZOS)
        im.quantize(colors=256, dither=Image.Dither.NONE).save(
            os.path.join(OUT, name), optimize=True)
        os.remove(path)  # the thumb replaces it; the README only links thumbs
        made += 1
        freed += was
    print("wrote %d thumbnails to readme/images/thumbs/ (%dpx wide); "
          "removed %.1f MB of full-size sources"
          % (made, WIDTH, freed / 1e6))


if __name__ == "__main__":
    main()
