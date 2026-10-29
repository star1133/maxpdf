"""Page-level tools: merge, split, rotate, organize, crop, page numbers, watermark."""
from __future__ import annotations

import io
from pathlib import Path

import pymupdf as fitz
from PIL import Image

from . import textdraw as td
from .base import (ToolError, Ctx, open_pdf, parse_pages, save_pdf, to_rgb, tool, zip_outputs)


def pdf_of(ctx: Ctx, i: int):
    """Open input i using a password from opts.passwords[i] / opts.password."""
    pw = (ctx.opts.get("passwords") or {}).get(str(i)) or ctx.opts.get("password")
    return open_pdf(ctx.paths[i], pw)


def upright(page: fitz.Page):
    """Bake page rotation into content so overlay coordinates match what users see."""
    if page.rotation:
        page.remove_rotation()


# ---------------------------------------------------------------------------
@tool("merge", multi=True, min_files=2, timeout=300)
def merge(ctx: Ctx):
    out = fitz.open()
    toc, bookmarks = [], bool(ctx.opts.get("bookmarks"))
    n = len(ctx.paths)
    for i in range(n):
        ctx.progress(i / n, f"{i + 1}/{n}")
        src = pdf_of(ctx, i)
        start = len(out)
        out.insert_pdf(src)
        if bookmarks:
            toc.append([1, Path(ctx.names[i]).stem, start + 1])
        src.close()
    if toc:
        out.set_toc(toc)
    dst = ctx.new_path("merged.pdf")
    save_pdf(out, dst)
    ctx.data["pages"] = len(out)
    ctx.add_output(dst, "merged.pdf")


# ---------------------------------------------------------------------------
@tool("split", timeout=300)
def split(ctx: Ctx):
    src = pdf_of(ctx, 0)
    total = len(src)
    mode = ctx.opt("mode", "ranges")
    groups: list[list[int]] = []
    if mode == "every":
        n = max(1, int(ctx.opt("n", 1)))
        groups = [list(range(i, min(i + n, total))) for i in range(0, total, n)]
    elif mode == "pages":
        groups = [[i] for i in range(total)]
    else:
        spec = str(ctx.opt("ranges", "all"))
        if ctx.opt("merge_ranges", False):
            groups = [parse_pages(spec, total)]
        else:
            for part in [p for p in spec.replace(";", ",").split(",") if p.strip()]:
                groups.append(parse_pages(part, total))
            if not groups:
                raise ToolError("bad_pages", "Enter at least one page range.")
    if len(groups) > 500:
        raise ToolError("too_many", "That would create more than 500 files.")
    files = []
    for gi, pages in enumerate(groups):
        ctx.progress(gi / len(groups), f"{gi + 1}/{len(groups)}")
        out = fitz.open()
        for p in pages:
            out.insert_pdf(src, from_page=p, to_page=p)
        label = f"{pages[0] + 1}" if len(pages) == 1 else f"{pages[0] + 1}-{pages[-1] + 1}"
        name = f"{ctx.stem()}_{label}.pdf"
        dst = ctx.tmp / f"s{gi:04d}.pdf"
        save_pdf(out, dst)
        files.append((dst, name))
    ctx.data["files"] = len(files)
    if len(files) == 1:
        ctx.add_output(files[0][0], files[0][1])
    else:
        zip_outputs(ctx, files, f"{ctx.stem()}_split.zip")


# ---------------------------------------------------------------------------
@tool("rotate", multi=True, max_files=20, timeout=300)
def rotate(ctx: Ctx):
    angle = int(ctx.opt("angle", 90)) % 360
    per_page = {int(k): int(v) for k, v in (ctx.opts.get("per_page") or {}).items()}
    files = []
    for i in range(len(ctx.paths)):
        doc = pdf_of(ctx, i)
        targets = parse_pages(ctx.opt("pages", "all"), len(doc)) if angle else []
        for p in targets:
            pg = doc[p]
            pg.set_rotation((pg.rotation + angle) % 360)
        for pno, deg in per_page.items():
            if 1 <= pno <= len(doc):
                pg = doc[pno - 1]
                pg.set_rotation((pg.rotation + deg) % 360)
        dst = ctx.tmp / f"r{i}.pdf"
        save_pdf(doc, dst)
        files.append((dst, f"{Path(ctx.names[i]).stem}_rotated.pdf"))
    if len(files) == 1:
        ctx.add_output(*files[0])
    else:
        zip_outputs(ctx, files, "rotated_pdfs.zip")


# ---------------------------------------------------------------------------
PAGE_SIZES = {"a4": (595.28, 841.89), "letter": (612, 792), "legal": (612, 1008), "a3": (841.89, 1190.55),
              "a5": (419.53, 595.28)}


@tool("organize", multi=True, max_files=10, timeout=300)
def organize(ctx: Ctx):
    items = ctx.opts.get("items")
    docs = [pdf_of(ctx, i) for i in range(len(ctx.paths))]
    if not items:
        items = [{"f": 0, "p": p} for p in range(len(docs[0]))]
    if not items:
        raise ToolError("empty", "No pages left to save.")
    out = fitz.open()
    for k, it in enumerate(items):
        ctx.progress(k / len(items))
        if it.get("blank"):
            w, h = PAGE_SIZES.get(str(it.get("size", "a4")).lower(), PAGE_SIZES["a4"])
            if it.get("w") and it.get("h"):
                w, h = float(it["w"]), float(it["h"])
            out.new_page(width=w, height=h)
            continue
        f, p = int(it.get("f", 0)), int(it["p"])
        if not (0 <= f < len(docs)) or not (0 <= p < len(docs[f])):
            raise ToolError("bad_pages", "Invalid page reference.")
        out.insert_pdf(docs[f], from_page=p, to_page=p)
        r = int(it.get("r", 0)) % 360
        if r:
            pg = out[len(out) - 1]
            pg.set_rotation((pg.rotation + r) % 360)
    dst = ctx.new_path("organized.pdf")
    save_pdf(out, dst)
    ctx.data["pages"] = len(out)
    ctx.add_output(dst, f"{ctx.stem()}_organized.pdf")


# ---------------------------------------------------------------------------
@tool("crop", timeout=300)
def crop(ctx: Ctx):
    doc = pdf_of(ctx, 0)
    targets = parse_pages(ctx.opt("pages", "all"), len(doc))
    box = ctx.opts.get("box")          # relative {x0,y0,x1,y1} of the displayed page, 0..1
    m = ctx.opts.get("margins") or {}  # {top,right,bottom,left}
    unit = ctx.opt("unit", "mm")
    k = {"pt": 1.0, "mm": 72 / 25.4, "cm": 72 / 2.54, "in": 72.0}.get(unit, 1.0)
    if not box and not any(float(m.get(s, 0) or 0) for s in ("top", "right", "bottom", "left")):
        raise ToolError("nothing", "Select an area or enter margins to crop.")
    for p in targets:
        pg = doc[p]
        r = pg.rect
        if box:
            rect = fitz.Rect(r.x0 + box["x0"] * r.width, r.y0 + box["y0"] * r.height,
                             r.x0 + box["x1"] * r.width, r.y0 + box["y1"] * r.height)
        elif unit == "%":
            rect = fitz.Rect(r.x0 + r.width * float(m.get("left", 0) or 0) / 100,
                             r.y0 + r.height * float(m.get("top", 0) or 0) / 100,
                             r.x1 - r.width * float(m.get("right", 0) or 0) / 100,
                             r.y1 - r.height * float(m.get("bottom", 0) or 0) / 100)
        else:
            rect = fitz.Rect(r.x0 + float(m.get("left", 0) or 0) * k, r.y0 + float(m.get("top", 0) or 0) * k,
                             r.x1 - float(m.get("right", 0) or 0) * k, r.y1 - float(m.get("bottom", 0) or 0) * k)
        rect = rect & r
        if rect.is_empty or rect.width < 5 or rect.height < 5:
            raise ToolError("bad_box", "The crop area is empty.")
        pg.set_cropbox(rect * pg.derotation_matrix)
    dst = ctx.new_path("cropped.pdf")
    save_pdf(doc, dst)
    ctx.add_output(dst, f"{ctx.stem()}_cropped.pdf")


# ---------------------------------------------------------------------------
def _roman(n: int) -> str:
    vals = [(1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"),
            (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    s = ""
    for v, sym in vals:
        while n >= v:
            s += sym
            n -= v
    return s


def format_number(n: int, style: str) -> str:
    if style == "roman":
        return _roman(n)
    if style == "ROMAN":
        return _roman(n).upper()
    if style == "thai":
        return str(n).translate(str.maketrans("0123456789", "๐๑๒๓๔๕๖๗๘๙"))
    return str(n)


@tool("pagenumbers", timeout=300)
def pagenumbers(ctx: Ctx):
    doc = pdf_of(ctx, 0)
    total = len(doc)
    targets = set(parse_pages(ctx.opt("pages", "all"), total))
    first = int(ctx.opt("first_number", 1))
    fmt = str(ctx.opt("format", "{n}"))
    style = ctx.opt("style", "arabic")
    pos = ctx.opt("position", "bottom-center")
    size = float(ctx.opt("size", 11))
    margin = float(ctx.opt("margin", 28))
    color = to_rgb(ctx.opt("color", "#222222"))
    font = ctx.opt("font", "sans")
    bold = bool(ctx.opts.get("bold"))
    facing = bool(ctx.opts.get("facing"))
    skip_first = bool(ctx.opts.get("skip_first"))
    counter = first
    for i in range(total):
        if skip_first and i == 0:
            counter = first
            continue
        if i not in targets:
            continue
        pg = doc[i]
        upright(pg)
        r = pg.rect
        text = fmt.replace("{n}", format_number(counter, style)).replace(
            "{total}", format_number(total - (1 if skip_first else 0) + first - 1, style))
        vert, horiz = (pos.split("-") + ["center"])[:2]
        if facing and horiz != "center":
            horiz = ("right" if counter % 2 else "left") if horiz in ("left", "right") else horiz
            if pos.endswith(("left", "right")):
                horiz = "right" if counter % 2 else "left"
        x = {"left": r.x0 + margin, "center": r.x0 + r.width / 2, "right": r.x1 - margin}[horiz]
        y = r.y0 + margin + size * 0.8 if vert == "top" else r.y1 - margin
        td.draw_text(pg, text, x, y, size, color, font=font, bold=bold, anchor=horiz)
        counter += 1
        ctx.progress(i / total)
    dst = ctx.new_path("numbered.pdf")
    save_pdf(doc, dst)
    ctx.add_output(dst, f"{ctx.stem()}_numbered.pdf")


# ---------------------------------------------------------------------------
def _alpha_image(data: bytes, opacity: float, rotate: float) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        raise ToolError("bad_image", "The watermark image could not be read.")
    if opacity < 1:
        img.putalpha(img.getchannel("A").point(lambda v: int(v * opacity)))
    if rotate:
        img = img.rotate(rotate, expand=True, resample=Image.BICUBIC)
    return img


@tool("watermark", accept=("pdf", "png", "jpg", "jpeg", "webp"), multi=True, max_files=2, timeout=300)
def watermark(ctx: Ctx):
    doc = pdf_of(ctx, 0)
    kind = ctx.opt("type", "text")
    opacity = max(0.02, min(1.0, float(ctx.opt("opacity", 0.3))))
    rotation = float(ctx.opt("rotation", 45))
    layer_over = ctx.opt("layer", "over") != "under"
    pos = ctx.opt("position", "center")
    tile = pos == "tile"
    targets = set(parse_pages(ctx.opt("pages", "all"), len(doc)))
    text_img = None
    if kind == "image":
        if len(ctx.paths) < 2:
            raise ToolError("no_image", "Upload a watermark image.")
        img = _alpha_image(ctx.paths[1].read_bytes(), opacity, rotation)
        wm_png, img_w, img_h = td.png_bytes(img), img.width, img.height
    else:
        text = str(ctx.opt("text", "CONFIDENTIAL")).strip()
        if not text:
            raise ToolError("no_text", "Enter the watermark text.")
        size = float(ctx.opt("size", 48))
        color = to_rgb(ctx.opt("color", "#888888"))
        font, bold = ctx.opt("font", "sans"), bool(ctx.opts.get("bold", True))
    for i in range(len(doc)):
        if i not in targets:
            continue
        pg = doc[i]
        upright(pg)
        r = pg.rect
        places = []
        if kind == "image":
            scale = float(ctx.opt("scale", 40)) / 100
            w = r.width * scale
            h = w * img_h / img_w
            sizes = (w, h)
        else:
            tw, th = td.measure(text, size, font, bold)
            sizes = (tw, th)
        cols = {"left": 0.0, "center": 0.5, "right": 1.0}
        if tile:
            gap_x, gap_y = sizes[0] * 1.6 + 30, sizes[1] * 3 + 30
            y = r.y0 + gap_y / 2
            row = 0
            while y < r.y1 + gap_y / 2:
                x = r.x0 + gap_x / 2 - (gap_x / 2 if row % 2 else 0)
                while x < r.x1 + gap_x / 2:
                    places.append((x, y))
                    x += gap_x
                y += gap_y
                row += 1
        else:
            v, _, h_ = pos.partition("-")
            if not h_:
                v, h_ = ("middle", "center") if pos == "center" else (pos, "center")
            hx = cols.get(h_, 0.5)
            vy = {"top": 0.08, "middle": 0.5, "bottom": 0.92}.get(v, 0.5)
            mx = sizes[0] / 2 + 16
            places.append((min(max(r.x0 + r.width * hx, r.x0 + mx), r.x1 - mx), r.y0 + r.height * vy))
        for (cx, cy) in places:
            if kind == "image":
                bw, bh = w, h
                rect = fitz.Rect(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)
                pg.insert_image(rect, stream=wm_png, overlay=layer_over, keep_proportion=True)
            else:
                td.draw_text(pg, text, cx, cy, size, color, font=font, bold=bold, opacity=opacity,
                             rotate=rotation, anchor="center", baseline=False, overlay=layer_over)
        ctx.progress(i / len(doc))
    dst = ctx.new_path("watermarked.pdf")
    save_pdf(doc, dst)
    ctx.add_output(dst, f"{ctx.stem()}_watermarked.pdf")
