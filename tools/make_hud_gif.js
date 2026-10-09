// Generates assets/hud_cobble.gif: the game HUD bar as a rotating
// brick-red cobblestone cylinder - moonlit silver sheen on top, shadow at
// the bottom, rounded ends, rough protruding cobbles with grout, pits, and speckle.
// Pure Node, no dependencies: procedural render + hand-rolled GIF89a/LZW.
// Run: node tools/make_hud_gif.js
"use strict";
const fs = require("fs");
const path = require("path");

// ---------------- config ----------------
const W = 644;   // HUD padding-box width at k=1 (648 - 2*2 border)
const H = 22;    // HUD padding-box height at k=1
const P = 644;   // pattern period = full bar width: no stone repeats in view
const FRAMES = 46; // 46 * 14 = 644 -> one full revolution per loop
const STEP = 14;   // px per frame
const DELAY = 50;  // 500 ms per frame -> ~23 s per revolution, ponderous roll
const SEED = 1337;

// ---------------- deterministic rng / noise ----------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// smooth value noise, horizontally wrapped at wrapX so the loop is seamless.
// wrapX must be an exact divisor of the pattern period.
function vnoise(x, y, wrapX) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (v) => ((v % wrapX) + wrapX) % wrapX;
  const h00 = hash2(w(xi), yi), h10 = hash2(w(xi + 1), yi);
  const h01 = hash2(w(xi), yi + 1), h11 = hash2(w(xi + 1), yi + 1);
  return (h00 * (1 - sx) + h10 * sx) * (1 - sy) + (h01 * (1 - sx) + h11 * sx) * sy;
}
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------- cobble seeds on a horizontal torus ----------------
const COLS = 64, ROWS = 3;
const seeds = [];   // {x,y} in pattern space [0,P) x [0,H)
const cellRnd = []; // per-seed stone traits
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const jx = 0.85, jy = 0.8;
    seeds.push({
      x: ((c + 0.5 + (rand() - 0.5) * jx) / COLS) * P,
      y: clamp((r + 0.5 + (rand() - 0.5) * jy) / ROWS * H, 0.5, H - 0.5),
    });
    cellRnd.push({
      red: 0.34 + rand() * 0.24,   // brick red level
      gMul: 0.18 + rand() * 0.10,  // green share (dark, brownish)
      bMul: 0.14 + rand() * 0.08,  // blue share
      char: rand() < 0.12,         // occasional charcoal brick for variety
      crack: rand(),               // pitted/grungy bricks
    });
  }
}
const NS = seeds.length;

function torusDx(ax, bx) {
  let d = Math.abs(ax - bx);
  return Math.min(d, P - d);
}
// sample pattern space -> nearest + 2nd distance and cell id
function sample(x, y) {
  let d1 = 1e9, d2 = 1e9, id = 0;
  for (let i = 0; i < NS; i++) {
    const dx = torusDx(x, seeds[i].x), dy = Math.abs(y - seeds[i].y);
    const d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = i; }
    else if (d < d2) d2 = d;
  }
  return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), id };
}
// stone bulge: 0 at the grout edge, 1 toward the cell center
const height = (s) => Math.pow(clamp((s.d2 - s.d1) / 3.4, 0, 1), 0.6);

// ---------------- render one frame ----------------
function renderFrame(off) {
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sxp = ((x - off) % P + P) % P;
      const s = sample(sxp, y);
      const h = height(s);
      // surface normal from height gradient (rough, protruding cobbles)
      const hx1 = height(sample(sxp + 1, y)), hx0 = height(sample(sxp - 1, y));
      const hy1 = height(sample(sxp, y + 1)), hy0 = height(sample(sxp, y - 1));
      const gx = (hx1 - hx0) * 2.6, gy = (hy1 - hy0) * 2.6;
      const gl = Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx / gl, ny = -gy / gl, nz = 1 / gl;
      // moonlight straight from above: top to bottom, no diagonal
      const Lx = 0, Ly = -0.72, Lz = 0.69;
      const diff = Math.max(nx * Lx + ny * Ly + nz * Lz, 0);
      const shade = 0.42 + 0.78 * diff;

      let r, g, b;
      if (s.d2 - s.d1 < 1.25) {
        // mortar between bricks: dark maroon, grimy
        const n = vnoise(sxp / 0.7, y / 0.7 + 40, P / 0.7);
        const m = 0.12 + n * 0.07;
        r = m * 1.15; g = m * 0.35; b = m * 0.30;
      } else {
        const st = cellRnd[s.id];
        // brick color: dark reds, per-brick variation
        const base = st.red * shade;
        r = base;
        g = base * st.gMul;
        b = base * st.bMul;
        if (st.char) { r *= 0.45; g *= 0.8; b *= 0.9; } // charcoal brick
        // grunge: speckle + pits
        const sp = (vnoise(sxp / 1.4, y / 1.4, P / 1.4) - 0.5) * 0.16;
        r *= 1 + sp; g *= 1 + sp; b *= 1 + sp;
        if (st.crack > 0.55) {
          const pit = vnoise(sxp / 7, y / 7 + 300, P / 7);
          if (pit > 0.68) { r *= 0.8; g *= 0.8; b *= 0.8; }
        }
        // brick top edge catches light a touch harder
        const rim = smoothstep(0.15, 0.0, gy) * 0.18 * diff;
        g += rim; r += rim * 0.9; b += rim;
      }
      r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1);

      // ---- cylinder shading: fixed light, rotating surface ----
      // silvery moonlight band along the top
      const moon = smoothstep(9.5, 0, y);
      const mw = moon * 0.42;
      r = r * (1 - mw) + 0.72 * mw;
      g = g * (1 - mw) + 0.80 * mw;
      b = b * (1 - mw) + 0.97 * mw;
      const spec = Math.exp(-Math.pow(y - 1.1, 2) / 2.2) * 0.20;
      r += spec * 0.8; g += spec * 0.9; b += spec;
      // shadow swallowed at the bottom of the cylinder
      const sh = smoothstep(12.5, 21, y);
      const k = 1 - sh * 0.72;
      r *= k * 0.92; g *= k; b *= k * 0.95;
      // slight cool green wash so shadow reads as cave-dark
      r = r * (1 - sh * 0.15) + 0.05 * sh * 0.15;

      // rounded ends: the surface curves away at the left and right rim
      const endK = 0.30 + 0.70 * Math.min(smoothstep(0, 26, x), smoothstep(0, 26, W - 1 - x));
      r *= endK; g *= endK; b *= endK;

      const i = (y * W + x) * 3;
      px[i] = clamp(Math.round(r * 255), 0, 255);
      px[i + 1] = clamp(Math.round(g * 255), 0, 255);
      px[i + 2] = clamp(Math.round(b * 255), 0, 255);
    }
  }
  return px;
}

// ---------------- median-cut palette ----------------
function buildPalette(frames, nColors) {
  const pts = [];
  for (let f = 0; f < frames.length; f += 3)
    for (let i = 0; i < frames[f].length; i += 3 * 7)
      pts.push([frames[f][i], frames[f][i + 1], frames[f][i + 2]]);
  let boxes = [pts];
  while (boxes.length < nColors) {
    boxes.sort((a, b) => spread(b) - spread(a));
    const box = boxes.shift();
    if (!box || box.length < 2) { if (box) boxes.push(box); break; }
    const axis = spreadAxis(box);
    box.sort((a, b) => a[axis] - b[axis]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  function spread(box) {
    let mn = [255, 255, 255], mx = [0, 0, 0];
    for (const p of box)
      for (let c = 0; c < 3; c++) {
        if (p[c] < mn[c]) mn[c] = p[c];
        if (p[c] > mx[c]) mx[c] = p[c];
      }
    return Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  }
  function spreadAxis(box) {
    let mn = [255, 255, 255], mx = [0, 0, 0];
    for (const p of box)
      for (let c = 0; c < 3; c++) {
        if (p[c] < mn[c]) mn[c] = p[c];
        if (p[c] > mx[c]) mx[c] = p[c];
      }
    const d = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    return d.indexOf(Math.max(...d));
  }
  return boxes.filter((b) => b.length).map((b) => {
    const s = [0, 0, 0];
    for (const p of b) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return [Math.round(s[0] / b.length), Math.round(s[1] / b.length), Math.round(s[2] / b.length)];
  });
}
function mapToPalette(px, pal) {
  const out = new Uint8Array(px.length / 3);
  const cache = new Map();
  for (let i = 0, j = 0; i < px.length; i += 3, j++) {
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      let best = 0, bd = 1e9;
      for (let k = 0; k < pal.length; k++) {
        const dr = px[i] - pal[k][0], dg = px[i + 1] - pal[k][1], db = px[i + 2] - pal[k][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = k; }
      }
      idx = best; cache.set(key, idx);
    }
    out[j] = idx;
  }
  return out;
}

// ---------------- GIF89a encoder ----------------
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let codeSize = minCodeSize + 1, next = eoi + 1;
  let dict = new Map();
  const bytes = [];
  let cur = 0, nbits = 0;
  const emit = (code) => {
    cur |= code << nbits; nbits += codeSize;
    while (nbits >= 8) { bytes.push(cur & 255); cur >>= 8; nbits -= 8; }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const v = dict.get(key);
    if (v !== undefined) { prefix = v; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next);
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      next++;
    } else {
      emit(clear);
      dict = new Map();
      codeSize = minCodeSize + 1; next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (nbits > 0) bytes.push(cur & 255);
  return bytes;
}
function bytesToSubBlocks(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 255) {
    const n = Math.min(255, data.length - i);
    out.push(n);
    for (let j = 0; j < n; j++) out.push(data[i + j]);
  }
  out.push(0);
  return out;
}
function encodeGif(w, h, pal, framesIdx, delay) {
  const g = [];
  const push = (...b) => b.forEach((x) => g.push(x & 255));
  const pushStr = (s) => { for (const c of s) g.push(c.charCodeAt(0)); };
  pushStr("GIF89a");
  push(w & 255, (w >> 8) & 255, h & 255, (h >> 8) & 255);
  const tableBits = Math.max(1, Math.ceil(Math.log2(pal.length)));
  const tableSize = 1 << tableBits;
  push(0x80 | ((tableBits - 1) << 4) | (tableBits - 1)); // GCT, 8-bit fields
  push(0x00, 0x00); // bg, aspect
  for (let i = 0; i < tableSize; i++) {
    if (i < pal.length) push(pal[i][0], pal[i][1], pal[i][2]);
    else push(0, 0, 0);
  }
  // infinite loop
  push(0x21, 0xFF, 11); pushStr("NETSCAPE2.0"); push(3, 1, 0, 0); push(0);
  const minCodeSize = Math.max(2, tableBits);
  for (const f of framesIdx) {
    push(0x21, 0xF9, 4, 0x04 | 0x00, delay & 255, (delay >> 8) & 255, 0, 0); // GCE, no disposal
    push(0x2C, 0, 0, 0, 0, w & 255, (w >> 8) & 255, h & 255, (h >> 8) & 255, 0x00); // image desc
    push(minCodeSize);
    bytesToSubBlocks(lzwEncode(f, minCodeSize)).forEach((b) => g.push(b));
  }
  push(0x3B);
  return Buffer.from(g);
}

// ---------------- build ----------------
const framesRGB = [];
for (let f = 0; f < FRAMES; f++) framesRGB.push(renderFrame(f * STEP));
const pal = buildPalette(framesRGB, 64);
const framesIdx = framesRGB.map((f) => mapToPalette(f, pal));
const gif = encodeGif(W, H, pal, framesIdx, DELAY);
const outPath = path.join(__dirname, "..", "assets", "hud_cobble.gif");
fs.writeFileSync(outPath, gif);
console.log("palette entries:", pal.length);
console.log("wrote", outPath, gif.length, "bytes");

// ---------------- self-verify: decode frame 0 back and diff ----------------
function decodeFirstFrame(buf) {
  let i = 13 + (1 << Math.max(1, Math.ceil(Math.log2(pal.length)))) * 3; // header + GCT
  while (buf[i] !== 0x2C) {
    if (buf[i] === 0x21) { i += 2; while (buf[i] !== 0) i += buf[i] + 1; i++; }
    else i++;
  }
  i += 10; // image descriptor
  const mcs = buf[i++];
  const data = [];
  while (buf[i] !== 0) { const n = buf[i++]; for (let j = 0; j < n; j++) data.push(buf[i + j]); i += n; }
  const clear = 1 << mcs, eoi = clear + 1;
  let codeSize = mcs + 1, dict = [], prev = null, out = [];
  const reset = () => {
    dict = new Array(clear + 2);
    for (let c = 0; c < clear; c++) dict[c] = [c];
    codeSize = mcs + 1;
  };
  reset();
  let bitPos = 0;
  const readCode = () => {
    let v = 0;
    for (let b = 0; b < codeSize; b++) {
      const byte = data[bitPos >> 3];
      if (byte === undefined) return -1;
      v |= ((byte >> (bitPos & 7)) & 1) << b;
      bitPos++;
    }
    return v;
  };
  for (;;) {
    const code = readCode();
    if (code === -1) break;
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    let entry;
    if (code < dict.length && dict[code] !== undefined) entry = dict[code];
    else if (prev !== null) entry = prev.concat(prev[0]);
    else break;
    out.push(...entry);
    if (prev !== null) {
      dict.push(prev.concat(entry[0]));
      if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}
const decoded = decodeFirstFrame(gif);
let diff = 0, maxd = 0;
for (let p = 0; p < W * H; p++) {
  const d = Math.abs(decoded[p] - framesIdx[0][p]);
  diff += d; if (d > maxd) maxd = d;
}
console.log("decode check: pixels", decoded.length, "of", W * H,
  "avg diff", (diff / (W * H)).toFixed(4), "max", maxd);
