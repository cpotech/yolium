#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from _oauth import build_oauth_header


API_URL = "https://api.x.com/2/tweets"


def require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def parse_args():
    parser = argparse.ArgumentParser(description="Post a tweet with OAuth 1.0a signing.")
    parser.add_argument("text", nargs="?", help="Tweet text. Reads stdin when omitted.")
    parser.add_argument("--reply-to", dest="reply_to", help="Optional tweet ID to reply to.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate the request without sending it.")
    return parser.parse_args()


def main():
    args = parse_args()
    text = args.text if args.text is not None else sys.stdin.read().strip()
    if not text:
        raise SystemExit("Tweet text is required.")

    payload = {"text": text}
    if args.reply_to:
        payload["reply"] = {"in_reply_to_tweet_id": args.reply_to}

    effective_dry_run = args.dry_run or os.environ.get("DRY_RUN", "").lower() != "false"
    if effective_dry_run:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
        print(json.dumps({
            "success": True,
            "dry_run": True,
            "tweet_id": f"dry-run-{digest}",
            "text": text,
            "reply_to": args.reply_to,
            "payload": payload,
        }))
        return

    consumer_key = require_env("TWITTER_API_KEY")
    consumer_secret = require_env("TWITTER_API_SECRET")
    access_token = require_env("TWITTER_ACCESS_TOKEN")
    access_token_secret = require_env("TWITTER_ACCESS_TOKEN_SECRET")

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(API_URL, data=body, method="POST")
    request.add_header("Authorization", build_oauth_header(
        "POST", API_URL, consumer_key, consumer_secret, access_token, access_token_secret,
    ))
    request.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Twitter API error ({exc.code}): {message}")
    except urllib.error.URLError as exc:
        raise SystemExit(f"Twitter API request failed: {exc.reason}")

    data = response_body.get("data", {})
    print(json.dumps({
        "success": True,
        "dry_run": False,
        "tweet_id": data.get("id"),
        "text": data.get("text", text),
        "reply_to": args.reply_to,
        "response": response_body,
    }))


if __name__ == "__main__":
    main()
