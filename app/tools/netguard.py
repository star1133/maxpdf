"""SSRF guard for HTML->PDF: only public http(s) hosts on web ports."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from .base import ToolError

ALLOWED_PORTS = {80, 443, 8080, 8443}


def _public(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    if getattr(a, "ipv4_mapped", None):
        a = a.ipv4_mapped
    return a.is_global and not a.is_multicast


def host_is_public(host: str) -> bool:
    if not host:
        return False
    try:
        ipaddress.ip_address(host.strip("[]"))
        return _public(host.strip("[]"))
    except ValueError:
        pass
    if host.lower() in ("localhost",) or host.lower().endswith((".local", ".internal", ".localhost", ".lan")):
        return False
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    ips = {i[4][0] for i in infos}
    return bool(ips) and all(_public(ip) for ip in ips)


def check_url(url: str) -> str:
    try:
        u = urlsplit(url.strip())
    except ValueError:
        raise ToolError("bad_url", "That URL is not valid.")
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ToolError("bad_url", "Enter a full http(s) address, for example https://example.com")
    if u.username or u.password:
        raise ToolError("bad_url", "URLs with credentials are not allowed.")
    port = u.port or (443 if u.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise ToolError("blocked_url", "Only standard web ports are allowed.")
    if not host_is_public(u.hostname):
        raise ToolError("blocked_url", "This address is not a public website.")
    return u.geturl()


def request_allowed(url: str) -> bool:
    """Used for every sub-request made by the browser."""
    if url.startswith(("data:", "blob:", "about:")):
        return True
    try:
        check_url(url)
        return True
    except ToolError:
        return False
