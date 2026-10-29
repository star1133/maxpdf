"""Draw (possibly Thai/CJK) text onto PDF pages with proper shaping.

PyMuPDF's plain insert_text cannot shape Thai; insert_htmlbox can. Latin-1 text
uses the built-in base-14 fonts (small output); everything else is rendered
through MuPDF's HTML engine with bundled fonts.
"""
from __future__ import annotations

import io
import math
from html import escape
from pathlib import Path

import pymupdf as fitz
from PIL import Image

from .. import config

FONT_DIR = config.ROOT / "fonts"
_ARCHIVE = None

_FACE_CSS = """
@font-face{font-family:LibSans;src:url(LiberationSans-Regular.ttf)}
@font-face{font-family:LibSans;font-weight:bold;src:url(LiberationSans-Bold.ttf)}
@font-face{font-family:LibSans;font-style:italic;src:url(LiberationSans-Italic.ttf)}
@font-face{font-family:LibSans;font-weight:bold;font-style:italic;src:url(LiberationSans-BoldItalic.ttf)}
@font-face{font-family:LibSerif;src:url(LiberationSerif-Regular.ttf)}
@font-face{font-family:LibSerif;font-weight:bold;src:url(LiberationSerif-Bold.ttf)}
@font-face{font-family:LibSerif;font-style:italic;src:url(LiberationSerif-Italic.ttf)}
@font-face{font-family:LibSerif;font-weight:bold;font-style:italic;src:url(LiberationSerif-BoldItalic.ttf)}
@font-face{font-family:LibMono;src:url(LiberationMono-Regular.ttf)}
@font-face{font-family:LibMono;font-weight:bold;src:url(LiberationMono-Bold.ttf)}
@font-face{font-family:ThaiSans;src:url(Garuda.ttf)}
@font-face{font-family:ThaiSans;font-weight:bold;src:url(Garuda-Bold.ttf)}
@font-face{font-family:ThaiSans;font-style:italic;src:url(Garuda-Oblique.ttf)}
@font-face{font-family:ThaiSans;font-weight:bold;font-style:italic;src:url(Garuda-BoldOblique.ttf)}
@font-face{font-family:ThaiSerif;src:url(Norasi.ttf)}
@font-face{font-family:ThaiSerif;font-weight:bold;src:url(Norasi-Bold.ttf)}
@font-face{font-family:ThaiSerif;font-style:italic;src:url(Norasi-Italic.ttf)}
@font-face{font-family:ThaiSerif;font-weight:bold;font-style:italic;src:url(Norasi-BoldItalic.ttf)}
@font-face{font-family:ThaiMono;src:url(TlwgMono.ttf)}
@font-face{font-family:ThaiMono;font-weight:bold;src:url(TlwgMono-Bold.ttf)}
"""

_FAMILY = {
    "sans": "LibSans, ThaiSans, sans-serif",
    "serif": "LibSerif, ThaiSerif, serif",
    "mono": "LibMono, ThaiMono, monospace",
}


def archive() -> fitz.Archive:
    global _ARCHIVE
    if _ARCHIVE is None:
        _ARCHIVE = fitz.Archive(str(FONT_DIR))
    return _ARCHIVE


def is_latin1(text: str) -> bool:
    try:
        text.encode("latin-1")
        return True
    except UnicodeEncodeError:
        return False


def _base14(font: str, bold: bool, italic: bool) -> str:
    if font == "serif":
        return {(0, 0): "tiro", (1, 0): "tibo", (0, 1): "tiit", (1, 1): "tibi"}[(int(bold), int(italic))]
    if font == "mono":
        return {(0, 0): "cour", (1, 0): "cobo", (0, 1): "coit", (1, 1): "cobi"}[(int(bold), int(italic))]
    return {(0, 0): "helv", (1, 0): "hebo", (0, 1): "heit", (1, 1): "hebi"}[(int(bold), int(italic))]


def html_snippet(text: str, size: float, color=(0, 0, 0), font="sans", bold=False, italic=False,
                 align="left", line_height=1.25) -> str:
    r, g, b = (int(round(c * 255)) for c in color)
    style = (f"font-family:{_FAMILY.get(font, _FAMILY['sans'])};font-size:{size}pt;"
             f"color:rgb({r},{g},{b});text-align:{align};line-height:{line_height};margin:0;"
             f"font-weight:{'bold' if bold else 'normal'};font-style:{'italic' if italic else 'normal'};")
    body = "<br>".join(escape(line) or "&nbsp;" for line in text.split("\n"))
    return f'<div style="{style}">{body}</div>'


def text_in_rect(page: fitz.Page, rect: fitz.Rect, text: str, size: float, color=(0, 0, 0), *,
                 font="sans", bold=False, italic=False, align="left", shrink=True, overlay=True):
    """Vector text inside a box (wraps). Shrinks to fit when `shrink` is true."""
    html = html_snippet(text, size, color, font, bold, italic, align)
    kw = dict(css=_FACE_CSS, archive=archive(), overlay=overlay)
    if shrink:
        kw["scale_low"] = 0.3
    return page.insert_htmlbox(rect, html, **kw)


def text_png(text: str, size: float, color=(0, 0, 0), *, font="sans", bold=False, italic=False,
             opacity=1.0, rotate=0.0, scale=4.0):
    """Shaped text as a tight RGBA image. Returns (PIL.Image, pt_per_px)."""
    tmp = fitz.open()
    page = tmp.new_page(width=1800, height=max(200, size * 6))
    page.insert_htmlbox(fitz.Rect(10, 10, 1790, page.rect.height - 10),
                        html_snippet(text, size, color, font, bold, italic).replace(
                            "margin:0;", "margin:0;white-space:nowrap;"),
                        css=_FACE_CSS, archive=archive())
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=True)
    img = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
    tmp.close()
    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    if opacity < 1:
        a = img.getchannel("A").point(lambda v: int(v * opacity))
        img.putalpha(a)
    if rotate:
        img = img.rotate(rotate, expand=True, resample=Image.BICUBIC)
    return img, 1.0 / scale


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def draw_text(page: fitz.Page, text: str, x: float, y: float, size: float, color=(0, 0, 0), *,
              font="sans", bold=False, italic=False, opacity=1.0, rotate=0.0,
              anchor="left", baseline=True, overlay=True):
    """Draw one line of text at (x, y). `anchor`: left|center|right horizontally;
    y is the baseline when `baseline` else the vertical centre. Returns used rect."""
    if is_latin1(text):
        fn = _base14(font, bold, italic)
        f = fitz.Font(fn)
        w = f.text_length(text, fontsize=size)
        ox = {"left": 0, "center": -w / 2, "right": -w}[anchor]
        pos = fitz.Point(x + ox, y if baseline else y + size * 0.35)
        kw = dict(fontsize=size, fontname=fn, color=color, fill_opacity=opacity, overlay=overlay)
        if rotate:
            pivot = fitz.Point(x, y)
            page.insert_text(pos, text, morph=(pivot, fitz.Matrix(rotate)), **kw)
        else:
            page.insert_text(pos, text, **kw)
        return fitz.Rect(pos.x, pos.y - size, pos.x + w, pos.y + size * 0.25)
    img, k = text_png(text, size, color, font=font, bold=bold, italic=italic,
                      opacity=opacity, rotate=rotate)
    w, h = img.width * k, img.height * k
    ox = {"left": 0, "center": -w / 2, "right": -w}[anchor]
    cy = y - h * 0.7 if baseline and not rotate else y - h / 2
    rect = fitz.Rect(x + ox, cy, x + ox + w, cy + h)
    page.insert_image(rect, stream=png_bytes(img), overlay=overlay)
    return rect


def measure(text: str, size: float, font="sans", bold=False, italic=False) -> tuple[float, float]:
    if is_latin1(text):
        f = fitz.Font(_base14(font, bold, italic))
        return f.text_length(text, fontsize=size), size
    img, k = text_png(text, size, font=font, bold=bold, italic=italic)
    return img.width * k, img.height * k
