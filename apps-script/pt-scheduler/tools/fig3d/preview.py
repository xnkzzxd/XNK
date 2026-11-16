# Spike previews: contact sheet, animated WebP, and a size test of the planned sprite strips.
import sys, os, numpy as np
from PIL import Image
d, out = sys.argv[1], sys.argv[2]; N = 13; SIZE = 480
def load(i):
    b = np.asarray(Image.open(f'{d}/b{i:02d}.png').convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)).astype(float) / 255
    m = np.asarray(Image.open(f'{d}/m{i:02d}.png').convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)).astype(float) / 255
    return b, (m[..., :3].mean(-1) * m[..., 3])[..., None]
F = [load(i) for i in range(N)]
def comp(i, acc, bg):
    b, cov = F[i]; rgb = b[..., :3] * (1 - cov) + b[..., :3] * (np.array(acc) / 255) * cov; a = b[..., 3:4]
    return ((rgb * a + (np.array(bg) / 255) * (1 - a)) * 255).clip(0, 255).astype(np.uint8)
ACC = {'merah': (220, 38, 38), 'biru': (37, 99, 235), 'hijau': (22, 163, 74)}; BG = {'terang': (250, 250, 249), 'gelap': (17, 17, 17)}
rows = [np.concatenate([comp(i, a, bg) for a in ACC.values() for i in (0, N - 1)], 1) for bg in BG.values()]
Image.fromarray(np.concatenate(rows, 0)).resize((SIZE * 6 * 2 // 3, SIZE * 2 * 2 // 3), Image.LANCZOS).save(f'{out}/row-lembar-kontak.png')
for name, acc, bg in (('row-animasi-terang-merah', 'merah', 'terang'), ('row-animasi-gelap-hijau', 'hijau', 'gelap')):
    seq = [Image.fromarray(comp(i, ACC[acc], BG[bg])) for i in list(range(N)) + list(range(N - 2, 0, -1))]
    seq[0].save(f'{out}/{name}.webp', save_all=True, append_images=seq[1:], duration=130, loop=0, quality=82)
# planned files: base strip (RGBA) + mask strip (alpha only)
base = np.concatenate([(F[i][0] * 255).astype(np.uint8) for i in range(N)], 1)
mask = np.concatenate([np.concatenate([np.zeros((SIZE, SIZE, 3)), F[i][1] * 255], 2).astype(np.uint8) for i in range(N)], 1)
Image.fromarray(base, 'RGBA').save(f'{out}/strip.webp', quality=80, method=6); Image.fromarray(mask, 'RGBA').save(f'{out}/strip.m.webp', quality=70, method=6)
for f in sorted(os.listdir(out)): print(f, os.path.getsize(f'{out}/{f}'))
