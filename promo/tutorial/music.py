#!/usr/bin/env python3
"""Calm lo-fi bed for the XNK tutorial video (30 s, synthesised, no samples, no copyright).

96 BPM: one beat = 0.625 s, one bar = 2.5 s, twelve bars. The hook is the first 1.5 bars,
each of the six steps is 1.5 bars (3.75 s), the end card is the last 1.5 bars, matching tutorial.html.

    python3 promo/tutorial/music.py out.wav
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 30.0
BEAT = 0.625
BAR = 4 * BEAT
SWING = 0.055                      # late off-beat 8ths, in seconds
STEP = 3.75                        # one tutorial step
STEPS = [3.75 + k * STEP for k in range(6)]
END = 26.25
RNG = np.random.default_rng(11)

N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def place(sig, at, gain=1.0, pan=0.0):
    i = int(round(at * SR))
    if i >= N or i < 0:
        return
    lg, rg = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    n = min(len(sig), N - i)
    L[i:i + n] += sig[:n] * gain * lg
    R[i:i + n] += sig[:n] * gain * rg


def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, len(x))


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ---------------------------------------------------------------- instruments

def epiano(notes, length):
    """Warm electric piano: sine + soft bell partial, slow tremolo, gentle decay."""
    t = t_axis(length)
    s = np.zeros_like(t)
    for k, n in enumerate(notes):
        f = midi(n)
        tone = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3)
        tone += 0.06 * np.sin(2 * np.pi * 7.02 * f * t) * np.exp(-t * 12)   # tine "ping"
        s += tone * (0.9 - 0.08 * k) * np.exp(-t * 0.9)
    s *= 1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)                            # tremolo
    env = np.minimum(1, t / 0.012) * np.clip((length - t) / 0.25, 0, 1)
    return fft_filter(s * env, hi=2600) / len(notes)


def pad(notes, length, attack=0.7):
    """Soft sustained chord under the piano, so long bars never go thin."""
    t = t_axis(length)
    s = np.zeros_like(t)
    for k, n in enumerate(notes[:4]):
        for det in (-0.15, 0.15):
            s += np.sin(2 * np.pi * midi(n) * (1 + det / 100) * t + k)
    env = np.minimum(1, t / attack) * np.clip((length - t) / 0.7, 0, 1)
    return fft_filter(s * env, hi=1200) / 8


def kick():
    t = t_axis(0.35)
    f = 52 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) * np.minimum(1, t / 0.003)


def rim():
    t = t_axis(0.12)
    n = fft_filter(RNG.uniform(-1, 1, len(t)), lo=1200, hi=6000)
    return (n * 0.6 + np.sin(2 * np.pi * 820 * t) * 0.5) * np.exp(-t * 55)


def hat(soft=1.0):
    t = t_axis(0.05)
    return fft_filter(RNG.uniform(-1, 1, len(t)), lo=6500, hi=12000) * np.exp(-t * 90) * soft


def sub(freq, length):
    t = t_axis(length)
    env = np.minimum(1, t / 0.02) * np.clip((length - t) / 0.08, 0, 1) * np.exp(-t * 0.6)
    return np.tanh(np.sin(2 * np.pi * freq * t) * 1.3) * env


def chime(freq, length=2.2):
    t = t_axis(length)
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 4)
    return s * np.exp(-t * 1.8) * np.minimum(1, t / 0.004)


def crackle(sec):
    n = int(SR * sec)
    hiss = fft_filter(RNG.uniform(-1, 1, n), lo=900, hi=5000) * 0.02
    pops = np.zeros(n)
    idx = RNG.integers(0, n, int(sec * 14))
    pops[idx] = RNG.uniform(-1, 1, len(idx)) * 0.5
    pops = fft_filter(pops, lo=1500, hi=9000)
    return hiss + pops


def reverb(x, sec=2.4, decay=2.2, wet=0.28):
    t = t_axis(sec)
    outs = []
    for seed in (3, 4):
        ir = np.random.default_rng(seed).uniform(-1, 1, len(t)) * np.exp(-t * decay)
        ir = fft_filter(ir, hi=4500)
        ir[0] = 0
        n = len(x) + len(ir)
        y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:len(x)]
        outs.append(y / max(np.sqrt((ir ** 2).sum()), 1e-9) * wet)
    return outs


# ---------------------------------------------------------------- arrangement

# Fm9 – Dbmaj7 – Ebadd9 – Cm7, voiced around middle C, one chord per bar
CHORDS = [[53, 56, 60, 63, 67], [49, 53, 56, 60, 65], [51, 55, 58, 65, 70], [48, 51, 55, 58, 63]]
ROOTS = [29, 25, 27, 24]

bars = int(round(DUR / BAR))
for b in range(bars):
    at = b * BAR
    c = CHORDS[b % 4]
    last = at >= END - 1e-6
    length = (DUR - at) if last else BAR + 0.4
    place(epiano(c, length), at, 0.55, pan=-0.1)
    place(pad(c, length + 0.3, attack=0.9 if b == 0 else 0.5), at, 0.22, pan=0.1)
    # a soft arpeggio on top from the first step on (two notes per bar, swung)
    if STEPS[0] - 1e-6 <= at < END - 1e-6:
        place(epiano([c[-1] + 12], 0.9), at + 2 * BEAT + SWING, 0.16, pan=0.35)
        place(epiano([c[-2] + 12], 0.9), at + 3 * BEAT + SWING, 0.12, pan=0.35)

# drums + bass while the steps run
t = STEPS[0]
k = 0
while t < END - 1e-6:
    pos = k % 4
    if pos in (0, 2):
        place(kick(), t, 0.55)
    if pos in (1, 3):
        place(rim(), t, 0.22, pan=0.15)
    place(hat(), t, 0.10, pan=-0.25)
    place(hat(0.7), t + BEAT / 2 + SWING, 0.08, pan=-0.25)
    if pos == 0:
        b = int(round(t / BAR)) % 4
        place(sub(midi(ROOTS[b] + 12), BAR * 0.9), t, 0.35)
    t += BEAT
    k += 1

# a gentle chime on every step change, rising through the scale
for i, at in enumerate(STEPS):
    place(chime(midi([77, 79, 80, 82, 84, 87][i])), at, 0.10, pan=(0.3 if i % 2 else -0.3))
# end card: low root and a high chime
place(sub(midi(29 + 12), 3.6), END, 0.32)
place(chime(midi(89), 3.4), END + 0.05, 0.12)
place(crackle(DUR), 0.0, 1.0)

# ---------------------------------------------------------------- master

dry_l, dry_r = L.copy(), R.copy()
wl, wr = reverb((L + R) / 2)
L, R = dry_l + wl, dry_r + wr
t = np.arange(N) / SR
fade = np.clip(t / 0.4, 0, 1) * np.clip((30.0 - t) / 1.6, 0, 1) ** 1.3
L *= fade
R *= fade
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = np.tanh(L / peak * 1.2), np.tanh(R / peak * 1.2)
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
g = 10 ** (-1 / 20) / peak
pcm = (np.clip(np.stack([L * g, R * g], axis=1), -1, 1) * 32767).astype('<i2')

path = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', path)
