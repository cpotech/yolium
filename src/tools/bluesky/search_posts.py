#!/usr/bin/env python3

import argparse
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from _auth import authenticated_request, XRPC_BASE


def parse_args():
    parser = argparse.ArgumentParser(description="Search Bluesky posts via AT Protocol.")
    parser.add_argument("--query", required=True, help="Search query string.")
    parser.add_argument("--count", type=int, default=25, help="Max results to fetch (1-100).")
    parser.add_argument("--sort", choices=["top", "latest"], default="latest", help="Sort order.")
    return parser.parse_args()


def main():
    args = parse_args()

    query_params = {
        "q": args.query,
        "limit": str(max(1, min(args.count, 100))),
        "sort": args.sort,
    }
    url = f"{XRPC_BASE}/app.bsky.feed.searchPosts?{urllib.parse.urlencode(query_params)}"

    payload = authenticated_request("GET", url)

    posts = payload.get("posts", [])
    results = []
    for post in posts:
        author = post.get("author", {})
        record = post.get("record", {})
        results.append({
            "uri": post.get("uri"),
            "cid": post.get("cid"),
            "author": author.get("handle"),
            "text": record.get("text"),
            "createdAt": record.get("createdAt"),
            "likeCount": post.get("likeCount", 0),
            "replyCount": post.get("replyCount", 0),
            "repostCount": post.get("repostCount", 0),
        })

    print(json.dumps({
        "success": True,
        "count": len(results),
        "posts": results,
        "cursor": payload.get("cursor"),
    }))


if __name__ == "__main__":
    main()
