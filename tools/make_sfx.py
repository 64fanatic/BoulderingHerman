#!/usr/bin/env python3
"""Generate the boulder sound effects in assets/sfx/ as 16-bit mono WAVs.

Everything is synthesized from scratch (sine waves + filtered noise), so the
sounds are original and royalty-free. Rerun after tweaking to taste.

Usage: python3 tools/make_sfx.py
"""
import math
import os
import random
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "sfx")
SR = 22050
random.seed(617)  # fixed seed: same bytes every run


def write_wav(name, samples):
    path = os.path.join(OUT_DIR, name)
    os.makedirs(OUT_DIR, exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))
    print("wrote %s (%d samples, %.0f ms)" % (os.path.relpath(path, ROOT),
                                               len(samples), 1000 * len(samples) / SR))


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


def envelope(n, attack, release, curve=1.0):
    env = []
    for i in range(n):
        v = 1.0
        if i < attack:
            v = i / attack
        elif i > n - release:
            v = max(0.0, (n - i) / release)
        env.append(v ** curve)
    return env


def brown_noise(n):
    out = []
    v = 0.0
    for _ in range(n):
        v = (v + random.uniform(-1, 1)) * 0.98
        out.append(v)
    return out


def white_noise(n):
    return [random.uniform(-1, 1) for _ in range(n)]


def sine_sweep(n, f0, f1, curve=3.0):
    out = []
    phase = 0.0
    for i in range(n):
        f = f0 + (f1 - f0) * ((i / n) ** curve)
        phase += 2 * math.pi * f / SR
        out.append(math.sin(phase))
    return out


def mix(a, b, weight=0.5):
    return [x + weight * y for x, y in zip(a, b)]


def scale(samples, gain):
    return [s * gain for s in samples]


def roll():
    n = int(SR * 0.09)
    rumble = lowpass(brown_noise(n), 10)
    env = envelope(n, SR * 0.004, SR * 0.03)
    return [r * e for r, e in zip(rumble, env)]


def thud():
    n = int(SR * 0.14)
    body = sine_sweep(n, 105, 34)
    env = envelope(n, SR * 0.002, n, curve=2.2)
    body = [b * e for b, e in zip(body, env)]
    click = scale(lowpass(white_noise(n), 2), 0.4)
    env2 = envelope(n, 1, int(n * 0.35))
    click = [c * e for c, e in zip(click, env2)]
    return mix(body, click, 0.5)


def splat():
    n = int(SR * 0.22)
    squelch = lowpass(white_noise(n), 3)
    env = envelope(n, SR * 0.001, n, curve=2.0)
    squelch = [s * e for s, e in zip(squelch, env)]
    drop = sine_sweep(n, 170, 45)
    env2 = envelope(n, SR * 0.002, n, curve=2.6)
    drop = [d * e for d, e in zip(drop, env2)]
    return mix(squelch, drop, 0.55)


def one_up():
    # four quick rising notes (C5 E5 G5 C6) with an octave shimmer on top:
    # the classic extra-life chirp. Pure sines, so the seeded noise sounds
    # above stay byte-identical when this file is rerun.
    out = []
    for f in (523.25, 659.25, 783.99, 1046.50):
        n = int(SR * 0.09)
        note = sine_sweep(n, f, f)
        env = envelope(n, SR * 0.004, int(n * 0.6), curve=1.6)
        note = [x * e for x, e in zip(note, env)]
        out += mix(note, scale(sine_sweep(n, 2 * f, 2 * f), 0.25))
    return out


if __name__ == "__main__":
    write_wav("roll.wav", roll())
    write_wav("thud.wav", thud())
    write_wav("splat.wav", splat())
    write_wav("oneup.wav", one_up())
