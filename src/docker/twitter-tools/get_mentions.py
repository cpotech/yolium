#!/usr/bin/env python3

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


API_TEMPLATE = "https://api.x.com/2/users/{user_id}/mentions"


def require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch recent mentions with bearer-token auth.")
    parser.add_argument("--count", type=int, default=10, help="Max results to fetch.")
    parser.add_argument("--user-id", dest="user_id", help="Twitter/X user ID. Falls back to TWITTER_USER_ID.")
    return parser.parse_args()


def main():
    args = parse_args()
    bearer_token = require_env("TWITTER_BEARER_TOKEN")
    user_id = (args.user_id or os.environ.get("TWITTER_USER_ID", "")).strip()
    if not user_id:
        raise SystemExit("Twitter user ID is required via --user-id or TWITTER_USER_ID.")

    query = urllib.parse.urlencode({
        "max_results": max(5, min(args.count, 100)),
        "tweet.fields": "author_id,conversation_id,created_at,public_metrics",
        "expansions": "author_id",
        "user.fields": "name,username",
    })
    url = f"{API_TEMPLATE.format(user_id=user_id)}?{query}"

    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", f"Bearer {bearer_token}")

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Twitter API error ({exc.code}): {message}")
    except urllib.error.URLError as exc:
        raise SystemExit(f"Twitter API request failed: {exc.reason}")

    mentions = payload.get("data", [])
    print(json.dumps({
        "success": True,
        "count": len(mentions),
        "mentions": mentions,
        "includes": payload.get("includes", {}),
        "meta": payload.get("meta", {}),
    }))


if __name__ == "__main__":
    main()
