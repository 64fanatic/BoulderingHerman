#!/usr/bin/env python3
"""Regenerate readme/images/thumbs/ from the full-size screenshots in
readme/images/. The README progress grid points at the thumbs, so the page
stays light. Run this after swapping in new screenshots:

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
    made = 0
    for name in sorted(os.listdir(SRC)):
        if not name.lower().endswith(".png"):
            continue
        im = Image.open(os.path.join(SRC, name)).convert("RGB")
        h = round(im.height * WIDTH / im.width)
        im = im.resize((WIDTH, h), Image.LANCZOS)
        im.quantize(colors=256, dither=Image.Dither.NONE).save(
            os.path.join(OUT, name), optimize=True)
        made += 1
    print("wrote %d thumbnails to readme/images/thumbs/ (%dpx wide)" % (made, WIDTH))


if __name__ == "__main__":
    main()
