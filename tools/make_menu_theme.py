#!/usr/bin/env python3
"""Generate the title-screen theme: assets/background audio/menu_theme.mp3
(written via ffmpeg from the intermediate menu_theme.wav).

An eerie cave loop, musical but dark: a detuned low D drone, Dm and Bb pad
swells, sparse bell notes in D harmonic minor drowned in a cave echo, water
drips and a slow filtered wind. ~54 seconds. The echo is rendered to steady
state over two loop periods and the drone/pads/wind are periodic over the
loop, so the file loops seamlessly.

Everything is synthesized from scratch (sines + filtered noise), so the
theme is original and royalty-free. Rerun after tweaking to taste.

Usage: python3 tools/make_menu_theme.py
"""
import math
import os
import shutil
import struct
import subprocess
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "background audio")
SR = 22050
L = 54.0            # loop length in seconds; every slow LFO divides it
N = int(SR * L)
TWO_PI = 2 * math.pi


def sine(n, f, detune=1.0):
    out = []
    ph = 0.0
    step = TWO_PI * f * detune / SR
    for _ in range(n):
        out.append(math.sin(ph))
        ph += step
    return out


def add_into(mix, part, at=0, gain=1.0):
    for i, s in enumerate(part):
        j = at + i
        if j < len(mix):
            mix[j] += s * gain


def lowpass(samples, width):
    out = []
    acc = 0.0
    buf = [0.0] * width
    i = 0
    for s in samples:
        acc += s - buf[i]
        buf[i] = s
        i = (i + 1) % width
        out.append(acc / width)
    return out


def brown_noise(n):
    out = []
    v = 0.0
    while len(out) < n:
        v = (v + (ord(os.urandom(1)) - 127.5) / 127.5) * 0.98
        out.append(v)
    return out


def lfo(n, period, phase=0.0):
    return [0.5 + 0.5 * math.sin(TWO_PI * (i / SR) / period + phase) for i in range(n)]


def bell(f, dur=4.0):
    """A soft cave bell: three slightly detuned partials with a long decay."""
    n = int(SR * dur)
    out = [0.0] * n
    for p, g, det in ((1.0, 1.0, 1.0), (2.0, 0.45, 1.002), (3.0, 0.18, 0.997)):
        tone = sine(n, f * p, det)
        for i in range(n):
            out[i] += g * tone[i] * math.exp(-i / (SR * (1.4 / p)))
    return out


def drip(f0):
    """A water droplet: a quick downward pitch sweep, then a fast fade."""
    n = int(SR * 0.3)
    out = []
    ph = 0.0
    for i in range(n):
        k = i / n
        f = f0 * (1.0 - 0.55 * min(1.0, k * 8))
        ph += TWO_PI * f / SR
        out.append(math.sin(ph) * math.exp(-i / (SR * 0.07)))
    return out


def comb(x, d, fb, lpw):
    """Feedback delay with a lowpass in the loop: a cold, distant cave echo."""
    out = [0.0] * len(x)
    buf = [0.0] * lpw
    acc = 0.0
    bi = 0
    for i in range(len(x)):
        prev = out[i - d] if i >= d else 0.0
        acc += prev - buf[bi]
        buf[bi] = prev
        bi = (bi + 1) % lpw
        out[i] = x[i] + fb * (acc / lpw)
    return out


def swell(n, attack, release):
    env = []
    for i in range(n):
        v = 1.0
        if i < attack:
            v = 0.5 - 0.5 * math.cos(math.pi * i / attack)
        elif i > n - release:
            v = 0.5 - 0.5 * math.cos(math.pi * (n - i) / release)
        env.append(v)
    return env


def pad_chord(freqs, dur):
    """A dark pad tone: fundamental plus quiet upper harmonics, gently detuned."""
    n = int(SR * dur)
    out = [0.0] * n
    for f in freqs:
        for mult, g in ((1.0, 1.0), (2.0, 0.22), (3.0, 0.07)):
            tone = sine(n, f, mult * (1.0 + (f % 1.3) * 0.0006))
            for i in range(n):
                out[i] += g * tone[i]
    return [v / (len(freqs) * 2.4) for v in out]


def main():
    # --- the bed: a low D drone with slow beating and a 27s swell ---
    drone = [0.0] * N
    for f, g in ((73.42, 0.16), (73.42 * 1.0035, 0.16), (110.0, 0.09), (36.71, 0.10)):
        add_into(drone, sine(N, f), 0, g)
    drone_lfo = lfo(N, 27.0)
    drone = [d * (0.6 + 0.4 * m) for d, m in zip(drone, drone_lfo)]

    # --- dark pads: Dm and Bb trading 13.5s swells (4 per loop) ---
    pads = [0.0] * N
    seg = L / 4
    chords = [
        (146.83, 174.61, 220.00),   # Dm
        (116.54, 174.61, 233.08),   # Bb
    ]
    for i in range(4):
        tone = pad_chord(chords[i % 2], seg)
        env = swell(len(tone), int(SR * 4.5), int(SR * 4.5))
        add_into(pads, [t * e for t, e in zip(tone, env)], int(i * seg * SR), 0.30)

    # --- wind: filtered noise breathing over 18s cycles (3 per loop) ---
    wind = lowpass(brown_noise(N), 25)
    wind_lfo = lfo(N, 18.0)
    wind = [w * (m ** 2) * 0.5 for w, m in zip(wind, wind_lfo)]

    # --- the sparse eerie melody (D harmonic minor) and the drips ---
    bus = [0.0] * N
    bells = [(6.0, 440.00), (12.5, 349.23), (21.0, 329.63), (27.0, 554.37),
             (35.0, 466.16), (41.0, 440.00), (47.5, 587.33)]
    for t, f in bells:
        add_into(bus, bell(f), int(t * SR), 0.15)
    drips = [(4.0, 1600), (17.0, 1900), (26.0, 1400), (33.0, 2000), (41.5, 1500), (50.0, 1750)]
    for t, f in drips:
        add_into(bus, drip(f), int(t * SR), 0.10)

    # --- the echo, in steady state over two loop periods so it wraps cleanly ---
    wet = comb(bus + bus, int(0.29 * SR), 0.50, 12)[N:]

    mix = [drone[i] + pads[i] + wind[i] + bus[i] + wet[i] * 0.9 for i in range(N)]
    peak = max(abs(v) for v in mix)
    mix = [v * (0.65 / peak) for v in mix]

    os.makedirs(OUT_DIR, exist_ok=True)
    wav_path = os.path.join(OUT_DIR, "menu_theme.wav")
    with wave.open(wav_path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(v * 32767)) for v in mix))
    print("wrote %s (%.0f s, loop-safe)" % (os.path.relpath(wav_path, ROOT), L))

    if shutil.which("ffmpeg"):
        mp3_path = os.path.join(OUT_DIR, "menu_theme.mp3")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
                        "-codec:a", "libmp3lame", "-b:a", "128k", mp3_path], check=True)
        os.remove(wav_path)
        print("wrote %s" % os.path.relpath(mp3_path, ROOT))
    else:
        print("ffmpeg not found: keeping the wav instead")


if __name__ == "__main__":
    main()
