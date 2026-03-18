#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from _oauth import build_oauth_header


USERS_ME_URL = "https://api.x.com/2/users/me"


def check_env(name):
    value = os.environ.get(name, "").strip()
    return value if value else None


def verify_bearer_token():
    token = check_env("TWITTER_BEARER_TOKEN")
    if not token:
        return {"valid": False, "error": "TWITTER_BEARER_TOKEN not set"}

    url = f"{USERS_ME_URL}?user.fields=id,name,username"
    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
            user = data.get("data", {})
            return {
                "valid": True,
                "user": f"@{user.get('username', '?')}",
                "user_id": user.get("id"),
            }
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"valid": False, "error": f"HTTP {exc.code}: {body}"}
    except urllib.error.URLError as exc:
        return {"valid": False, "error": str(exc.reason)}


def verify_oauth():
    consumer_key = check_env("TWITTER_API_KEY")
    consumer_secret = check_env("TWITTER_API_SECRET")
    access_token = check_env("TWITTER_ACCESS_TOKEN")
    access_token_secret = check_env("TWITTER_ACCESS_TOKEN_SECRET")

    missing = []
    if not consumer_key:
        missing.append("TWITTER_API_KEY")
    if not consumer_secret:
        missing.append("TWITTER_API_SECRET")
    if not access_token:
        missing.append("TWITTER_ACCESS_TOKEN")
    if not access_token_secret:
        missing.append("TWITTER_ACCESS_TOKEN_SECRET")

    if missing:
        return {"valid": False, "error": f"Missing: {', '.join(missing)}"}

    query_params = {"user.fields": "id,name,username"}
    url = f"{USERS_ME_URL}?{urllib.parse.urlencode(query_params)}"
    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", build_oauth_header(
        "GET", USERS_ME_URL, consumer_key, consumer_secret, access_token, access_token_secret,
        query_params=query_params,
    ))
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
            user = data.get("data", {})
            return {
                "valid": True,
                "user": f"@{user.get('username', '?')}",
                "user_id": user.get("id"),
            }
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code == 401:
            return {
                "valid": False,
                "error": f"HTTP 401 Unauthorized: {body}",
                "hint": "API Key, API Secret, Access Token, or Access Token Secret is invalid. "
                        "Regenerate them in the Twitter Developer Portal.",
            }
        if exc.code == 403:
            return {
                "valid": False,
                "error": f"HTTP 403 Forbidden: {body}",
                "hint": "OAuth 1.0a may not be enabled. In the Twitter Developer Portal, go to "
                        "your app → User authentication settings and ensure OAuth 1.0a is turned on.",
            }
        return {"valid": False, "error": f"HTTP {exc.code}: {body}"}
    except urllib.error.URLError as exc:
        return {"valid": False, "error": str(exc.reason)}


def main():
    result = {
        "bearer_token": verify_bearer_token(),
        "oauth": verify_oauth(),
    }

    # Build guidance based on results
    issues = []
    if not result["bearer_token"]["valid"]:
        issues.append(f"Bearer token: {result['bearer_token'].get('error', 'invalid')}")
    if not result["oauth"]["valid"]:
        issues.append(f"OAuth 1.0a: {result['oauth'].get('error', 'invalid')}")
        if result["oauth"].get("hint"):
            issues.append(f"  Hint: {result['oauth']['hint']}")

    if issues:
        result["guidance"] = (
            "Credential issues found:\n" + "\n".join(f"  - {i}" for i in issues) + "\n\n"
            "If OAuth 1.0a credentials are valid but posting still returns 403:\n"
            "  1. Verify app permissions are 'Read and Write' in Developer Portal\n"
            "  2. Regenerate Access Token and Secret after changing permissions\n"
            "  3. Ensure OAuth 1.0a is enabled under User authentication settings\n"
            "  4. Update credentials in Yolium specialist settings"
        )
    else:
        result["guidance"] = (
            "All credentials verified. OAuth 1.0a can authenticate as "
            f"{result['oauth'].get('user', 'unknown')}. "
            "If posting still fails with 403, the app may need 'Read and Write' permissions "
            "in the Developer Portal (Keys and Tokens → regenerate Access Token after upgrading)."
        )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result["oauth"]["valid"] else 1)


if __name__ == "__main__":
    main()
