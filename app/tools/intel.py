"""PDF intelligence: compare, summarize, translate."""
from __future__ import annotations

import difflib
import math
import re
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageFilter

from . import llm, textdraw as td
from .base import Ctx, ToolError, open_pdf, parse_pages, save_pdf, tool
from .pages import pdf_of, upright


# ---------------------------------------------------------------------------
def _words(page):
    return [w[4] for w in page.get_text("words", sort=True)]


@tool("compare", multi=True, min_files=2, max_files=2, timeout=600)
def compare(ctx: Ctx):
    a, b = pdf_of(ctx, 0), pdf_of(ctx, 1)
    n = max(len(a), len(b))
    if n > 120:
        raise ToolError("too_many", "Compare is limited to 120 pages.")
    pages = []
    changed = 0
    for i in range(n):
        ctx.progress(i / n, f"{i + 1}/{n}")
        info = {"page": i + 1, "in_a": i < len(a), "in_b": i < len(b), "text": [], "visual": 0.0, "image": None}
        if i < len(a) and i < len(b):
            wa, wb = _words(a[i]), _words(b[i])
            sm = difflib.SequenceMatcher(None, wa, wb, autojunk=False)
            segs = []
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == "equal":
                    if i2 - i1 > 14:  # collapse long unchanged runs
                        segs.append(["eq", " ".join(wa[i1:i1 + 6]) + " … " + " ".join(wa[i2 - 6:i2])])
                    else:
                        segs.append(["eq", " ".join(wa[i1:i2])])
                else:
                    if i2 > i1:
                        segs.append(["del", " ".join(wa[i1:i2])])
                    if j2 > j1:
                        segs.append(["add", " ".join(wb[j1:j2])])
            info["text"] = segs
            info["text_changed"] = any(s[0] != "eq" for s in segs)
            # visual diff at 80dpi
            k = fitz.Matrix(80 / 72, 80 / 72)
            pa, pb = a[i].get_pixmap(matrix=k, alpha=False), b[i].get_pixmap(matrix=k, alpha=False)
            ia = Image.frombytes("RGB", (pa.width, pa.height), pa.samples)
            ib = Image.frombytes("RGB", (pb.width, pb.height), pb.samples)
            if ia.size != ib.size:
                ib = ib.resize(ia.size)
            diff = ImageChops.difference(ia, ib).convert("L").point(lambda v: 255 if v > 28 else 0)
            diff = diff.filter(ImageFilter.MaxFilter(5))
            hist = diff.histogram()
            ratio = hist[255] / max(1, diff.width * diff.height)
            info["visual"] = round(ratio * 100, 2)
            if ratio > 0.0005:
                # red overlay on page B
                over = Image.new("RGBA", ia.size, (255, 0, 0, 0))
                over.putalpha(diff.point(lambda v: 110 if v else 0))
                red = Image.new("RGBA", ia.size, (255, 40, 40, 255))
                base = ib.convert("RGBA")
                base.paste(red, mask=over.getchannel("A"))
                p = ctx.tmp / f"diff_{i + 1}.png"
                base.convert("RGB").save(p, "PNG", optimize=True)
                ctx.add_output(p, f"diff_page_{i + 1}.png", role="aux")
                info["image"] = len(ctx.outputs) - 1
            info["changed"] = bool(info["text_changed"] or info["image"] is not None)
        else:
            info["changed"] = True
        changed += 1 if info["changed"] else 0
        pages.append(info)
    ctx.data.update(pages=pages, changed_pages=changed, total_a=len(a), total_b=len(b))


# ---------------------------------------------------------------------------
_STOP = set("""a an the and or but if then else for of to in on at by with from as is are was were be been being it its this that
these those i you he she we they them his her our your their not no do does did have has had will would can could should may might
so than too very just also into over under about after before up down out more most some such only own same which who whom what
when where why how all any both each few other""".split())


def _extractive(text: str, n: int) -> list[str]:
    sents = [s.strip() for s in re.split(r"(?<=[.!?。！？])\s+|\n{2,}|\n(?=[•\-*\d])", text) if len(s.strip()) > 25]
    if len(sents) <= n:
        return sents
    freq: dict[str, int] = {}
    for w in re.findall(r"\w+", text.lower()):
        if w not in _STOP and len(w) > 2:
            freq[w] = freq.get(w, 0) + 1
    scored = []
    for idx, s in enumerate(sents):
        ws = [w for w in re.findall(r"\w+", s.lower()) if w not in _STOP and len(w) > 2]
        if not ws:
            continue
        score = sum(freq.get(w, 0) for w in ws) / math.sqrt(len(ws) + 5)
        score *= 1.3 if idx < 3 else 1.0
        scored.append((score, idx, s))
    top = sorted(sorted(scored, reverse=True)[:n], key=lambda t: t[1])
    return [s for _, _, s in top]


def _read_any_text(ctx: Ctx) -> str:
    if ctx.opts.get("text"):
        return str(ctx.opts["text"])
    if not ctx.paths:
        raise ToolError("nothing", "Paste some text or upload a file.")
    p, parts = ctx.paths[0], []
    ext = p.suffix.lower()
    if ext == ".pdf":
        d = pdf_of(ctx, 0)
        pages = parse_pages(ctx.opt("pages", "all"), len(d))
        parts = [d[i].get_text("text", sort=True) for i in pages]
    elif ext in (".txt", ".md", ".csv"):
        parts = [p.read_text("utf-8", "replace")]
    elif ext == ".docx":
        import docx
        parts = [para.text for para in docx.Document(str(p)).paragraphs]
    else:
        raise ToolError("bad_type", "Unsupported file type.")
    return "\n".join(parts)


@tool("summarize", accept=("pdf", "docx", "txt", "md"), min_files=0, timeout=600, mem_gb=None)
def summarize(ctx: Ctx):
    text = re.sub(r"[ \t]+", " ", _read_any_text(ctx)).strip()
    if len(text) < 80:
        raise ToolError("too_short", "There is not enough text to summarize.")
    length = ctx.opt("length", "medium")
    style = ctx.opt("style", "bullets")
    lang = ctx.opt("language", "auto")
    ctx.data["chars_in"] = len(text)
    if llm.configured(ctx.ai):
        target = {"short": "3-4 bullet points or 2-3 sentences", "medium": "6-8 bullet points or 2 short paragraphs",
                  "long": "10-14 bullet points or 4 paragraphs"}.get(length, "")
        fmt = "Use markdown bullet points." if style == "bullets" else "Write flowing paragraphs."
        lang_rule = ("Write the summary in the same language as the source text." if lang == "auto"
                     else f"Write the summary in {lang}.")
        system = ("You summarize documents faithfully. Do not invent facts. "
                  f"Length: {target}. {fmt} {lang_rule} Output only the summary.")
        chunks = [text[i:i + 14000] for i in range(0, min(len(text), 280000), 14000)]
        partial = []
        for k, ch in enumerate(chunks):
            ctx.progress(k / (len(chunks) + 1), f"{k + 1}/{len(chunks)}")
            partial.append(llm.chat(ctx.ai, system if len(chunks) == 1 else
                                    "Summarize this part of a longer document in concise bullet points. "
                                    + lang_rule, ch, max_tokens=1200))
        summary = partial[0] if len(partial) == 1 else llm.chat(
            ctx.ai, system, "Combine these partial summaries into one coherent summary:\n\n" + "\n\n".join(partial))
        ctx.data.update(summary=summary, mode="ai")
    else:
        n = {"short": 3, "medium": 6, "long": 10}.get(length, 6)
        sents = _extractive(text, n)
        if not sents:
            raise ToolError("no_summary", "Could not extract key sentences. Configure AI for better results.")
        summary = "\n".join(("- " + s) for s in sents) if style == "bullets" else " ".join(sents)
        ctx.data.update(summary=summary, mode="extractive")


# ---------------------------------------------------------------------------
@tool("translate", timeout=1800, mem_gb=None)
def translate(ctx: Ctx):
    if not llm.configured(ctx.ai):
        raise ToolError("ai_unavailable", "Translation needs an AI service, which is not configured on this server.")
    target = str(ctx.opt("target", "English"))[:40]
    doc = pdf_of(ctx, 0)
    pages = parse_pages(ctx.opt("pages", "all"), len(doc))
    if len(pages) > 60:
        raise ToolError("too_many", "Translation is limited to 60 pages at a time.")
    if not any(len(doc[p].get_text("text").strip()) > 10 for p in pages):
        raise ToolError("scanned", "No text layer found. Run OCR first, then translate.")
    system = (f"You are a professional translator. Translate every string in the JSON array into {target}. "
              "Keep numbers, URLs, names and formatting markers. Return ONLY a JSON array of the same length, "
              "same order, strings only.")
    total_chars = 0
    for n, p in enumerate(pages):
        ctx.progress(n / len(pages), f"{n + 1}/{len(pages)}")
        pg = doc[p]
        upright(pg)
        blocks = []
        for b in pg.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            lines = ["".join(s["text"] for s in l["spans"]).strip() for l in b["lines"]]
            text = " ".join(l for l in lines if l)
            spans = [s for l in b["lines"] for s in l["spans"] if s["text"].strip()]
            if len(text) < 2 or not spans:
                continue
            blocks.append((fitz.Rect(b["bbox"]), text, spans[0]))
        if not blocks:
            continue
        total_chars += sum(len(t) for _, t, _ in blocks)
        if total_chars > 250000:
            raise ToolError("too_big", "That document is too large to translate in one go.")
        translated: list[str] = []
        for i in range(0, len(blocks), 40):
            part = [t for _, t, _ in blocks[i:i + 40]]
            translated += llm.chat_json_list(ctx.ai, system, part, max_tokens=4096)
        for (rect, _, sp), new in zip(blocks, translated):
            pg.add_redact_annot(rect, fill=False)
        pg.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE)
        for (rect, _, sp), new in zip(blocks, translated):
            c = sp["color"]
            color = (((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255)
            mono = bool(sp["flags"] & 8)
            serif = bool(sp["flags"] & 4)
            td.text_in_rect(pg, rect + (-1, -1, 1, 1), new, max(5.0, sp["size"] * 0.95), color,
                            font="mono" if mono else ("serif" if serif else "sans"),
                            bold=bool(sp["flags"] & 16), italic=bool(sp["flags"] & 2), shrink=True)
    dst = ctx.new_path("translated.pdf")
    save_pdf(doc, dst)
    ctx.add_output(dst, f"{ctx.stem()}_{re.sub(r'[^A-Za-z]+', '', target)[:12] or 'translated'}.pdf")
