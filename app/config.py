"""Runtime configuration. Reads ROOT/.env itself (never exported to workers)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
JOBS = DATA / "jobs"
STATIC = ROOT / "static"
TESS_DIR = ROOT / "vendor-bin" / "tess" / "usr"
LO_HOME = ROOT / "vendor-bin" / "lo" / "opt" / "libreoffice26.2"


def _read_env_file():
    out = {}
    p = ROOT / ".env"
    if p.is_file():
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


_ENV = _read_env_file()


def get(name, default=""):
    return os.environ.get(name) or _ENV.get(name) or default


HOST = get("MAXPDF_HOST", "127.0.0.1")
PORT = int(get("MAXPDF_PORT", "3120"))
MAX_UPLOAD_MB = int(get("MAXPDF_MAX_UPLOAD_MB", "100"))
MAX_PARALLEL = int(get("MAXPDF_MAX_PARALLEL", "2"))
MAX_ACTIVE_PER_IP = int(get("MAXPDF_MAX_ACTIVE_PER_IP", "3"))
RATE_PER_HOUR = int(get("MAXPDF_RATE_PER_HOUR", "60"))
JOB_TTL_SEC = int(get("MAXPDF_JOB_TTL_SEC", "1200"))
# AI calls cost real tokens, so they get their own (stricter) limits.
AI_PER_HOUR_PER_IP = int(get("MAXPDF_AI_PER_HOUR", "15"))
AI_PER_DAY_TOTAL = int(get("MAXPDF_AI_PER_DAY", "400"))

# Optional OpenAI-compatible endpoint for AI Summarizer / Translate.
LLM_BASE_URL = get("LLM_BASE_URL", "")
LLM_API_KEY = get("LLM_API_KEY", "")
LLM_MODEL = get("LLM_MODEL", "")


def ai_enabled() -> bool:
    return bool(LLM_BASE_URL and LLM_MODEL)
