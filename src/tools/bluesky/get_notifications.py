#!/usr/bin/env python3

import argparse
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from _auth import authenticated_request, XRPC_BASE


VALID_FILTERS = {"mention", "reply", "like", "repost", "follow"}


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch Bluesky notifications via AT Protocol.")
    parser.add_argument("--count", type=int, default=25, help="Max notifications to fetch.")
    parser.add_argument("--filter", choices=sorted(VALID_FILTERS), help="Filter by notification type.")
    return parser.parse_args()


def main():
    args = parse_args()

    query_params = {
        "limit": str(max(1, min(args.count, 100))),
    }
    url = f"{XRPC_BASE}/app.bsky.notification.listNotifications?{urllib.parse.urlencode(query_params)}"

    payload = authenticated_request("GET", url)

    notifications = payload.get("notifications", [])

    if args.filter:
        notifications = [n for n in notifications if n.get("reason") == args.filter]

    results = []
    for notif in notifications:
        author = notif.get("author", {})
        record = notif.get("record", {})
        results.append({
            "uri": notif.get("uri"),
            "cid": notif.get("cid"),
            "author": author.get("handle"),
            "reason": notif.get("reason"),
            "text": record.get("text", ""),
            "indexedAt": notif.get("indexedAt"),
        })

    print(json.dumps({
        "success": True,
        "count": len(results),
        "notifications": results,
    }))


if __name__ == "__main__":
    main()
