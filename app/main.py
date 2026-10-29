from __future__ import annotations

import asyncio
import json
import re
import shutil
import threading
import time
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import config
from .i18n import tr
from .jobs import Manager, Rejected
from .tools import REGISTRY
from .tools.base import safe_stem
from .tools.convert import ensure_lo_profile_template
from .tools.optimize import available_langs

manager: Manager

CSP = ("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; "
       "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data:; frame-src 'self' blob:; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global manager
    manager = Manager()
    manager.wipe_all()
    threading.Thread(target=_warm, daemon=True).start()

    async def janitor():
        while True:
            await asyncio.sleep(60)
            manager.cleanup()

    task = asyncio.create_task(janitor())
    yield
    task.cancel()


def _warm():
    try:
        ensure_lo_profile_template()
    except Exception:
        pass


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Content-Security-Policy"] = CSP
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=(), clipboard-write=(self)"
    p = request.url.path
    if p.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    elif p.startswith("/vendor/") or p.startswith("/fonts/"):
        resp.headers["Cache-Control"] = "public, max-age=604800"
    else:
        resp.headers.setdefault("Cache-Control", "no-cache")
    return resp


def client_ip(request: Request) -> str:
    return (request.headers.get("cf-connecting-ip") or request.headers.get("x-real-ip")
            or (request.client.host if request.client else "?"))


def req_lang(request: Request | None) -> str:
    h = (request.headers.get("x-lang") if request else "") or ""
    return "th" if h.lower().startswith("th") else "en"


def err(status: int, code: str, message: str, request: Request | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": tr(message, req_lang(request))}}, status_code=status)


# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"ok": True, "jobs": len(manager.jobs), "queued": len(manager.queue_order)}


@app.get("/api/capabilities")
async def capabilities():
    return {
        "office": (config.LO_HOME / "program" / "soffice").exists(),
        "ocr_langs": available_langs(),
        "ai": config.ai_enabled(),
        "max_upload_mb": config.MAX_UPLOAD_MB,
        "tools": {k: dict(accept=list(v["accept"]), multi=v["multi"], min_files=v["min_files"],
                          max_files=v["max_files"]) for k, v in REGISTRY.items()},
    }


MAX_BYTES = config.MAX_UPLOAD_MB * 1024 * 1024


def _sniff_ok(path: Path, ext: str) -> bool:
    try:
        head = path.open("rb").read(1100)
    except OSError:
        return False
    if ext == "pdf":
        return b"%PDF-" in head
    if ext in ("docx", "xlsx", "pptx", "odt", "ods", "odp", "zip"):
        return head[:2] == b"PK"
    if ext in ("doc", "xls", "ppt"):
        return head[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    if ext in ("jpg", "jpeg"):
        return head[:3] == b"\xff\xd8\xff"
    if ext == "png":
        return head[:8] == b"\x89PNG\r\n\x1a\n"
    return True


@app.post("/api/jobs/{tool}")
async def create_job(tool: str, request: Request, files: list[UploadFile] = File(default=[]),
                     options: str = Form(default="{}")):
    spec = REGISTRY.get(tool)
    if not spec:
        return err(404, "unknown_tool", "Unknown tool.", request)
    cl = request.headers.get("content-length")
    if cl and int(cl) > MAX_BYTES + 2 * 1024 * 1024:
        return err(413, "too_large", f"Files are too large (limit {config.MAX_UPLOAD_MB} MB per request).", request)
    try:
        opts = json.loads(options)
        if not isinstance(opts, dict) or len(options) > 8 * 1024 * 1024:
            raise ValueError
    except ValueError:
        return err(400, "bad_options", "Invalid options.", request)
    if len(files) < spec["min_files"]:
        return err(400, "missing_files", "Please add the required files." if spec["min_files"] else "Missing file.", request)
    if len(files) > spec["max_files"] and not spec["no_files"]:
        return err(400, "too_many_files", f"At most {spec['max_files']} files are allowed for this tool.", request)
    ip = client_ip(request)
    try:
        manager.admit(ip)
    except Rejected as r:
        return err(r.status, r.code, r.message, request)
    job = manager.new_job(tool, ip)
    inputs, total = [], 0
    try:
        for i, uf in enumerate(files):
            name = Path(uf.filename or f"file{i}").name
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if ext not in spec["accept"]:
                raise Rejected(415, "bad_type", f"“{name}” is not a supported file type for this tool "
                                                f"({', '.join(spec['accept'])}).")
            dst = job.dir / "in" / f"{i:02d}_{safe_stem(Path(name).stem)}.{ext}"
            with dst.open("wb") as out:
                while chunk := await uf.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise Rejected(413, "too_large", f"Files are too large (limit {config.MAX_UPLOAD_MB} MB).")
                    out.write(chunk)
            if dst.stat().st_size == 0:
                raise Rejected(400, "empty_file", f"“{name}” is empty.")
            if not _sniff_ok(dst, ext):
                raise Rejected(415, "bad_type", f"“{name}” does not look like a valid .{ext} file.")
            inputs.append({"path": str(dst), "name": name})
    except Rejected as r:
        shutil.rmtree(job.dir, ignore_errors=True)
        manager.jobs.pop(job.id, None)
        return err(r.status, r.code, r.message, request)
    ai = {}
    uses_ai = tool in ("summarize", "translate") or (
        tool == "workflow" and any(isinstance(x, dict) and x.get("tool") in ("summarize", "translate") for x in opts.get("steps", [])))
    if uses_ai and config.ai_enabled():
        try:
            manager.admit_ai(ip)
        except Rejected as r:
            shutil.rmtree(job.dir, ignore_errors=True)
            manager.jobs.pop(job.id, None)
            return err(r.status, r.code, r.message, request)
    if tool in ("summarize", "translate", "workflow") and config.ai_enabled():
        ai = {"base_url": config.LLM_BASE_URL, "api_key": config.LLM_API_KEY, "model": config.LLM_MODEL}
    manager.start(job, inputs, opts, ai)
    return {"id": job.id}


def _job(jid: str):
    return manager.jobs.get(jid) if re.fullmatch(r"[A-Za-z0-9_-]{16,32}", jid) else None


@app.get("/api/jobs/{jid}")
async def job_status(jid: str, request: Request):
    job = _job(jid)
    if not job:
        return err(404, "not_found", "This job has expired. Please run it again.", request)
    return manager.view(job, req_lang(request))


@app.get("/api/jobs/{jid}/files/{index}")
async def job_file(jid: str, index: int, request: Request, inline: int = 0):
    job = _job(jid)
    if not job or job.status != "done" or not job.result:
        return err(404, "not_found", "File not available (it may have expired).", request)
    outs = job.result["outputs"]
    if not 0 <= index < len(outs):
        return err(404, "not_found", "No such file.", request)
    o = outs[index]
    p = Path(o["path"])
    if not p.is_file():
        return err(404, "not_found", "File not available.", request)
    return FileResponse(p, media_type=o["mime"], filename=None if inline else o["name"],
                        headers={"Content-Disposition": "inline"} if inline else {})


@app.get("/api/jobs/{jid}/zip")
async def job_zip(jid: str, request: Request):
    job = _job(jid)
    if not job or job.status != "done" or not job.result:
        return err(404, "not_found", "Files not available (they may have expired).", request)
    zp = job.dir / "all.zip"
    if not zp.exists():
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for o in job.result["outputs"]:
                if o.get("role", "main") == "main":
                    z.write(o["path"], o["name"])
    return FileResponse(zp, media_type="application/zip", filename="maxpdf_files.zip")


@app.delete("/api/jobs/{jid}")
async def job_delete(jid: str):
    job = _job(jid)
    if job:
        manager._kill(job)
        shutil.rmtree(job.dir, ignore_errors=True)
        manager.jobs.pop(jid, None)
    return {"ok": True}


# ---------------------------------------------------------------------------
# PWA: manifest + dynamically versioned service worker (precache list built from disk)
import hashlib
import mimetypes

mimetypes.add_type("application/manifest+json", ".webmanifest")


def _precache() -> tuple[str, list[str]]:
    urls = ["/", "/index.html", "/manifest.webmanifest", "/img/favicon.svg", "/img/icon-192.png", "/img/icon-512.png"]
    h = hashlib.sha1()
    for sub in ("css", "js"):
        for f in sorted((config.STATIC / sub).rglob("*")):
            if f.is_file():
                urls.append("/" + f.relative_to(config.STATIC).as_posix())
    for f in sorted((config.STATIC / "vendor" / "lib").glob("*")) + sorted((config.STATIC / "vendor" / "fonts").glob("*")):
        urls.append("/" + f.relative_to(config.STATIC).as_posix())
    urls += ["/vendor/pdfjs/pdf.min.mjs", "/vendor/pdfjs/pdf.worker.min.mjs"]
    for u in ["/index.html", "/manifest.webmanifest"] + [x for x in urls if x.startswith(("/css/", "/js/"))]:
        p = config.STATIC / u.lstrip("/")
        if p.is_file():
            h.update(f"{u}:{p.stat().st_mtime_ns}:{p.stat().st_size}".encode())
    return h.hexdigest()[:12], urls


@app.get("/sw.js")
async def service_worker():
    version, urls = _precache()
    body = f"const VERSION={json.dumps(version)};\nconst PRECACHE={json.dumps(urls)};\n" + (config.STATIC / "sw-core.js").read_text()
    return Response(body, media_type="text/javascript", headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})


app.mount("/vendor", StaticFiles(directory=config.STATIC / "vendor"), name="vendor")
app.mount("/css", StaticFiles(directory=config.STATIC / "css"), name="css")
app.mount("/js", StaticFiles(directory=config.STATIC / "js"), name="js")
app.mount("/img", StaticFiles(directory=config.STATIC / "img"), name="img")


@app.api_route("/{path:path}", methods=["GET", "HEAD"])
async def spa(path: str):
    if path.startswith("api/"):
        return err(404, "not_found", "Not found.")
    f = (config.STATIC / path).resolve()
    if path and f.is_file() and config.STATIC in f.parents:
        return FileResponse(f)
    return FileResponse(config.STATIC / "index.html")
