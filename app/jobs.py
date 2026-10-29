"""Job queue: each job runs in its own resource-limited worker process."""
from __future__ import annotations

import asyncio
import json
import os
import resource
import secrets
import shutil
import signal
import sys
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path

from . import config
from .i18n import tr
from .tools import REGISTRY
from .tools.optimize import ocr_env

SAFE_ENV_KEYS = ("PATH", "LANG", "LC_ALL")


@dataclass
class Job:
    id: str
    tool: str
    ip: str
    dir: Path
    created: float = field(default_factory=time.time)
    status: str = "queued"       # queued | running | done | error
    finished: float = 0.0
    result: dict | None = None
    error: dict | None = None
    proc: asyncio.subprocess.Process | None = None


class Rejected(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


class Manager:
    def __init__(self):
        self.jobs: dict[str, Job] = {}
        self.queue_order: deque[str] = deque()
        self.sem = asyncio.Semaphore(config.MAX_PARALLEL)
        self.hist: dict[str, deque] = defaultdict(deque)
        self.ai_hist: dict[str, deque] = defaultdict(deque)
        self.ai_day: deque = deque()
        config.JOBS.mkdir(parents=True, exist_ok=True)

    # -- admission ---------------------------------------------------------
    def admit(self, ip: str):
        now = time.time()
        h = self.hist[ip]
        while h and now - h[0] > 3600:
            h.popleft()
        if len(h) >= config.RATE_PER_HOUR:
            raise Rejected(429, "rate_limited", "Too many requests. Please try again in a little while.")
        active = sum(1 for j in self.jobs.values() if j.ip == ip and j.status in ("queued", "running"))
        if active >= config.MAX_ACTIVE_PER_IP:
            raise Rejected(429, "too_many_active", "Please wait for your current jobs to finish.")
        if len(self.queue_order) > 40:
            raise Rejected(503, "busy", "The server is busy. Please try again shortly.")
        h.append(now)

    def admit_ai(self, ip: str):
        now = time.time()
        h = self.ai_hist[ip]
        while h and now - h[0] > 3600:
            h.popleft()
        while self.ai_day and now - self.ai_day[0] > 86400:
            self.ai_day.popleft()
        if len(h) >= config.AI_PER_HOUR_PER_IP:
            raise Rejected(429, "ai_rate_limited", "AI features are limited per hour. Please try again later.")
        if len(self.ai_day) >= config.AI_PER_DAY_TOTAL:
            raise Rejected(429, "ai_busy", "AI features have reached today's shared limit. Please try again tomorrow.")
        h.append(now)
        self.ai_day.append(now)

    def new_job(self, tool: str, ip: str) -> Job:
        jid = secrets.token_urlsafe(16)
        d = config.JOBS / jid
        (d / "in").mkdir(parents=True, mode=0o700)
        job = Job(jid, tool, ip, d)
        self.jobs[jid] = job
        return job

    def start(self, job: Job, inputs: list[dict], options: dict, ai: dict):
        (job.dir / "job.json").write_text(json.dumps(
            {"tool": job.tool, "inputs": inputs, "options": options, "ai": ai}))
        self.queue_order.append(job.id)
        asyncio.create_task(self._run(job))

    # -- execution ---------------------------------------------------------
    def _env(self) -> dict:
        env = {k: os.environ[k] for k in SAFE_ENV_KEYS if k in os.environ}
        env["PATH"] = f"{Path(sys.executable).parent}:" + env.get("PATH", "/usr/bin:/bin")
        env.setdefault("LANG", "C.UTF-8")
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env["PYTHONUNBUFFERED"] = "1"
        env["MPLBACKEND"] = "Agg"
        pw = Path.home() / ".cache" / "ms-playwright"
        env["PLAYWRIGHT_BROWSERS_PATH"] = str(pw)
        env.update(ocr_env())
        env["PATH"] = ocr_env()["PATH"]
        return env

    async def _run(self, job: Job):
        spec = REGISTRY[job.tool]
        try:
            async with self.sem:
                if job.id in self.queue_order:
                    self.queue_order.remove(job.id)
                job.status = "running"
                mem = spec["mem_gb"]
                timeout = spec["timeout"]
                env = self._env()
                env["HOME"] = str(job.dir / "tmp")
                env["TMPDIR"] = str(job.dir / "tmp")
                (job.dir / "tmp").mkdir(exist_ok=True)

                def limits():
                    os.setsid()
                    os.nice(10)
                    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
                    resource.setrlimit(resource.RLIMIT_FSIZE, (3 * 1024 ** 3, 3 * 1024 ** 3))
                    if mem:
                        b = int(mem * 1024 ** 3)
                        resource.setrlimit(resource.RLIMIT_AS, (b, b))

                errlog = open(job.dir / "worker.err", "wb")
                job.proc = await asyncio.create_subprocess_exec(
                    sys.executable, "-s", "-m", "app.worker", str(job.dir), cwd=str(config.ROOT), env=env,
                    stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.DEVNULL, stderr=errlog,
                    preexec_fn=limits)
                try:
                    await asyncio.wait_for(job.proc.wait(), timeout=timeout)
                except asyncio.TimeoutError:
                    self._kill(job)
                    job.error = {"code": "timeout", "message": "This took too long and was cancelled."}
                finally:
                    errlog.close()
                self._kill(job)  # reap stray children (soffice, chrome, gs)
            if job.error is None:
                rp = job.dir / "result.json"
                if rp.exists():
                    res = json.loads(rp.read_text())
                    if res.get("ok"):
                        job.result = res
                    else:
                        job.error = res["error"]
                else:
                    job.error = {"code": "crashed", "message": "Processing failed. The file may be damaged or too complex."}
        except Exception:
            job.error = {"code": "internal", "message": "Something went wrong."}
        finally:
            if job.id in self.queue_order:
                self.queue_order.remove(job.id)
            job.status = "error" if job.error else "done"
            job.finished = time.time()
            shutil.rmtree(job.dir / "in", ignore_errors=True)  # originals are not kept
            shutil.rmtree(job.dir / "tmp", ignore_errors=True)

    @staticmethod
    def _kill(job: Job):
        if job.proc and job.proc.pid:
            try:
                os.killpg(job.proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

    # -- queries -----------------------------------------------------------
    def view(self, job: Job, lang: str = 'en') -> dict:
        d: dict = {"id": job.id, "tool": job.tool, "status": job.status}
        if job.status == "queued":
            try:
                d["position"] = list(self.queue_order).index(job.id) + 1
            except ValueError:
                d["position"] = 1
        if job.status == "running":
            try:
                d["progress"] = json.loads((job.dir / "progress.json").read_text())
            except Exception:
                d["progress"] = {"p": 0, "msg": ""}
        if job.status == "done" and job.result:
            d["outputs"] = [dict(index=i, name=o["name"], size=o["size"], mime=o["mime"], role=o.get("role", "main"))
                            for i, o in enumerate(job.result["outputs"])]
            d["data"] = job.result.get("data", {})
        if job.status == "error":
            d["error"] = {**job.error, "message": tr(job.error.get("message", ""), lang)}
        return d

    def cleanup(self):
        now = time.time()
        for jid, job in list(self.jobs.items()):
            expired = (job.finished and now - job.finished > config.JOB_TTL_SEC) or \
                      (now - job.created > config.JOB_TTL_SEC * 4)
            if expired and job.status in ("done", "error", "running", "queued"):
                if job.status in ("running", "queued"):
                    self._kill(job)
                shutil.rmtree(job.dir, ignore_errors=True)
                self.jobs.pop(jid, None)
        for ip in [k for k, v in self.hist.items() if not v]:
            self.hist.pop(ip, None)

    def wipe_all(self):
        shutil.rmtree(config.JOBS, ignore_errors=True)
        config.JOBS.mkdir(parents=True, exist_ok=True, mode=0o700)
