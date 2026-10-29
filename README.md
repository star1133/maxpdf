# MaxPDF — PDF + developer tools

Self-hosted PDF toolbox (31 PDF tools and workflows) plus 40 browser-only developer utilities. Bilingual UI (TH/EN), light/dark, installable PWA. No frontend build step: static ES modules with vendored libraries.

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m playwright install chromium   # HTML -> PDF
cp .env.example .env && chmod 600 .env             # optional: AI summarizer / translate
bash run.sh                                        # http://127.0.0.1:3120
curl localhost:3120/api/health
```

Optional system tools enable more features: Tesseract (OCR, `eng`+`tha`), LibreOffice headless (Word/PowerPoint/Excel → PDF), Ghostscript/qpdf as used by OCRmyPDF.

## Configuration (environment or `.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `MAXPDF_PORT` / `MAXPDF_HOST` | `3120` / `127.0.0.1` | Listen address |
| `MAXPDF_MAX_UPLOAD_MB` | `100` | Per-upload cap |
| `MAXPDF_MAX_PARALLEL` | `2` | Parallel jobs |
| `MAXPDF_MAX_ACTIVE_PER_IP` | `3` | Active jobs per client |
| `MAXPDF_RATE_PER_HOUR` | `60` | Jobs per client per hour |
| `MAXPDF_JOB_TTL_SEC` | `1200` | How long finished jobs are kept |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | empty | OpenAI-compatible endpoint for AI features; without a model the summarizer is extractive and Translate is disabled |

## Layout

- `app/main.py` FastAPI (API + static), `app/jobs.py` queue (each job runs in a separate resource-limited process), `app/worker.py`, `app/tools/*.py` PDF tools
- `static/` frontend: `js/tools/*` PDF UIs, `js/dev/*` developer tools, `vendor/` vendored libraries (see `_npm/package.json`)
- `fonts/` bundled Thai + Latin fonts used when stamping text (Liberation: SIL OFL; Garuda/Norasi/Tlwg: GPL with font exception)

## Security notes

- No authentication — intended as a public utility behind your own reverse proxy / rate limiting.
- Uploads are type-sniffed, size-capped and stored under `data/jobs/<random id>`; inputs are deleted when a job finishes and outputs after the TTL. Workers get a minimal environment.
- HTML → PDF only fetches public http(s) hosts on ports 80/443/8080/8443; the SSRF guard is re-checked on every sub-request. Chromium runs with `--no-sandbox`, so run the service in a container or as an unprivileged user.
- Never commit `.env`.

## License

AGPL-3.0 — see [LICENSE](LICENSE). This project depends on PyMuPDF (AGPL-3.0); if you offer it over a network you must make the corresponding source available.
