"""Minimal OpenAI-compatible chat client (used by Summarizer / Translate)."""
from __future__ import annotations

import json
import re

import httpx

from .base import ToolError


def configured(ai: dict) -> bool:
    return bool(ai.get("base_url") and ai.get("model"))


def chat(ai: dict, system: str, user: str, *, temperature=0.2, max_tokens=2048, timeout=120) -> str:
    if not configured(ai):
        raise ToolError("ai_unavailable", "AI is not configured on this server.")
    url = ai["base_url"].rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if ai.get("api_key"):
        headers["Authorization"] = "Bearer " + ai["api_key"]
    body = {"model": ai["model"], "temperature": temperature, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    try:
        r = httpx.post(url, headers=headers, json=body, timeout=timeout)
    except httpx.HTTPError:
        raise ToolError("ai_error", "The AI service could not be reached.")
    if r.status_code >= 400:
        raise ToolError("ai_error", f"The AI service returned an error ({r.status_code}).")
    try:
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        raise ToolError("ai_error", "The AI service returned an unexpected response.")


def chat_json_list(ai: dict, system: str, items: list[str], **kw) -> list[str]:
    """Send a JSON array of strings, expect a JSON array of the same length back."""
    for attempt in range(2):
        out = chat(ai, system, json.dumps(items, ensure_ascii=False), **kw)
        m = re.search(r"\[.*\]", out, re.S)
        if m:
            try:
                arr = json.loads(m.group(0))
                if isinstance(arr, list) and len(arr) == len(items):
                    return [str(x) for x in arr]
            except json.JSONDecodeError:
                pass
    raise ToolError("ai_error", "The AI returned an unusable translation. Please try again.")
