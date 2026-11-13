"""画像の読み込み・縮小・JPEG 化（すべてメモリ上。ディスクには書かない: ADR-0004）。"""

from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image, ImageOps

JPEG_QUALITY = 85


def encode_image(img: Image.Image, max_edge: int | None = None, quality: int = JPEG_QUALITY):
    """PIL 画像 → (base64 文字列, 幅, 高さ, JPEG バイト数)。
    max_edge を超える場合だけ長辺を max_edge に縮小する（拡大はしない）。"""
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    if max_edge is not None and max(w, h) > max_edge:
        scale = max_edge / max(w, h)
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    data = buf.getvalue()
    return base64.b64encode(data).decode("ascii"), img.size[0], img.size[1], len(data)


def prepare_image(path: Path, max_edge: int | None = None, quality: int = JPEG_QUALITY):
    with Image.open(path) as img:
        img.load()
        return encode_image(img, max_edge, quality)
