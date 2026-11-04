#!/usr/bin/env python3
"""Loopable 20-second phonk for the XNK edit (synthesised, no samples, no copyright).

144 BPM: one beat = 0.4167 s, one bar = 1.6667 s, twelve bars = exactly 20 s. Everything is mixed into a
circular buffer: tails that run past 20 s wrap to the start, and the reverb is a circular convolution, so
when Reels / TikTok loop the video there is no gap, click or reset. Bar 12 ends with a fill that lands on
the bar-1 downbeat. Section times match edit.html.

    python3 promo/edit/music.py out.wav
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 144
BEAT = 60 / BPM
S16 = BEAT / 4
BAR = 4 * BEAT
BARS = 12
DUR = BARS * BAR                      # 20.0 s
N = int(round(SR * DUR))
RNG = np.random.default_rng(23)
L = np.zeros(N)
R = np.zeros(N)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def place(sig, at, gain=1.0, pan=0.0):
    """Mix into the loop; anything past the end wraps to the start."""
    i = int(round(at * SR)) % N
    lg, rg = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    idx = (i + np.arange(len(sig))) % N
    np.add.at(L, idx, sig * gain * lg)
    np.add.at(R, idx, sig * gain * rg)


def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, len(x))


def noise(sec):
    return RNG.uniform(-1, 1, int(SR * sec))


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def sq(f, t):
    return np.sign(np.sin(2 * np.pi * f * t))


# ---------------------------------------------------------------- instruments

def cowbell(note, length=0.16, dark=False):
    """808-style cowbell, pitched: two square partials a fifth-ish apart, band-passed, short and punchy."""
    t = t_axis(length)
    f = midi(note)
    s = sq(f, t) * 0.6 + sq(f * 1.4836, t) * 0.4
    s = fft_filter(s, lo=f * 0.8, hi=(2500 if dark else 6000))
    env = np.exp(-t * 22) * 0.75 + np.exp(-t * 6) * 0.25
    return s * env * np.minimum(1, t / 0.001)


def kick(length=0.32):
    t = t_axis(length)
    f = 50 + 160 * np.exp(-t * 40)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    click = fft_filter(noise(length), lo=3000) * np.exp(-t * 300) * 0.4
    return np.tanh((body + click) * 2.0)


def b808(freq, length, glide_to=None, glide_at=0.0, drive=3.5):
    t = t_axis(length)
    f = np.full_like(t, freq) * (1 + 1.0 * np.exp(-t * 50))
    if glide_to:
        k = np.clip((t - glide_at) / 0.07, 0, 1)
        f = f * (1 - k) + glide_to * k
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(1, t / 0.003) * np.clip((length - t) / 0.02, 0, 1) * np.exp(-t * 0.8)
    return np.tanh(s * env * drive) / np.tanh(drive)


def clap(length=0.3):
    t = t_axis(length)
    n = fft_filter(noise(length), lo=1000, hi=8000)
    env = sum(np.where(t >= d, np.exp(-(t - d) * 140), 0) for d in (0, 0.009, 0.019))
    env = env + np.where(t >= 0.026, np.exp(-(t - 0.026) * 18), 0) * 0.7
    return n * env * 0.9


def hat(length=0.05, open_=False):
    length = 0.25 if open_ else length
    t = t_axis(length)
    return fft_filter(noise(length), lo=7000) * np.exp(-t * (14 if open_ else 110))


def impact(length=1.6):
    t = t_axis(length)
    f = 30 + 80 * np.exp(-t * 10)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3)
    crash = fft_filter(noise(length), lo=2500) * np.exp(-t * 3.5) * 0.4
    return np.tanh((boom + crash) * 1.6)


def whoosh(length=0.35, rev=False):
    n = noise(length)
    out = np.zeros_like(n)
    chunks = 12
    m = len(n) // chunks
    for c in range(chunks):
        lo = 300 + 6000 * c / (chunks - 1)
        out[c * m:(c + 1) * m] = fft_filter(n[c * m:(c + 1) * m], lo=lo, hi=lo * 3)
    out *= np.sin(np.pi * np.linspace(0, 1, len(out))) ** 2
    return out[::-1] if rev else out


def riser(length):
    t = t_axis(length)
    p = t / length
    f = 200 * 2 ** (p * 3.5)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    n = noise(length)
    nf = np.zeros_like(n)
    m = len(n) // 20
    for c in range(20):
        nf[c * m:(c + 1) * m] = fft_filter(n[c * m:(c + 1) * m], lo=500 + 7000 * c / 19)
    return (tone + nf * 0.5) * p ** 2


# ---------------------------------------------------------------- arrangement

# F# minor. Cowbell riff, 32 sixteenths (2 bars); None = rest.
RIFF = [78, None, 78, 81, 78, None, 85, 83, 81, None, 78, None, 76, 78, None, 81,
        78, None, 78, 81, 78, None, 85, 88, 86, 85, 83, None, 81, 83, 85, None]
BASS = [  # per bar: (16th, midi, length in 16ths, glide to)
    [(0, 30, 6, None), (6, 30, 4, None), (10, 33, 6, 30)],
    [(0, 28, 6, None), (6, 28, 4, None), (10, 26, 6, 30)],
]
KICKS = [[0, 6, 10], [0, 3, 6, 10, 14]]
BREAK = 6          # bar 7 (10.0–11.67 s): breakdown
FILL = 11          # bar 12: fill back into bar 1

for b in range(BARS):
    b0 = b * BAR
    brk = b == BREAK
    # cowbell riff (dark and quieter in the breakdown)
    for s in range(16):
        n = RIFF[(b % 2) * 16 + s]
        if n is None:
            continue
        place(cowbell(n - (12 if brk else 0), dark=brk), b0 + s * S16, 0.26 if brk else 0.34, pan=0.18 if s % 2 else -0.18)
    if brk:
        place(riser(BAR), b0, 0.55)
        place(whoosh(0.5, rev=True), b0 + BAR - 0.5, 0.5)
        continue
    # 808
    for s, n, ln, gl in BASS[b % 2]:
        place(b808(midi(n), ln * S16, midi(gl) if gl else None, ln * S16 * 0.55), b0 + s * S16, 0.6)
    # drums (half-time: clap on beat 3)
    for s in KICKS[b % 2]:
        place(kick(), b0 + s * S16, 0.8)
    place(clap(), b0 + 8 * S16, 0.65)
    if b == FILL:
        # clap roll over beats 3–4, getting faster, into the loop downbeat
        k, at, step = 0, b0 + 8 * S16, S16 * 2
        while at < b0 + BAR - 0.02:
            place(clap(0.12), at, 0.25 + 0.03 * k)
            at += step
            step = max(S16 / 2, step * 0.82)
            k += 1
        place(riser(BEAT * 2), b0 + BAR - BEAT * 2, 0.5)
    for s in range(0, 16, 2):
        place(hat(), b0 + s * S16, 0.3 if s % 4 == 0 else 0.2, pan=0.3)
    if b % 2 == 1 and b != FILL:
        for k in range(6):                              # triplet roll at the bar end
            place(hat(), b0 + 12 * S16 + k * (BEAT / 3), 0.16 + 0.02 * k, pan=0.3)
    if b % 4 == 2:
        place(hat(open_=True), b0 + 14 * S16, 0.2, pan=-0.2)

# hits on the shot changes (edit.html), the loop downbeat included
for at in (0.0, 1.6667, 3.3333, 5.0, 6.6667, 8.3333, 11.6667, 15.0):
    place(impact(1.4 if at in (0.0, 11.6667, 15.0) else 0.8), at, 0.5 if at in (0.0, 11.6667, 15.0) else 0.3)
for at in (3.3333, 8.3333, 13.3333, 18.3333):
    place(whoosh(0.3, rev=True), at - 0.3, 0.45, pan=0.4)
for at in (6.25, 6.4583, 6.6667):                         # tick, tick, PR
    place(cowbell(90, 0.08), at, 0.2)

# ---------------------------------------------------------------- master

def circular_reverb(x, seed, sec=1.6, decay=3.5, wet=0.22):
    t = t_axis(sec)
    ir = np.random.default_rng(seed).uniform(-1, 1, len(t)) * np.exp(-t * decay)
    ir = fft_filter(ir, hi=5000)
    ir[0] = 0
    h = np.zeros(N)
    h[:len(ir)] = ir
    y = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(h), N)        # circular: the tail wraps to the start
    return y / max(np.sqrt((ir ** 2).sum()), 1e-9) * wet


mid = (L + R) / 2
L, R = L + circular_reverb(mid, 5), R + circular_reverb(mid, 6)
L -= L.mean()
R -= R.mean()
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = np.tanh(L / peak * 1.8), np.tanh(R / peak * 1.8)
peak = max(np.abs(L).max(), np.abs(R).max())
g = 10 ** (-5 / 20) / peak                 # -5 dBFS: AAC overshoots this dense, limited mix by ~4 dB
pcm = (np.clip(np.stack([L * g, R * g], axis=1), -1, 1) * 32767).astype('<i2')

path = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', path, f'{N / SR:.3f} s')
