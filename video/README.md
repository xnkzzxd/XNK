# XNK promo reel

A ~19 s looping promo reel (9:16 1080×1920 and 1:1 1080×1080) in a kinetic "poster" style:
red / black / paper, giant condensed type, the app's own UI as cut-outs (torn paper, halftone,
sliced strips, extreme crops), grain and scan lines. Cuts follow the beat map of the audio track.

| File | Role |
| --- | --- |
| `capture.js` + `shots.json` | Screenshots of the demo (`/demo/`, sample data only) — whole screens and single cards (`p-*.png`) |
| `beatmap.py` | Tempo + beat times from a WAV → `assets/beats.json` |
| `reel.html` | The composition. `seek(t)` draws any moment; every motion is computed from `t` (no CSS timing), so frames are deterministic |
| `render.js` | Playwright → PNG frames → ffmpeg MP4 (with the audio, plus a `-silent` copy) |

Seamless loop: the last scene irises into the exact opening frame and holds it, so replay has no jump.

## Re-render

```sh
python3 -m http.server 8765            # from the repo root
node video/capture.js                  # only if the app UI changed (needs the CDN scripts, see CDN_DIR in capture.js)
ffmpeg -i <music.mp4|wav> -vn -ac 1 -ar 22050 mono.wav && python3 -I video/beatmap.py mono.wav video/assets/beats.json
ffmpeg -i <music> -vn -c:a pcm_s16le audio.wav
node video/render.js audio.wav video/out 30          # or add 9x16 / 1x1 for one size
```

Audio is not in the repo. A commercial song in a business post can be muted or claimed on
Instagram — post the `-silent` file and add the track from Instagram's music library instead.
