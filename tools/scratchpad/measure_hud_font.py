from fontTools.ttLib import TTFont

f = TTFont("assets/fonts/MedievalSharp.woff2")
upem = f["head"].unitsPerEm
cmap = f.getBestCmap()
hmtx = f["hmtx"]

def w(s):
    total = 0.0
    for ch in s:
        g = cmap.get(ord(ch))
        total += hmtx[g][0] / upem if g else 0.5
    return round(total, 2)

for s in ["CAVE 100/100", "FLOWERS 40/40", "KEYS 0/3", "TIME 200", "SCORE 12345", "LIVES 3"]:
    print(f"{s!r:16} {w(s)}em")
print("column at 6 items, k=1: ", round(648 / 6 / 13, 2), "em")
print("column at 5 items, k=1: ", round(648 / 5 / 13, 2), "em")
