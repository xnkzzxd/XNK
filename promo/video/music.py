#!/usr/bin/env python3
"""Synthesise the 30-second trap track for the XNK ad (no samples, no copyright).

150 BPM played half-time: one beat = 0.4 s, one 16th = 0.1 s, one bar = 1.6 s.
The cue times below match the scene times in ad.html.

    python3 promo/video/music.py out.wav
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 30.0
BEAT = 0.4
STEP = 0.1
BAR = 1.6
RNG = np.random.default_rng(7)

N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def place(sig, at, gain=1.0, pan=0.0):
    """Mix a mono (or (2, n) stereo) signal into the track at time `at`."""
    i = int(round(at * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        a, b = sig, sig
        lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        a, b = a * lg * 1.414, b * rg * 1.414
    else:
        a, b = sig[0], sig[1]
    n = min(len(a), N - i)
    if i < 0:
        a, b, n, i = a[-i:], b[-i:], min(len(a) + i, N), 0
    L[i:i + n] += a[:n] * gain
    R[i:i + n] += b[:n] * gain


def fft_filter(x, lo=None, hi=None):
    """Brick-ish band filter with soft edges, done in the frequency domain."""
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


# ---------------------------------------------------------------- instruments

def kick(gain_body=1.0, length=0.45):
    t = t_axis(length)
    f = 48 + 190 * np.exp(-t * 38)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5) * gain_body
    click = fft_filter(noise(length), lo=2500) * np.exp(-t * 260) * 0.5
    return np.tanh((body + click) * 1.6)


def sub808(freq, length, glide_to=None, glide_at=None, drive=2.2):
    """A long 808: sine with a short pitch drop, optional slide, saturated."""
    t = t_axis(length)
    f = np.full_like(t, freq) * (1 + 1.2 * np.exp(-t * 45))
    if glide_to:
        k = np.clip((t - glide_at) / 0.09, 0, 1)
        f = f * (1 - k) + glide_to * k
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.minimum(1, t / 0.004) * np.exp(-t * 1.05)
    rel = np.clip((length - t) / 0.03, 0, 1)
    sig = np.sin(ph) * env * rel
    return np.tanh(sig * drive) / np.tanh(drive)


def clap(length=0.35):
    t = t_axis(length)
    n = fft_filter(noise(length), lo=900, hi=7000)
    env = np.zeros_like(t)
    for d in (0.0, 0.011, 0.023):
        env += np.where(t >= d, np.exp(-(t - d) * 120), 0)
    env += np.where(t >= 0.03, np.exp(-(t - 0.03) * 16), 0) * 0.6
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 40) * 0.4
    return (n * env + tone) * 0.8


def hat(open_=False):
    length = 0.32 if open_ else 0.06
    t = t_axis(length)
    n = fft_filter(noise(length), lo=7500)
    return n * np.exp(-t * (11 if open_ else 95))


def bell(freq, length=1.2):
    t = t_axis(length)
    idx = 3.2 * np.exp(-t * 6)
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * idx
    car = np.sin(2 * np.pi * freq * t + mod)
    car += 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 9)
    return car * np.exp(-t * 3.2) * np.minimum(1, t / 0.002)


def pad(freqs, length, attack=0.6):
    t = t_axis(length)
    s = np.zeros_like(t)
    for k, f in enumerate(freqs):
        for det in (-0.12, 0.0, 0.13):
            s += np.sin(2 * np.pi * f * (1 + det / 100) * t + k)
    s = fft_filter(s, hi=1400)
    env = np.minimum(1, t / attack) * np.clip((length - t) / 0.8, 0, 1)
    return s * env / (3 * len(freqs))


def whoosh(length=0.35, rev=False):
    t = t_axis(length)
    n = noise(length)
    out = np.zeros_like(n)
    # sweep a band by filtering short chunks
    chunks = 14
    m = len(n) // chunks
    for c in range(chunks):
        p = c / (chunks - 1)
        lo = 300 + 5000 * p
        out[c * m:(c + 1) * m] = fft_filter(n[c * m:(c + 1) * m], lo=lo, hi=lo * 3)
    env = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 2
    out = out * env
    return out[::-1] if rev else out


def riser(length):
    t = t_axis(length)
    p = t / length
    f = 120 * 2 ** (p * 4)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) * 0.35 + np.sign(np.sin(ph * 1.005)) * 0.08
    n = noise(length)
    nf = np.zeros_like(n)
    chunks = 24
    m = len(n) // chunks
    for c in range(chunks):
        q = c / (chunks - 1)
        nf[c * m:(c + 1) * m] = fft_filter(n[c * m:(c + 1) * m], lo=400 + 6000 * q)
    return (tone + nf * 0.6) * p ** 2


def impact(length=3.0):
    t = t_axis(length)
    f = 32 + 90 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    crash = fft_filter(noise(length), lo=3000) * np.exp(-t * 2.4) * 0.35
    return np.tanh((boom * 1.4 + crash) * 1.5)


def blip(freq, length=0.12):
    t = t_axis(length)
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 35) * np.minimum(1, t / 0.002)


def tick():
    t = t_axis(0.03)
    return fft_filter(noise(0.03), lo=3000) * np.exp(-t * 300)


def reverb(x, sec=1.8, decay=3.2, wet=0.3):
    """Convolve with an exponentially decaying stereo noise tail (FFT)."""
    t = t_axis(sec)
    outs = []
    for seed in (1, 2):
        ir = np.random.default_rng(seed).uniform(-1, 1, len(t)) * np.exp(-t * decay)
        ir = fft_filter(ir, hi=6000)
        ir[0] = 0
        n = len(x) + len(ir)
        y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:len(x)]
        outs.append(y / max(np.sqrt((ir ** 2).sum()), 1e-9) * wet)
    return outs


# ---------------------------------------------------------------- arrangement

F1, Ab1, Bb1, C2, Db1, Eb1 = midi(29), midi(32), midi(34), midi(36), midi(25), midi(27)

# 0–2.4 s · hook: "5 aplikasi." "1 coach." "Capek."
for i in range(5):                                   # slot-machine ticks of the 5
    place(tick(), i * 0.075, 0.5, pan=-0.2 + 0.1 * i)
place(kick(), 0.0, 0.9)
place(sub808(F1, 0.75), 0.0, 0.75)
place(kick(), 0.8, 0.9)
place(sub808(F1, 0.75), 0.8, 0.75)
place(whoosh(0.3, rev=True), 1.3, 0.35)
place(kick(), 1.6, 1.0)
place(sub808(F1 * 0.94, 0.8, glide_to=F1 * 0.7, glide_at=0.35), 1.6, 0.95)
place(clap(), 1.6, 0.8)
place(impact(0.8), 1.6, 0.35)
place(pad([midi(53), midi(56), midi(60)], 6.0, attack=1.5), 0.0, 0.18)

# 2.4–5.2 s · chaos: five tiles land, everything speeds up
for i in range(5):
    at = 2.4 + i * BEAT
    place(kick(0.9, 0.3), at, 1.0)
    place(sub808(F1 if i % 2 == 0 else Ab1, 0.35), at, 0.55)
    place(whoosh(0.22, rev=True), at - 0.22, 0.25, pan=(-0.5 if i % 2 else 0.5))
    place(clap(0.2), at + 0.2, 0.25)
for k in range(int(1.6 / (STEP * 2))):              # 8ths, 2.4–4.0
    place(hat(), 2.4 + k * STEP * 2, 0.35, pan=0.25)
t = 4.0
step = 0.1
while t < 5.2:                                       # hat roll that keeps accelerating
    place(hat(), t, 0.25 + 0.2 * (t - 4.0), pan=0.25)
    t += step
    step = max(0.025, step * 0.9)
pings = [880, 1175, 988, 1319, 1047, 1397, 1175, 1568, 1319, 1760]
for k, f in enumerate(pings):                        # notification pings
    at = 4.0 + k * 0.115
    place(blip(f), at, 0.16, pan=(-0.6 + 1.2 * ((k * 37) % 10) / 10))
    place(blip(f * 1.5, 0.08), at + 0.05, 0.08)
for k, n in enumerate([65, 68, 72, 70, 68, 65, 63, 65]):
    place(bell(midi(n), 0.6), 2.4 + k * 0.2, 0.12, pan=0.3)

# 5.2–6.4 s · strike, "Cukup.", collapse, silence
place(whoosh(0.25), 5.15, 0.6, pan=-0.3)
place(clap(), 5.2, 0.7)
place(kick(), 5.2, 0.7)
place(riser(0.8), 5.2, 0.5)
place(kick(), 5.6, 1.0)
place(clap(), 5.6, 0.6)
place(sub808(F1, 0.4), 5.6, 0.7)
place(whoosh(0.4, rev=True), 5.6, 0.45)
# 6.0–6.4: silence (nothing placed)

# 6.4 · drop
place(impact(3.2), 6.4, 0.9)
place(kick(), 6.4, 1.0)
place(clap(), 6.4, 0.5)
place(hat(True), 6.4, 0.35, pan=0.3)

# Main beat 6.4–22.0 (bars at 6.4 + 1.6k)
KICKS = [[0, 10], [0, 6, 10, 11], [0, 10, 13], [0, 3, 6, 10]]
BASS = [  # (step, freq, length in steps, glide_to)
    [(0, F1, 9, None), (10, F1, 6, Ab1)],
    [(0, Db1 * 2, 9, None), (10, Db1 * 2, 6, None)],
    [(0, Eb1 * 2, 9, None), (10, Eb1 * 2, 6, F1)],
    [(0, F1, 6, None), (6, Ab1, 4, None), (10, C2, 6, F1)],
]
MEL = [  # bell arp in 8ths, F minor pentatonic
    [77, 80, 84, 80, 82, 80, 77, 75],
    [77, 80, 84, 87, 84, 82, 80, 82],
]
bar = 0
start = 6.4
while start + bar * BAR < 22.0 - 1e-6:
    b0 = start + bar * BAR
    pat = KICKS[bar % 4]
    for s in pat:
        if b0 + s * STEP < 22.0:
            place(kick(0.9, 0.35), b0 + s * STEP, 0.75)
    for s, f, ln, gl in BASS[bar % 4]:
        if b0 + s * STEP < 22.0:
            place(sub808(f, ln * STEP, glide_to=gl, glide_at=ln * STEP * 0.6), b0 + s * STEP, 0.62)
    place(clap(), b0 + 8 * STEP, 0.62)
    roll = bar % 2 == 1
    for s in range(0, 16, 2):
        if roll and s >= 12:
            continue
        place(hat(), b0 + s * STEP, 0.32 if s % 4 == 0 else 0.22, pan=0.28)
    if roll:                                         # 32nd / triplet rolls
        for k in range(12 if bar % 4 == 3 else 8):
            dt = (0.4 / 12) if bar % 4 == 3 else 0.05
            place(hat(), b0 + 12 * STEP + k * dt, 0.18 + 0.012 * k, pan=0.28 - 0.04 * k)
    if bar % 4 == 2:
        place(hat(True), b0 + 14 * STEP, 0.18, pan=-0.2)
    for k, n in enumerate(MEL[bar % 2]):
        if b0 + k * 0.2 < 22.0:
            place(bell(midi(n)), b0 + k * 0.2, 0.085, pan=(0.35 if k % 2 else -0.35))
    bar += 1
place(pad([midi(53), midi(56), midi(60), midi(63)], 15.8, attack=2.0), 6.4, 0.1)

# Scene accents
place(blip(1568, 0.09), 6.8, 0.12)
for at in (13.2, 15.6, 17.6, 19.8):                  # whip pans
    place(whoosh(0.3), at - 0.18, 0.5, pan=0.4)
place(blip(1760), 10.8, 0.2)                         # booking tap
place(blip(2349, 0.2), 10.85, 0.12)
for k in range(4):                                   # set ticks
    place(blip(1318 + 110 * k, 0.07), 13.6 + k * BEAT, 0.16)
for n in (84, 88, 91):                               # PR chime
    place(bell(midi(n), 1.4), 15.0, 0.2)
place(kick(0.6, 0.25), 21.0, 0.6)                    # LUNAS stamp
place(clap(0.2), 21.0, 0.3)
for k in range(12):                                  # rupiah counter ticks
    place(tick(), 20.0 + k * 0.06, 0.3)

# 22–25.6 s · word montage, then the icons drop into the phone
for i in range(5):
    at = 22.0 + i * BEAT
    place(kick(), at, 0.9)
    place(sub808([F1, Ab1, Bb1, C2, Eb1 * 2][i], 0.38), at, 0.6)
    place(clap(0.25), at, 0.45)
    place(hat(), at + 0.2, 0.3)
t = 24.0
step = 0.2
while t < 25.4:                                      # snare roll build
    place(clap(0.15), t, 0.25 + 0.3 * (t - 24.0) / 1.4)
    t += step
    step = max(0.033, step * 0.8)
for i in range(5):
    place(whoosh(0.2, rev=True), 24.0 + i * 0.3 - 0.1, 0.25, pan=-0.4 + 0.2 * i)
    place(blip(midi(77 + [0, 3, 7, 10, 12][i])), 24.1 + i * 0.3, 0.14)
place(riser(1.4), 24.0, 0.45)

# 25.6–30 s · end card
place(impact(4.4), 25.6, 1.0)
place(kick(), 25.6, 1.0)
place(sub808(F1, 3.6), 25.6, 0.8)
for n, d in zip((65, 68, 72, 77), (0, 0.05, 0.1, 0.15)):
    place(bell(midi(n), 3.0), 25.6 + d, 0.12, pan=(-0.3 if n % 2 else 0.3))
for k, n in enumerate([77, 80, 84, 82, 80, 77, 75, 77, 80, 84, 77]):   # "Move Better." types on
    place(blip(midi(n + 12), 0.06), 26.4 + k * 0.075, 0.05)
place(pad([midi(53), midi(56), midi(60), midi(65)], 4.4, attack=0.4), 25.6, 0.14)

# ---------------------------------------------------------------- master

wl, wr = reverb((L + R) / 2)
L += wl
R += wr
t = np.arange(N) / SR
fade = np.clip((30.0 - t) / 1.0, 0, 1) ** 1.5
L *= fade
R *= fade
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = L / peak * 1.5, R / peak * 1.5                # drive into the soft limiter
L, R = np.tanh(L), np.tanh(R)
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
gain = 10 ** (-1 / 20) / peak                        # -1 dBFS
out = np.stack([L * gain, R * gain], axis=1)
pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')

path = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', path)
