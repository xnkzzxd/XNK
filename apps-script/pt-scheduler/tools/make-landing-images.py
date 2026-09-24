#!/usr/bin/env python3
"""Build the landing hero images from the coach photo.

Usage:
  pip install pillow numpy rembg onnxruntime fonttools brotli
  python3 make-landing-images.py SOURCE.png OUT_DIR ANTON.ttf

Outputs (upload OUT_DIR/* to the BookingPT repo, folder img/):
  hero-cutout.webp  head -> hips crop, background removed (alpha)
  hero-normal.webp  normal map of the same crop, for the WebGL light
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
    normal_map(cut).save(out_dir + '/hero-normal.webp', 'WEBP', quality=92, method=6)
    og_image(cut, font_path).save(out_dir + '/og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
    print('cutout', size, 'normal', cut.size)


if __name__ == '__main__':
    main()
