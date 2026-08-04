"""Remove charcoal plate backgrounds from commodity sticker PNGs."""
from __future__ import annotations

import math
import statistics
from collections import deque
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parents[1] / "public" / "commodities"


def color_dist(a: tuple[int, ...], b: tuple[int, ...]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a[:3], b[:3], strict=False)))


def edge_bg_color(px, w: int, h: int) -> tuple[int, int, int]:
    samples: list[tuple[int, int, int]] = []
    step = max(1, w // 32)
    for x in range(0, w, step):
        samples.append(px[x, 0][:3])
        samples.append(px[x, h - 1][:3])
    for y in range(0, h, step):
        samples.append(px[0, y][:3])
        samples.append(px[w - 1, y][:3])
    return tuple(int(statistics.median([s[i] for s in samples])) for i in range(3))  # type: ignore[return-value]


def remove_background(path: Path, tol: float = 36.0) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = edge_bg_color(px, w, h)

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if color_dist((r, g, b), bg) > tol:
            continue
        px[x, y] = (r, g, b, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            d = color_dist((r, g, b), bg)
            if d > tol * 1.35:
                continue
            near_clear = False
            for dx, dy in (
                (1, 0),
                (-1, 0),
                (0, 1),
                (0, -1),
                (1, 1),
                (-1, -1),
                (1, -1),
                (-1, 1),
            ):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    near_clear = True
                    break
            if near_clear:
                fade = max(0.0, 1.0 - d / (tol * 1.35))
                px[x, y] = (r, g, b, int(a * (1.0 - fade * 0.92)))

    bbox = im.getbbox()
    if bbox:
        pad = 4
        left, top, right, bottom = bbox
        left = max(0, left - pad)
        top = max(0, top - pad)
        right = min(w, right + pad)
        bottom = min(h, bottom + pad)
        im = im.crop((left, top, right, bottom))

    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    im.thumbnail((120, 120), Image.Resampling.LANCZOS)
    ox = (128 - im.size[0]) // 2
    oy = (128 - im.size[1]) // 2
    canvas.paste(im, (ox, oy), im)
    canvas.save(path, "PNG", optimize=True)
    print(f"{path.name}: bg~{bg} bbox={bbox} corner={canvas.getpixel((0, 0))}")


def main() -> None:
    for path in sorted(BASE.glob("*.png")):
        remove_background(path)
    print("done")


if __name__ == "__main__":
    main()
