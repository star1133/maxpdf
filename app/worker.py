"""Runs one job in an isolated process: python -m app.worker <job_dir>"""
from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path


def main():
    job_dir = Path(sys.argv[1])
    spec = json.loads((job_dir / "job.json").read_text())
    from app.tools import REGISTRY, Ctx, ToolError

    result: dict
    try:
        t = REGISTRY[spec["tool"]]
        ctx = Ctx(job_dir, spec["inputs"], spec.get("options") or {}, spec.get("ai") or {})
        t["fn"](ctx)
        result = {"ok": True, "outputs": ctx.outputs, "data": ctx.data, "message": ctx.message}
    except ToolError as e:
        result = {"ok": False, "error": {"code": e.code, "message": e.message}}
    except MemoryError:
        result = {"ok": False, "error": {"code": "too_big", "message": "This file needs more memory than is allowed."}}
    except Exception as e:  # never leak internals/paths to users
        (job_dir / "error.log").write_text(traceback.format_exc())
        result = {"ok": False, "error": {"code": "internal", "message": "Something went wrong while processing this file."}}
    tmp = job_dir / "result.json.tmp"
    tmp.write_text(json.dumps(result))
    os.replace(tmp, job_dir / "result.json")


if __name__ == "__main__":
    main()
