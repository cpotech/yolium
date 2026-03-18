#!/usr/bin/env python3

import argparse
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from _auth import authenticated_request, XRPC_BASE


def parse_args():
    parser = argparse.ArgumentParser(description="Get a Bluesky post thread for reply reference resolution.")
    parser.add_argument("uri", help="AT URI of the post (e.g. at://did:plc:xxx/app.bsky.feed.post/yyy).")
    return parser.parse_args()


def extract_ref(post_view):
    """Extract uri and cid from a post view."""
    if not post_view or not isinstance(post_view, dict):
        return None
    post = post_view.get("post", post_view)
    uri = post.get("uri")
    cid = post.get("cid")
    if uri and cid:
        return {"uri": uri, "cid": cid}
    return None


def find_root(thread):
    """Walk up the parent chain to find the root post."""
    current = thread
    while current and isinstance(current, dict):
        parent = current.get("parent")
        if not parent or not isinstance(parent, dict):
            break
        current = parent
    return extract_ref(current)


def main():
    args = parse_args()

    query_params = {"uri": args.uri}
    url = f"{XRPC_BASE}/app.bsky.feed.getPostThread?{urllib.parse.urlencode(query_params)}"

    payload = authenticated_request("GET", url)

    thread = payload.get("thread", {})
    post_ref = extract_ref(thread)
    parent_ref = extract_ref(thread.get("parent"))
    root_ref = find_root(thread)

    result = {
        "success": True,
        "thread": {
            "post": post_ref,
            "parent": parent_ref,
            "root": root_ref or post_ref,
        },
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
