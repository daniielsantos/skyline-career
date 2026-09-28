"""Knock out charcoal field from airframe hero lockup for landing PNG."""
from __future__ import annotations

import os
import sys

from PIL import Image


def is_amber(r: int, g: int, b: int) -> bool:
    """Orange accent #f0a35a-ish — high R/G, B lower."""
    if r < 80:
        return False
    if g < 60:
        return False
    if b > min(r, g) * 0.85:
        return False
    return r >= g * 0.85 and (r + g) / 2 > b + 25


def alpha_for_pixel(r: int, g: int, b: int) -> int:
    mx = max(r, g, b)
    lum = (r + g + b) / 3.0

    if is_amber(r, g, b):
        return 255

    # Bright = aircraft white/grey or highlights
    if mx >= 120 or lum >= 90:
        return 255

    # Hard knockout: near-black / charcoal field
    if mx < 45 or lum < 38:
        return 0

    # Soft edge ramp for dark fringe pixels
    if mx < 70 and lum < 55:
        t = (mx - 45) / 25.0  # 0 at mx=45, 1 at mx=70
        t = max(0.0, min(1.0, t))
        return int(255 * t)

    return 255


def process(src: str, dst: str) -> None:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    total = w * h
    transparent = 0
    semi = 0

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            na = alpha_for_pixel(r, g, b)
            if na == 0:
                transparent += 1
            elif na < 255:
                semi += 1
            px[x, y] = (r, g, b, na)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, optimize=True)

    out_size = os.path.getsize(dst)
    pct = 100.0 * transparent / total
    has_alpha = im.mode == "RGBA"
    # verify not "fake" alpha (all opaque dark)
    sample_dark = 0
    for y in range(0, h, max(1, h // 20)):
        for x in range(0, w, max(1, w // 20)):
            r, g, b, a = px[x, y]
            if max(r, g, b) < 45 and a == 0:
                sample_dark += 1

    print(f"size: {w}x{h}")
    print(f"transparent_pixels: {transparent} ({pct:.1f}%)")
    print(f"semi_transparent: {semi}")
    print(f"output_bytes: {out_size}")
    print(f"mode: {im.mode}, real_knockout_samples: {sample_dark}")


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = os.path.join(
        root, "packages", "career-ui", "src", "assets", "brand", "airframe-hero-lockup.png"
    )
    dst = os.path.join(root, "sites", "playairframe", "assets", "airframe-hero-lockup.png")
    if len(sys.argv) >= 3:
        src, dst = sys.argv[1], sys.argv[2]
    process(src, dst)
