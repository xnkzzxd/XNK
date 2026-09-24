#!/usr/bin/env python3
"""Build the landing hero images from the coach photo.

Usage:
  pip install pillow numpy rembg onnxruntime fonttools brotli
  python3 make-landing-images.py SOURCE.png OUT_DIR ANTON.ttf

Outputs (upload OUT_DIR/* to the BookingPT repo, folder img/):
  hero-cutout.webp  head -> hips crop, background removed (alpha)
  hero-normal.webp  normal map of the same crop, for the WebGL light
  hero-anatomy.webp the same crop drawn as an anatomy chart (grey body, back
                    muscles red) for the desktop "muscle highlight" on scroll
  og.jpg            1200x630 share preview (WhatsApp / Instagram / Facebook)

The source is the 900x1600 back photo on a plain light-grey studio background.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Crop in source pixels: top of the hair down to the hips/buttocks, arms included.
CROP = (200, 318, 730, 1012)
UPSCALE = 1.5
PAGE_BG = (236, 236, 236)


def cut_out(src):
    """RGBA with the studio background removed."""
    try:
        from rembg import new_session, remove
        return remove(src.convert('RGB'), session=new_session('isnet-general-use'))
    except ImportError:
        # Fallback: the background is a near-uniform light grey, so distance from
        # it is a usable matte.
        rgb = np.asarray(src.convert('RGB')).astype(np.float32)
        bg = np.median(np.concatenate([rgb[:40].reshape(-1, 3), rgb[:, :30].reshape(-1, 3)]), axis=0)
        dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
        alpha = np.clip((dist - 14) / 22, 0, 1) * 255
        out = src.convert('RGBA')
        out.putalpha(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
        return out


def blur(a, sigma):
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(sigma))).astype(np.float32) / 255


def normal_map(rgba):
    """Pseudo normal map: brightness ~ height (the studio light is frontal), plus a
    rounded silhouette from the alpha so edges catch a rim light."""
    arr = np.asarray(rgba).astype(np.float32) / 255
    lum = arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114
    alpha = arr[..., 3]
    lum = lum * alpha + lum[alpha > 0.5].mean() * (1 - alpha)
    height = 0.55 * blur(lum, 2.2) + 0.45 * blur(lum, 7) + 0.9 * blur(alpha, 14)
    gy, gx = np.gradient(height)
    strength = 9.0
    n = np.dstack([-gx * strength, -gy * strength, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    rgb = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    flat = np.array([128, 128, 255], dtype=np.uint8)
    mask = (alpha < 0.02)[..., None]
    rgb = np.where(mask, flat, rgb)
    return Image.fromarray(rgb, 'RGB')


# Back muscles (trapezius, rhomboids, infraspinatus/teres, latissimus) as one
# outline in crop coordinates (0-1), plus the lumbar fascia and the spine, drawn
# like the classic anatomy chart. Placed by hand on this photo.
BACK = [(0.37, 0.256), (0.47, 0.255), (0.55, 0.27), (0.62, 0.29), (0.68, 0.305), (0.715, 0.325),
        (0.725, 0.355), (0.716, 0.395), (0.701, 0.43), (0.69, 0.47), (0.68, 0.52), (0.672, 0.575),
        (0.668, 0.63), (0.664, 0.692), (0.60, 0.692), (0.53, 0.575), (0.505, 0.553), (0.48, 0.575),
        (0.41, 0.692), (0.33, 0.692), (0.322, 0.63), (0.312, 0.575), (0.30, 0.52), (0.288, 0.47),
        (0.276, 0.43), (0.268, 0.395), (0.262, 0.37), (0.245, 0.355), (0.28, 0.33), (0.32, 0.30),
        (0.355, 0.275)]
LUMBAR = [(0.41, 0.692), (0.48, 0.575), (0.505, 0.553), (0.53, 0.575), (0.60, 0.692), (0.664, 0.692),
          (0.664, 0.708), (0.33, 0.708), (0.33, 0.692)]
SPINE = [(0.438, 0.29), (0.458, 0.34), (0.474, 0.40), (0.486, 0.46), (0.494, 0.52), (0.50, 0.59), (0.503, 0.69)]
MUSCLE_RED = np.array([0.90, 0.31, 0.21])
FASCIA = np.array([0.91, 0.84, 0.75])


def _smooth(pts, rounds=3):
    """Chaikin corner cutting: rounds the hand-placed outline into an organic shape."""
    for _ in range(rounds):
        nxt = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
            nxt += [(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1), (0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)]
        pts = nxt
    return pts


def _poly_mask(size, pts, blur_px):
    w, h = size
    pts = _smooth(pts)
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(x * w, y * h) for x, y in pts], fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(blur_px))).astype(np.float32) / 255


def _along(pts, step):
    """Points every `step` (0-1 units) along a polyline."""
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(np.hypot(x1 - x0, y1 - y0) / step))
        out += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    return out


def anatomy(rgba):
    """Grey illustration body with the back muscles in red (like an anatomy chart)."""
    w, h = rgba.size
    arr = np.asarray(rgba).astype(np.float32) / 255
    alpha = arr[..., 3]
    lum = arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114
    skin = np.percentile(lum[alpha > 0.5], 92)
    ln = np.clip(lum / skin, 0, 1.2)
    scale = w / 1000.0
    # Contour lines from the edges of the (slightly blurred) photo.
    soft = blur(ln / 1.2, 1.2) * 1.2
    gy, gx = np.gradient(soft)
    edge = np.clip(np.hypot(gx, gy) * 14, 0, 1)
    # Local contrast = muscle shapes (scapula, trapezius, lats) from the photo itself.
    detail = blur(ln / 1.2, 2.2 * scale) * 1.2 - blur(ln / 1.2, 11 * scale) * 1.2
    grey = 0.47 + 0.48 * np.power(np.clip(ln, 0, 1), 0.7) + 0.35 * detail
    grey = grey * (1 - 0.5 * edge)
    out = np.dstack([grey, grey, grey])
    back = _poly_mask(rgba.size, BACK, 2.5 * scale) * alpha
    lumbar = _poly_mask(rgba.size, LUMBAR, 2.5 * scale) * alpha * (1 - back)
    shade = np.clip(0.6 + 0.5 * np.clip(blur(ln / 1.2, 1.5 * scale) * 1.2, 0, 1.15) + 1.7 * detail, 0.6, 1.25)
    red = MUSCLE_RED[None, None, :] * shade[..., None]
    red = red * (1 - 0.45 * edge)[..., None] + np.clip(shade - 1.0, 0, 1)[..., None] * 0.35
    fascia = FASCIA[None, None, :] * (0.8 + 0.2 * np.clip(ln, 0, 1) + 0.4 * detail)[..., None]
    out = out * (1 - back[..., None]) + red * back[..., None]
    out = out * (1 - lumbar[..., None]) + fascia * lumbar[..., None]
    # Spine: a dotted light line, like the vertebrae on the chart.
    sp = Image.new('L', rgba.size, 0)
    d = ImageDraw.Draw(sp)
    r = max(1.5, 3.2 * scale)
    for x, y in _along(SPINE, 0.017):
        d.ellipse([x * w - r, y * h - r * 0.8, x * w + r, y * h + r * 0.8], fill=235)
    d.line([(x * w, y * h) for x, y in SPINE], fill=120, width=max(1, round(2.5 * scale)))
    spine = np.asarray(sp.filter(ImageFilter.GaussianBlur(0.8 * scale))).astype(np.float32) / 255 * alpha
    out = out * (1 - spine[..., None]) + FASCIA[None, None, :] * spine[..., None]
    rgb = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    res = Image.fromarray(rgb, 'RGB')
    res.putalpha(rgba.getchannel('A'))
    return res


def og_image(cut, font_path):
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), PAGE_BG)
    draw = ImageDraw.Draw(img)
    big = ImageFont.truetype(font_path, 330)
    text = 'JIZDAN'
    box = draw.textbbox((0, 0), text, font=big)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text(((W - tw) / 2 - box[0], 150 - box[1]), text, font=big, fill=(12, 12, 12))
    body = cut.copy()
    scale = 610 / body.height
    body = body.resize((round(body.width * scale), 610), Image.LANCZOS)
    img.paste(body, ((W - body.width) // 2, H - body.height + 20), body)
    small = ImageFont.truetype(font_path, 34)
    draw.text((56, 44), 'XNK PERSONAL TRAINING', font=small, fill=(12, 12, 12))
    right = 'BANJARNEGARA & PURWOKERTO'
    rb = draw.textbbox((0, 0), right, font=small)
    draw.text((W - 56 - (rb[2] - rb[0]), 44), right, font=small, fill=(12, 12, 12))
    return img


def main():
    src_path, out_dir, font_path = sys.argv[1:4]
    src = Image.open(src_path)
    cut = cut_out(src).crop(CROP)
    size = (round(cut.width * UPSCALE), round(cut.height * UPSCALE))
    big = cut.resize(size, Image.LANCZOS)
    rgb = big.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))
    rgb.putalpha(big.getchannel('A'))
    rgb.save(out_dir + '/hero-cutout.webp', 'WEBP', quality=88, method=6)
    anatomy(rgb).save(out_dir + '/hero-anatomy.webp', 'WEBP', quality=88, method=6)
    normal_map(cut).save(out_dir + '/hero-normal.webp', 'WEBP', quality=92, method=6)
    og_image(cut, font_path).save(out_dir + '/og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
    print('cutout', size, 'normal', cut.size)


if __name__ == '__main__':
    main()
