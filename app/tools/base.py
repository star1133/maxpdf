"""Shared plumbing for tool implementations (runs inside the worker process)."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .. import config

REGISTRY: dict[str, dict] = {}


class ToolError(Exception):
    """User-facing failure. `code` is machine readable, `message` is shown."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def tool(tool_id: str, *, accept=("pdf",), multi=False, min_files=1, max_files=1,
         timeout=300, mem_gb: float | None = 4, max_mb=None, no_files=False):
    """Register a tool. `accept` is a tuple of lowercase extensions (no dot)."""

    def deco(fn):
        REGISTRY[tool_id] = dict(
            id=tool_id, fn=fn, accept=tuple(accept), multi=multi or max_files > 1,
            min_files=0 if no_files else min_files,
            max_files=0 if no_files else (max_files if max_files > 1 else (50 if multi else 1)),
            timeout=timeout, mem_gb=mem_gb, max_mb=max_mb, no_files=no_files,
        )
        return fn

    return deco


@dataclass
class Ctx:
    job_dir: Path
    inputs: list[dict]
    opts: dict
    ai: dict = field(default_factory=dict)
    outputs: list[dict] = field(default_factory=list)
    data: dict = field(default_factory=dict)
    message: str = ""

    def __post_init__(self):
        self.in_dir = self.job_dir / "in"
        self.out_dir = self.job_dir / "out"
        self.tmp = self.job_dir / "tmp"
        for d in (self.out_dir, self.tmp):
            d.mkdir(parents=True, exist_ok=True)

    # -- inputs ------------------------------------------------------------
    @property
    def paths(self) -> list[Path]:
        return [Path(i["path"]) for i in self.inputs]

    @property
    def names(self) -> list[str]:
        return [i["name"] for i in self.inputs]

    def stem(self, i=0) -> str:
        return safe_stem(Path(self.inputs[i]["name"]).stem) if self.inputs else "document"

    def opt(self, key, default=None):
        v = self.opts.get(key, default)
        return default if v is None or v == "" else v

    # -- outputs -----------------------------------------------------------
    def add_output(self, path: Path, name: str, mime: str | None = None, role="main", **extra):
        path = Path(path)
        if path.parent != self.out_dir:
            dst = self.out_dir / f"{len(self.outputs):03d}_{path.name}"
            shutil.move(str(path), dst)
            path = dst
        self.outputs.append(dict(path=str(path), name=name, role=role,
                                 mime=mime or guess_mime(name), size=path.stat().st_size, **extra))

    def new_path(self, name: str) -> Path:
        return self.out_dir / f"{len(self.outputs):03d}_{safe_stem(Path(name).stem)}{Path(name).suffix}"

    # -- progress ----------------------------------------------------------
    def progress(self, p: float, msg: str = ""):
        try:
            tmp = self.job_dir / "progress.json.tmp"
            tmp.write_text(json.dumps({"p": max(0.0, min(1.0, p)), "msg": msg}))
            os.replace(tmp, self.job_dir / "progress.json")
        except OSError:
            pass


def safe_stem(s: str) -> str:
    s = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "_", s).strip(" .")
    return (s or "file")[:80]


_MIMES = {
    "pdf": "application/pdf", "zip": "application/zip", "txt": "text/plain; charset=utf-8",
    "md": "text/markdown; charset=utf-8", "json": "application/json", "png": "image/png",
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "html": "text/html; charset=utf-8", "csv": "text/csv; charset=utf-8",
}


def guess_mime(name: str) -> str:
    return _MIMES.get(Path(name).suffix.lower().lstrip("."), "application/octet-stream")


# -- page range parsing -------------------------------------------------------
def parse_pages(spec, total: int, *, allow_empty=False) -> list[int]:
    """'1-3,5,8-' -> zero-based indices (order kept, duplicates allowed)."""
    if spec is None or str(spec).strip() == "" or str(spec).strip().lower() == "all":
        return list(range(total))
    out: list[int] = []
    for part in re.split(r"[,\s;]+", str(spec).strip()):
        if not part:
            continue
        m = re.fullmatch(r"(\d*)\s*-\s*(\d*)", part)
        if m:
            a = int(m.group(1)) if m.group(1) else 1
            b = int(m.group(2)) if m.group(2) else total
            if a > b:
                a, b = b, a
            out.extend(range(max(a, 1) - 1, min(b, total)))
        elif part.isdigit():
            n = int(part)
            if 1 <= n <= total:
                out.append(n - 1)
        else:
            raise ToolError("bad_pages", f"Invalid page range: {part}")
    if not out and not allow_empty:
        raise ToolError("bad_pages", "The page selection is empty or out of range.")
    return out


def to_rgb(color, default=(0, 0, 0)):
    """'#rrggbb' / '#rgb' -> (r,g,b) floats 0..1"""
    if isinstance(color, (list, tuple)) and len(color) >= 3:
        return tuple(float(c) for c in color[:3])
    if isinstance(color, str):
        c = color.strip().lstrip("#")
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        if re.fullmatch(r"[0-9a-fA-F]{6}", c):
            return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return default


# -- subprocess helper --------------------------------------------------------
def run_cmd(cmd: list[str], *, timeout=300, env_extra: dict | None = None, cwd=None, check=True):
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    try:
        cp = subprocess.run(cmd, capture_output=True, timeout=timeout, env=env, cwd=cwd,
                            start_new_session=True)
    except subprocess.TimeoutExpired:
        raise ToolError("timeout", "The operation took too long and was cancelled.")
    if check and cp.returncode != 0:
        tail = (cp.stderr or cp.stdout or b"").decode("utf-8", "replace").strip()[-400:]
        raise ToolError("tool_failed", f"{Path(cmd[0]).name} failed: {tail}")
    return cp


def open_pdf(path: Path, password: str | None = None):
    """Open with PyMuPDF; raise friendly errors for encrypted/corrupt files."""
    import pymupdf as fitz

    try:
        doc = fitz.open(str(path))
    except Exception:
        raise ToolError("bad_pdf", "This file is not a valid PDF (or it is damaged). Try the Repair tool.")
    if doc.needs_pass:
        if not password or not doc.authenticate(password):
            doc.close()
            raise ToolError("password_required" if not password else "wrong_password",
                            "This PDF is password protected." if not password else "Wrong password.")
    return doc


def save_pdf(doc, path: Path, **kw):
    kw.setdefault("garbage", 3)
    kw.setdefault("deflate", True)
    doc.save(str(path), **kw)


def zip_outputs(ctx: Ctx, files: list[tuple[Path, str]], zip_name: str):
    import zipfile

    zp = ctx.new_path(zip_name)
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        used = set()
        for p, arc in files:
            base, n = arc, 1
            while arc in used:
                n += 1
                arc = f"{Path(base).stem}_{n}{Path(base).suffix}"
            used.add(arc)
            z.write(p, arc)
    ctx.add_output(zp, zip_name, "application/zip")
