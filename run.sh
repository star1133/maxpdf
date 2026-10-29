#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
unset PYTHONPATH PYTHONHOME
mkdir -p data/jobs
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${MAXPDF_PORT:-3120}" --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1 --no-server-header --timeout-keep-alive 30
