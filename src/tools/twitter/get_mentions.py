#!/usr/bin/env python3

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from _oauth import build_oauth_header


API_TEMPLATE = "https://api.x.com/2/users/{user_id}/mentions"


def require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch recent mentions with OAuth 1.0a auth.")
    parser.add_argument("--count", type=int, default=10, help="Max results to fetch.")
    parser.add_argument("--user-id", dest="user_id", help="Twitter/X user ID. Falls back to TWITTER_USER_ID.")
    return parser.parse_args()


def main():
    args = parse_args()
    consumer_key = require_env("TWITTER_API_KEY")
    consumer_secret = require_env("TWITTER_API_SECRET")
    access_token = require_env("TWITTER_ACCESS_TOKEN")
    access_token_secret = require_env("TWITTER_ACCESS_TOKEN_SECRET")
    user_id = (args.user_id or os.environ.get("TWITTER_USER_ID", "")).strip()
    if not user_id:
        raise SystemExit("Twitter user ID is required via --user-id or TWITTER_USER_ID.")

    base_url = API_TEMPLATE.format(user_id=user_id)
    query_params = {
        "max_results": str(max(5, min(args.count, 100))),
        "tweet.fields": "author_id,conversation_id,created_at,public_metrics",
        "expansions": "author_id",
        "user.fields": "name,username",
    }
    url = f"{base_url}?{urllib.parse.urlencode(query_params)}"

    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", build_oauth_header(
        "GET", base_url, consumer_key, consumer_secret, access_token, access_token_secret,
        query_params=query_params,
    ))

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
