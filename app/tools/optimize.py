"""Compress, repair, PDF/A, OCR, protect, unlock, metadata."""
from __future__ import annotations

import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

import pikepdf
import pymupdf as fitz

from .. import config
from .base import Ctx, ToolError, open_pdf, parse_pages, run_cmd, save_pdf, tool, zip_outputs
from .pages import pdf_of


def _fmt_bytes(n: int) -> str:
    return f"{n / 1024:.0f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.1f} MB"


def _decrypted(ctx: Ctx, i: int) -> Path:
    """Return a path to an unencrypted copy of input i (or the input itself)."""
    doc = pdf_of(ctx, i)
    if doc.is_encrypted:
        dst = ctx.tmp / f"dec{i}.pdf"
        doc.save(str(dst), encryption=fitz.PDF_ENCRYPT_NONE)
        return dst
    return ctx.paths[i]


# ---------------------------------------------------------------------------
LEVELS = {  # name -> (gs preset, image dpi, jpeg quality)
    "extreme": ("/screen", 72, 55),
    "recommended": ("/ebook", 130, 72),
    "low": ("/printer", 220, 85),
}


def gs_compress(src: Path, dst: Path, level: str, gray=False, timeout=600):
    preset, dpi, q = LEVELS.get(level, LEVELS["recommended"])
    cmd = ["gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6",
           f"-dPDFSETTINGS={preset}", "-dDetectDuplicateImages=true", "-dCompressFonts=true",
           "-dSubsetFonts=true", "-dAutoRotatePages=/None", "-dDownsampleColorImages=true",
           "-dDownsampleGrayImages=true", "-dDownsampleMonoImages=true",
           "-dColorImageDownsampleType=/Bicubic", "-dGrayImageDownsampleType=/Bicubic",
           f"-dColorImageResolution={dpi}", f"-dGrayImageResolution={dpi}",
           f"-dMonoImageResolution={max(dpi * 2, 150)}", "-dColorImageDownsampleThreshold=1.1",
           "-dGrayImageDownsampleThreshold=1.1", "-dJPEGQ=" + str(q)]
    if gray:
        cmd += ["-sColorConversionStrategy=Gray", "-dProcessColorModel=/DeviceGray"]
    cmd += [f"-sOutputFile={dst}", str(src)]
    run_cmd(cmd, timeout=timeout)


def lossless_optimize(src: Path, dst: Path):
    with pikepdf.open(src) as pdf:
        pdf.remove_unreferenced_resources()
        pdf.save(dst, compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate,
                 recompress_flate=True)


@tool("compress", multi=True, max_files=20, timeout=900, mem_gb=None)
def compress(ctx: Ctx):
    level = ctx.opt("level", "recommended")
    gray = bool(ctx.opts.get("grayscale"))
    files, report = [], []
    for i in range(len(ctx.paths)):
        ctx.progress(i / len(ctx.paths), ctx.names[i])
        src = _decrypted(ctx, i)
        orig = ctx.paths[i].stat().st_size
        best, how = None, ""
        cands = []
        a = ctx.tmp / f"c{i}_gs.pdf"
        if level != "lossless":
            try:
                gs_compress(src, a, level, gray)
                cands.append((a, "gs"))
            except ToolError:
                pass
        b = ctx.tmp / f"c{i}_ll.pdf"
        try:
            lossless_optimize(src, b)
            cands.append((b, "lossless"))
        except Exception:
            pass
        cands = [(p, h) for p, h in cands if p.exists() and p.stat().st_size > 0]
        if cands:
            best, how = min(cands, key=lambda c: c[0].stat().st_size)
        if best is None or best.stat().st_size >= orig:
            best, how = ctx.paths[i], "unchanged"
        new = best.stat().st_size
        report.append(dict(name=ctx.names[i], before=orig, after=new, method=how,
                           saved_pct=round(100 * (1 - new / orig), 1) if orig else 0))
        files.append((best, f"{Path(ctx.names[i]).stem}_compressed.pdf"))
    ctx.data["report"] = report
    if len(files) == 1:
        _copy_out(ctx, *files[0])
    else:
        zip_outputs(ctx, files, "compressed_pdfs.zip")


def _copy_out(ctx: Ctx, src: Path, name: str):
    dst = ctx.new_path(name)
    shutil.copyfile(src, dst)
    ctx.add_output(dst, name)


# ---------------------------------------------------------------------------
@tool("repair", timeout=600, mem_gb=None)
def repair(ctx: Ctx):
    src = ctx.paths[0]
    dst = ctx.new_path("repaired.pdf")
    method = None

    def ok(p: Path) -> bool:
        try:
            d = fitz.open(str(p))
            if len(d) < 1:
                return False
            d[0].get_pixmap(dpi=30)
            return True
        except Exception:
            return False

    # 1) qpdf-style recovery via pikepdf
    try:
        with pikepdf.open(src, attempt_recovery=True, password=ctx.opts.get("password") or "") as pdf:
            pdf.save(dst)
        if ok(dst):
            method = "structure-rebuild"
    except Exception:
        pass
    # 2) MuPDF repair + clean
    if not method:
        try:
            d = fitz.open(str(src))
            if d.needs_pass:
                raise ToolError("password_required", "This PDF is password protected.")
            d.save(str(dst), garbage=4, clean=True, deflate=True)
            if ok(dst):
                method = "mupdf"
        except ToolError:
            raise
        except Exception:
            pass
    # 3) Ghostscript re-render of the page tree
    if not method:
        try:
            run_cmd(["gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=pdfwrite",
                     f"-sOutputFile={dst}", str(src)], timeout=300)
            if ok(dst):
                method = "ghostscript"
        except ToolError:
            pass
    if not method:
        raise ToolError("unrecoverable", "This PDF is too damaged to repair.")
    d = fitz.open(str(dst))
    ctx.data.update(method=method, pages=len(d))
    ctx.add_output(dst, f"{ctx.stem()}_repaired.pdf")


# ---------------------------------------------------------------------------
PDFA_PS = """%!
/ICCProfile ({icc}) def
[/_objdef {{icc_PDFA}} /type /stream /OBJ pdfmark
[{{icc_PDFA}} <</N 3>> /PUT pdfmark
[{{icc_PDFA}} ICCProfile (r) file /PUT pdfmark
[/_objdef {{OutputIntent_PDFA}} /type /dict /OBJ pdfmark
[{{OutputIntent_PDFA}} <<
  /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {{icc_PDFA}}
  /OutputConditionIdentifier (sRGB) /Info (sRGB) /RegistryName (http://www.color.org)
>> /PUT pdfmark
[{{Catalog}} <</OutputIntents [ {{OutputIntent_PDFA}} ]>> /PUT pdfmark
"""


def _find_icc() -> str:
    for p in ("/usr/share/color/icc/ghostscript/default_rgb.icc", "/usr/share/ghostscript/9.55.0/iccprofiles/default_rgb.icc"):
        if os.path.exists(p):
            return p
    raise ToolError("unavailable", "Colour profile for PDF/A is missing on this server.")


@tool("pdfa", multi=True, max_files=10, timeout=900, mem_gb=None)
def pdfa(ctx: Ctx):
    part = {"1b": 1, "2b": 2, "3b": 3}.get(str(ctx.opt("level", "2b")), 2)
    icc = _find_icc()
    ps = ctx.tmp / "PDFA_def.ps"
    ps.write_text(PDFA_PS.format(icc=icc))
    files, notes = [], []
    for i in range(len(ctx.paths)):
        src = _decrypted(ctx, i)
        dst = ctx.tmp / f"a{i}.pdf"
        run_cmd(["gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", f"--permit-file-read={icc}",
                 f"--permit-file-read={ps}", f"-dPDFA={part}", "-dPDFACompatibilityPolicy=1",
                 "-sColorConversionStrategy=RGB", "-sDEVICE=pdfwrite", f"-sOutputFile={dst}",
                 str(ps), str(src)], timeout=600)
        d = fitz.open(str(dst))
        xmp = d.get_xml_metadata() or ""
        notes.append(dict(name=ctx.names[i], declared_pdfa=("pdfaid" in xmp), part=part))
        files.append((dst, f"{Path(ctx.names[i]).stem}_pdfa.pdf"))
    ctx.data["results"] = notes
    if len(files) == 1:
        _copy_out(ctx, *files[0])
    else:
        zip_outputs(ctx, files, "pdfa_files.zip")


# ---------------------------------------------------------------------------
def ocr_env() -> dict:
    t = config.TESS_DIR
    return {
        "PATH": f"{t / 'bin'}:{Path(sys.executable).parent}:" + os.environ.get("PATH", ""),
        "LD_LIBRARY_PATH": str(t / "lib" / "x86_64-linux-gnu"),
        "TESSDATA_PREFIX": str(t / "share" / "tesseract-ocr" / "4.00" / "tessdata"),
        "OMP_THREAD_LIMIT": "1",
    }


def available_langs() -> list[str]:
    d = config.TESS_DIR / "share" / "tesseract-ocr" / "4.00" / "tessdata"
    return sorted(p.stem for p in d.glob("*.traineddata") if p.stem != "osd") if d.exists() else []


def ocr_file(ctx: Ctx, src: Path, dst: Path, langs="eng", mode="skip", deskew=False, rotate=False, sidecar=None):
    avail = available_langs()
    wanted = [l for l in str(langs).split("+") if l]
    if not avail:
        raise ToolError("unavailable", "OCR engine is not installed on this server.")
    bad = [l for l in wanted if l not in avail]
    if bad:
        raise ToolError("bad_lang", f"Language not installed: {', '.join(bad)}")
    d = fitz.open(str(src))
    if len(d) > 150:
        raise ToolError("too_many", "OCR is limited to 150 pages per file.")
    d.close()
    cmd = [sys.executable, "-m", "ocrmypdf", "-l", "+".join(wanted), "--output-type", "pdf", "--jobs", "2",
           "--optimize", "0", "--tesseract-timeout", "120", "-q"]
    cmd.append({"force": "--force-ocr", "redo": "--redo-ocr"}.get(mode, "--skip-text"))
    if deskew:
        cmd.append("--deskew")
    if rotate:
        cmd.append("--rotate-pages")
    if sidecar:
        cmd += ["--sidecar", str(sidecar)]
    cmd += [str(src), str(dst)]
    cp = run_cmd(cmd, timeout=1500, env_extra=ocr_env(), check=False)
    if cp.returncode not in (0, 6) or not dst.exists():  # 6 = already has text
        msg = (cp.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        raise ToolError("ocr_failed", "OCR failed: " + (msg[-1] if msg else "unknown error")[:200])
    if cp.returncode == 6 and not dst.exists():
        shutil.copyfile(src, dst)


@tool("ocr", multi=True, max_files=5, timeout=1800, mem_gb=None)
def ocr(ctx: Ctx):
    files = []
    side = bool(ctx.opts.get("text"))
    for i in range(len(ctx.paths)):
        ctx.progress(i / len(ctx.paths), ctx.names[i])
        src = _decrypted(ctx, i)
        dst = ctx.tmp / f"ocr{i}.pdf"
        sc = ctx.tmp / f"ocr{i}.txt" if side else None
        ocr_file(ctx, src, dst, ctx.opt("langs", "eng"), ctx.opt("mode", "skip"),
                 bool(ctx.opts.get("deskew")), bool(ctx.opts.get("rotate")), sc)
        files.append((dst, f"{Path(ctx.names[i]).stem}_ocr.pdf"))
        if sc and sc.exists():
            files.append((sc, f"{Path(ctx.names[i]).stem}_ocr.txt"))
    if len(files) == 1:
        _copy_out(ctx, *files[0])
    else:
        zip_outputs(ctx, files, "ocr_results.zip")


# ---------------------------------------------------------------------------
@tool("protect", multi=True, max_files=20, timeout=300)
def protect(ctx: Ctx):
    upw = str(ctx.opt("new_password", ""))
    if len(upw) < 1:
        raise ToolError("no_password", "Enter a password.")
    opw = str(ctx.opt("owner_password", "")) or secrets.token_urlsafe(18)
    strong = ctx.opt("encryption", "aes256") == "aes256"
    allow = pikepdf.Permissions(
        print_lowres=bool(ctx.opts.get("allow_print", True)), print_highres=bool(ctx.opts.get("allow_print", True)),
        extract=bool(ctx.opts.get("allow_copy", False)), modify_other=bool(ctx.opts.get("allow_edit", False)),
        modify_annotation=bool(ctx.opts.get("allow_edit", False)), modify_form=bool(ctx.opts.get("allow_edit", False)),
        modify_assembly=bool(ctx.opts.get("allow_edit", False)), accessibility=True)
    files = []
    for i in range(len(ctx.paths)):
        pw = (ctx.opts.get("passwords") or {}).get(str(i)) or ctx.opts.get("password") or ""
        try:
            pdf = pikepdf.open(ctx.paths[i], password=pw)
        except pikepdf.PasswordError:
            raise ToolError("password_required", f"{ctx.names[i]} is already password protected. Unlock it first.")
        except Exception:
            raise ToolError("bad_pdf", f"{ctx.names[i]} is not a valid PDF.")
        dst = ctx.tmp / f"p{i}.pdf"
        pdf.save(dst, encryption=pikepdf.Encryption(user=upw, owner=opw, R=6 if strong else 4, allow=allow))
        files.append((dst, f"{Path(ctx.names[i]).stem}_protected.pdf"))
    if len(files) == 1:
        _copy_out(ctx, *files[0])
    else:
        zip_outputs(ctx, files, "protected_pdfs.zip")


@tool("unlock", multi=True, max_files=20, timeout=300)
def unlock(ctx: Ctx):
    files = []
    for i in range(len(ctx.paths)):
        pw = (ctx.opts.get("passwords") or {}).get(str(i)) or ctx.opts.get("password") or ""
        try:
            pdf = pikepdf.open(ctx.paths[i], password=pw)
        except pikepdf.PasswordError:
            raise ToolError("wrong_password" if pw else "password_required",
                            "Wrong password." if pw else "This PDF needs its password to be opened.")
        except Exception:
            raise ToolError("bad_pdf", f"{ctx.names[i]} is not a valid PDF.")
        dst = ctx.tmp / f"u{i}.pdf"
        pdf.save(dst, encryption=False)
        files.append((dst, f"{Path(ctx.names[i]).stem}_unlocked.pdf"))
    if len(files) == 1:
        _copy_out(ctx, *files[0])
    else:
        zip_outputs(ctx, files, "unlocked_pdfs.zip")


# ---------------------------------------------------------------------------
@tool("metadata", timeout=120)
def metadata(ctx: Ctx):
    doc = pdf_of(ctx, 0)
    if ctx.opt("action", "read") == "read":
        ctx.data["metadata"] = {k: v for k, v in (doc.metadata or {}).items() if v}
        ctx.data["pages"] = len(doc)
        return
    if ctx.opts.get("clear"):
        doc.set_metadata({})
        doc.del_xml_metadata()
    else:
        m = doc.metadata or {}
        for k in ("title", "author", "subject", "keywords", "creator", "producer"):
            if k in (ctx.opts.get("fields") or {}):
                m[k] = str(ctx.opts["fields"][k])[:500]
        doc.set_metadata(m)
    dst = ctx.new_path("meta.pdf")
    save_pdf(doc, dst)
    ctx.add_output(dst, f"{ctx.stem()}_meta.pdf")
