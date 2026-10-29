"""Edit / Sign / Redact / Forms."""
from __future__ import annotations

import base64
import math
import re

import pymupdf as fitz

from . import textdraw as td
from .base import ToolError, Ctx, parse_pages, save_pdf, to_rgb, tool
from .pages import pdf_of, upright

MAX_IMAGE_BYTES = 12 * 1024 * 1024


def _decode_data_url(src: str) -> bytes:
    m = re.match(r"data:image/(png|jpe?g|webp|gif);base64,(.+)$", src or "", re.S)
    if not m:
        raise ToolError("bad_image", "Unsupported image data.")
    raw = base64.b64decode(m.group(2))
    if len(raw) > MAX_IMAGE_BYTES:
        raise ToolError("too_big", "An inserted image is too large.")
    return raw


def _rect(o) -> fitz.Rect:
    return fitz.Rect(float(o["x"]), float(o["y"]), float(o["x"]) + float(o["w"]), float(o["y"]) + float(o["h"]))


def _arrow_head(shape_page, p1, p2, width, color, opacity):
    ang = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    L = max(8.0, width * 4.5)
    pts = [fitz.Point(*p2)]
    for d in (math.pi - 0.45, math.pi + 0.45):
        pts.append(fitz.Point(p2[0] + L * math.cos(ang + d), p2[1] + L * math.sin(ang + d)))
    shape_page.draw_polyline(pts + [pts[0]], color=color, fill=color, width=0,
                             stroke_opacity=opacity, fill_opacity=opacity, closePath=True)


@tool("edit", accept=("pdf", "png", "jpg", "jpeg", "webp"), multi=True, max_files=6, timeout=300)
def edit(ctx: Ctx):
    """Apply a list of drawing ops. Coordinates are points in the *displayed* page."""
    doc = pdf_of(ctx, 0)
    ops = ctx.opts.get("ops") or []
    if not ops:
        raise ToolError("nothing", "Nothing to apply yet. Add some text, shapes or a signature first.")
    by_page: dict[int, list] = {}
    for op in ops:
        by_page.setdefault(int(op["page"]) - 1, []).append(op)
    for pno, items in sorted(by_page.items()):
        if not 0 <= pno < len(doc):
            continue
        pg = doc[pno]
        upright(pg)
        for op in items:
            t = op.get("type")
            color = to_rgb(op.get("color", "#000000"))
            fill = to_rgb(op["fill"]) if op.get("fill") else None
            width = float(op.get("width", 2))
            opacity = max(0.0, min(1.0, float(op.get("opacity", 1))))
            if t == "text":
                size = float(op.get("size", 14))
                r = _rect(op) if "w" in op else fitz.Rect(op["x"], op["y"], pg.rect.x1 - 10, op["y"] + size * 4)
                nlines = max(1, str(op.get("text", "")).count("\n") + 1)
                r.y1 = max(r.y1, r.y0 + size * 1.6 * nlines + 4)
                if op.get("bg"):
                    pg.draw_rect(r, color=None, fill=to_rgb(op["bg"]))
                td.text_in_rect(pg, r, str(op.get("text", "")), size, color, font=op.get("font", "sans"),
                                bold=bool(op.get("bold")), italic=bool(op.get("italic")),
                                align=op.get("align", "left"), shrink=False)
            elif t in ("rect", "whiteout", "highlight"):
                r = _rect(op)
                if t == "whiteout":
                    pg.draw_rect(r, color=None, fill=(1, 1, 1))
                elif t == "highlight":
                    pg.draw_rect(r, color=None, fill=to_rgb(op.get("color", "#fff176")), fill_opacity=opacity or 0.4)
                else:
                    pg.draw_rect(r, color=color if width else None, fill=fill, width=width,
                                 stroke_opacity=opacity, fill_opacity=opacity)
            elif t == "ellipse":
                pg.draw_oval(_rect(op), color=color, fill=fill, width=width,
                             stroke_opacity=opacity, fill_opacity=opacity)
            elif t in ("line", "arrow"):
                p1, p2 = (op["x1"], op["y1"]), (op["x2"], op["y2"])
                pg.draw_line(p1, p2, color=color, width=width, stroke_opacity=opacity)
                if t == "arrow":
                    _arrow_head(pg, p1, p2, width, color, opacity)
            elif t == "ink":
                pts = [fitz.Point(x, y) for x, y in op.get("points", [])]
                if len(pts) == 1:
                    pts.append(fitz.Point(pts[0].x + 0.1, pts[0].y))
                if len(pts) >= 2:
                    pg.draw_polyline(pts, color=color, width=width, stroke_opacity=opacity,
                                     lineCap=1, lineJoin=1)
            elif t == "image":
                if "ref" in op:
                    i = int(op["ref"])
                    if not 0 < i < len(ctx.paths):
                        raise ToolError("bad_image", "Missing image upload.")
                    data = ctx.paths[i].read_bytes()
                else:
                    data = _decode_data_url(op.get("src", ""))
                pg.insert_image(_rect(op), stream=data, keep_proportion=False, rotate=0)
            else:
                continue
        ctx.progress(pno / max(1, len(doc)))
    dst = ctx.new_path("edited.pdf")
    save_pdf(doc, dst)
    ctx.add_output(dst, f"{ctx.stem()}_edited.pdf")


# ---------------------------------------------------------------------------
@tool("redact", timeout=300)
def redact(ctx: Ctx):
    doc = pdf_of(ctx, 0)
    fillc = to_rgb(ctx.opt("fill", "#000000"))
    rects = ctx.opts.get("rects") or []
    terms = [t for t in (ctx.opts.get("terms") or []) if str(t).strip()]
    use_regex = bool(ctx.opts.get("regex"))
    case = bool(ctx.opts.get("case"))
    per_page: dict[int, list[fitz.Rect]] = {}
    for r in rects:
        per_page.setdefault(int(r["page"]) - 1, []).append(fitz.Rect(r["x0"], r["y0"], r["x1"], r["y1"]))
    hits = 0
    targets = parse_pages(ctx.opt("pages", "all"), len(doc))
    for pno in targets:
        pg = doc[pno]
        for term in terms:
            found: list[fitz.Rect] = []
            if use_regex:
                try:
                    rx = re.compile(term, 0 if case else re.I)
                except re.error:
                    raise ToolError("bad_regex", f"Invalid pattern: {term}")
                text = pg.get_text("text")
                for m in {m.group(0) for m in rx.finditer(text) if m.group(0).strip()}:
                    found += pg.search_for(m)
            else:
                found = pg.search_for(term)
                if not case:
                    pass  # MuPDF search is case-insensitive already
                elif found:
                    found = [r for r in found if term in pg.get_textbox(r + (-1, -1, 1, 1))]
            per_page.setdefault(pno, []).extend(found)
    if not any(per_page.values()):
        raise ToolError("nothing", "Nothing to redact: draw boxes or enter text to find.")
    for pno, rs in per_page.items():
        if not 0 <= pno < len(doc):
            continue
        pg = doc[pno]
        if pg.rotation:
            upright(pg)
        for r in rs:
            pg.add_redact_annot(r, fill=fillc)
            hits += 1
        pg.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS, graphics=fitz.PDF_REDACT_LINE_ART_NONE)
    if ctx.opts.get("sanitize", True):
        try:
            doc.scrub(metadata=True, xml_metadata=True, thumbnails=True, javascript=True,
                      attached_files=True, embedded_files=True, hidden_text=False, redactions=True,
                      remove_links=False, reset_fields=False, reset_responses=True, clean_pages=True)
        except Exception:
            doc.set_metadata({})
    # Verify text terms are really gone from the text layer.
    leaked = 0
    for pno in targets:
        txt = doc[pno].get_text("text")
        for term in terms:
            if not use_regex and (term in txt if case else term.lower() in txt.lower()):
                leaked += 1
    ctx.data.update(redactions=hits, leaked=leaked)
    dst = ctx.new_path("redacted.pdf")
    save_pdf(doc, dst, garbage=4)
    ctx.add_output(dst, f"{ctx.stem()}_redacted.pdf")


# ---------------------------------------------------------------------------
_TYPES = {
    "text": fitz.PDF_WIDGET_TYPE_TEXT, "checkbox": fitz.PDF_WIDGET_TYPE_CHECKBOX,
    "radio": fitz.PDF_WIDGET_TYPE_RADIOBUTTON, "combo": fitz.PDF_WIDGET_TYPE_COMBOBOX,
    "list": fitz.PDF_WIDGET_TYPE_LISTBOX, "signature": fitz.PDF_WIDGET_TYPE_SIGNATURE,
}


@tool("forms", timeout=300)
def forms(ctx: Ctx):
    doc = pdf_of(ctx, 0)
    action = ctx.opt("action", "detect")
    if action == "detect":
        fields = []
        for pg in doc:
            for w in pg.widgets():
                fields.append(dict(
                    page=pg.number + 1, name=w.field_name, type=w.field_type_string,
                    value=w.field_value if not isinstance(w.field_value, bytes) else "",
                    rect=[round(v, 2) for v in (w.rect * pg.rotation_matrix)],
                    choices=list(w.choice_values or []), multiline=bool(w.field_flags & 4096),
                    readonly=bool(w.field_flags & 1), on_state=_on_state(w),
                ))
        ctx.data["fields"] = fields
        ctx.data["pages"] = len(doc)
        return
    values = ctx.opts.get("values") or {}
    created = 0
    for spec in ctx.opts.get("create") or []:
        pg = doc[int(spec["page"]) - 1]
        upright(pg)
        w = fitz.Widget()
        w.field_type = _TYPES.get(spec.get("type", "text"), fitz.PDF_WIDGET_TYPE_TEXT)
        w.field_name = str(spec["name"])[:120]
        w.rect = fitz.Rect(spec["x0"], spec["y0"], spec["x1"], spec["y1"])
        w.text_fontsize = float(spec.get("size", 11))
        w.border_color = (0.15, 0.25, 0.6)
        w.border_width = 0.8
        w.fill_color = (0.93, 0.96, 1.0)
        w.text_color = (0, 0, 0)
        if spec.get("type") in ("combo", "list"):
            w.choice_values = [str(c) for c in spec.get("choices", [])] or ["Option 1"]
        if spec.get("required"):
            w.field_flags = (w.field_flags or 0) | 2
        if spec.get("value") not in (None, ""):
            w.field_value = spec["value"]
        pg.add_widget(w)
        created += 1
    filled = 0
    if values:
        for pg in doc:
            for w in pg.widgets():
                if w.field_name in values:
                    v = values[w.field_name]
                    if w.field_type in (fitz.PDF_WIDGET_TYPE_CHECKBOX, fitz.PDF_WIDGET_TYPE_RADIOBUTTON):
                        w.field_value = _on_state(w) if v in (True, "true", "on", "Yes", "yes", 1) else "Off"
                    else:
                        w.field_value = str(v)
                    w.update()
                    filled += 1
    if ctx.opts.get("flatten"):
        try:
            doc.bake(annots=False, widgets=True)
        except Exception:
            raise ToolError("flatten_failed", "Could not flatten the form fields.")
    ctx.data.update(created=created, filled=filled)
    dst = ctx.new_path("form.pdf")
    save_pdf(doc, dst)
    ctx.add_output(dst, f"{ctx.stem()}_form.pdf")


def _on_state(w):
    try:
        st = w.on_state()
        return st if st else "Yes"
    except Exception:
        return "Yes"
