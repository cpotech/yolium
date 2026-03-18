"""Shared AT Protocol session auth for Bluesky API tools."""

import json
import os
import urllib.error
import urllib.request


XRPC_BASE = "https://bsky.social/xrpc"

_session = None


def require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def create_session():
    """Create an AT Protocol session. Returns {accessJwt, did, handle}."""
    global _session
    if _session is not None:
        return _session

    identifier = require_env("BLUESKY_IDENTIFIER")
    app_password = require_env("BLUESKY_APP_PASSWORD")

    url = f"{XRPC_BASE}/com.atproto.server.createSession"
    body = json.dumps({
        "identifier": identifier,
        "password": app_password,
    }).encode("utf-8")

    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Bluesky auth failed ({exc.code}): {message}")
    except urllib.error.URLError as exc:
        raise SystemExit(f"Bluesky auth request failed: {exc.reason}")

    _session = {
        "accessJwt": data["accessJwt"],
        "did": data["did"],
        "handle": data["handle"],
    }
    return _session


def authenticated_request(method, url, headers=None, data=None):
    """Make an authenticated request to the Bluesky API.

    Args:
        method: HTTP method (GET, POST, etc.)
        url: Full URL to request
        headers: Optional additional headers dict
        data: Optional request body (bytes or dict)
    """
    session = create_session()

    if isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")

    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {session['accessJwt']}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if headers:
        for key, value in headers.items():
            request.add_header(key, value)

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Bluesky API error ({exc.code}): {message}")
    except urllib.error.URLError as exc:
        raise SystemExit(f"Bluesky API request failed: {exc.reason}")
