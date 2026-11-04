"""Beat map for the reel: onset strength -> tempo -> beat grid. Usage:
  python3 -I beatmap.py <audio.wav (mono)> <out beats.json>"""
import sys, json, wave
import numpy as np
w = wave.open(sys.argv[1]); sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
hop, n = 256, 1024
frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
mag = np.abs(np.fft.rfft(frames, axis=1))
low = np.log1p(mag[:, :int(150 * n / sr)] * 50).sum(1)          # kick band
flux = np.maximum(0, np.diff(np.log1p(mag * 50), axis=0)).sum(1)
flux = np.concatenate([[0], flux]); flux /= flux.max()
fps = sr / hop
# tempo: autocorrelation of flux in 70..180 BPM
ac = np.correlate(flux - flux.mean(), flux - flux.mean(), 'full')[len(flux) - 1:]
lags = np.arange(len(ac)); bpm = 60 * fps / np.maximum(lags, 1)
ok = (bpm > 70) & (bpm < 180)
lag = lags[ok][np.argmax(ac[ok])]; tempo = 60 * fps / lag
period = lag
# phase: best offset of the grid on flux
best = max(range(int(period)), key=lambda o: flux[o::int(period)].sum() if True else 0)
# refine with fractional period
beats = []
t = best
while t < len(flux):
    lo, hi = int(max(0, t - 3)), int(min(len(flux), t + 4))
    pk = lo + int(np.argmax(flux[lo:hi])) if hi > lo else int(t)
    beats.append(pk / fps); t = pk + period
dur = len(x) / sr
strength = [float(flux[int(b * fps)]) for b in beats]
onsets = [i / fps for i in range(1, len(flux) - 1) if flux[i] > 0.35 and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1]]
json.dump({'duration': dur, 'tempo': tempo, 'beats': [round(b, 3) for b in beats],
           'strength': [round(s, 3) for s in strength], 'onsets': [round(o, 3) for o in onsets]}, open(sys.argv[2], 'w'), indent=1)
print('tempo %.1f, %d beats, dur %.2f' % (tempo, len(beats), dur)); print(beats[:12])
