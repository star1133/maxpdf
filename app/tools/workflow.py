"""Run a custom chain of tools server-side so intermediates never leave the job."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

from .base import REGISTRY, Ctx, ToolError, safe_stem, tool

# Tools whose output is a PDF and whose input is a single/multi PDF set
CHAINABLE = {"merge", "split", "rotate", "crop", "pagenumbers", "watermark", "compress", "repair", "ocr",
             "protect", "unlock", "pdfa", "redact", "organize", "metadata", "edit", "forms", "translate"}
TERMINAL_OK = CHAINABLE | {"pdf2jpg", "pdf2word", "pdf2pptx", "pdf2excel", "pdf2md", "pdf2txt"}


@tool("workflow", multi=True, max_files=30, timeout=2400, mem_gb=None)
def workflow(ctx: Ctx):
    steps = ctx.opts.get("steps") or []
    if not steps or len(steps) > 8:
        raise ToolError("bad_workflow", "A workflow needs between 1 and 8 steps.")
    for i, s in enumerate(steps):
        t = s.get("tool")
        if t not in REGISTRY or t not in TERMINAL_OK or (t not in CHAINABLE and i != len(steps) - 1):
            raise ToolError("bad_workflow", f"“{t}” cannot be used at step {i + 1}.")
    current = [dict(path=i["path"], name=i["name"]) for i in ctx.inputs]
    for si, step in enumerate(steps):
        spec = REGISTRY[step["tool"]]
        pdfs = []
        for f in current:
            p = Path(f["path"])
            if p.suffix.lower() == ".zip":
                dest = ctx.tmp / f"unz{si}_{len(pdfs)}"
                dest.mkdir(exist_ok=True)
                with zipfile.ZipFile(p) as z:
                    for m in z.namelist():
                        if m.lower().endswith(".pdf") and not m.startswith("/") and ".." not in m:
                            tgt = dest / safe_stem(Path(m).stem)
                            tgt = tgt.with_suffix(".pdf")
                            tgt.write_bytes(z.read(m))
                            pdfs.append(dict(path=str(tgt), name=Path(m).name))
            elif p.suffix.lower() == ".pdf":
                pdfs.append(f)
        if not pdfs:
            raise ToolError("bad_workflow", f"Step {si + 1} has no PDF to work on.")
        if not spec["multi"] and len(pdfs) > 1:  # run per file
            groups = [[f] for f in pdfs]
        else:
            groups = [pdfs]
        next_files = []
        for gi, grp in enumerate(groups):
            sub_dir = ctx.job_dir / "steps" / f"{si}_{gi}"
            sub_dir.mkdir(parents=True, exist_ok=True)
            sub = Ctx(sub_dir, grp, dict(step.get("opts") or {}), ctx.ai)
            ctx.progress((si + gi / len(groups)) / len(steps), f"{si + 1}/{len(steps)}: {step['tool']}")
            spec["fn"](sub)
            for o in sub.outputs:
                if o["role"] == "main":
                    next_files.append(dict(path=o["path"], name=o["name"]))
            if si == len(steps) - 1:
                ctx.data.setdefault("step_data", []).append(sub.data)
        current = next_files
    for f in current:
        dst = ctx.new_path(f["name"])
        shutil.copyfile(f["path"], dst)
        ctx.add_output(dst, f["name"])
