#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import re
import sys
import datetime

sys.path.insert(0, os.path.dirname(__file__))
from _auth import create_session, authenticated_request, XRPC_BASE


def parse_args():
    parser = argparse.ArgumentParser(description="Post to Bluesky with AT Protocol.")
    parser.add_argument("text", nargs="?", help="Post text. Reads stdin when omitted.")
    parser.add_argument("--reply-to", dest="reply_to", help="AT URI of parent post to reply to.")
    parser.add_argument("--root-uri", dest="root_uri", help="AT URI of thread root post.")
    parser.add_argument("--root-cid", dest="root_cid", help="CID of thread root post.")
    parser.add_argument("--parent-uri", dest="parent_uri", help="AT URI of direct parent post.")
    parser.add_argument("--parent-cid", dest="parent_cid", help="CID of direct parent post.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate the request without sending it.")
    return parser.parse_args()


def detect_facets(text):
    """Auto-detect URLs and hashtags, returning richtext facets with byte-position ranges."""
    facets = []
    text_bytes = text.encode("utf-8")

    # Detect URLs
    url_pattern = re.compile(r'https?://[^\s)<>\]]+')
    for match in url_pattern.finditer(text):
        url = match.group(0)
        # Compute byte positions
        start_char = match.start()
        byte_start = len(text[:start_char].encode("utf-8"))
        byte_end = byte_start + len(url.encode("utf-8"))
        facets.append({
            "$type": "app.bsky.richtext.facet",
            "index": {"byteStart": byte_start, "byteEnd": byte_end},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
        })

    # Detect hashtags
    hashtag_pattern = re.compile(r'(?:^|\s)(#[a-zA-Z0-9_]+)')
    for match in hashtag_pattern.finditer(text):
        tag_with_hash = match.group(1)
        tag = tag_with_hash[1:]  # Remove the # prefix
        # Find the actual position of the hashtag in the original text
        tag_start = match.start(1)
        byte_start = len(text[:tag_start].encode("utf-8"))
        byte_end = byte_start + len(tag_with_hash.encode("utf-8"))
        facets.append({
            "$type": "app.bsky.richtext.facet",
            "index": {"byteStart": byte_start, "byteEnd": byte_end},
            "features": [{"$type": "app.bsky.richtext.facet#tag", "tag": tag}],
        })

    return facets


def resolve_reply_refs(reply_to_uri, args):
    """Resolve reply parent and root references."""
    # If explicit refs are provided, use them
    if args.parent_uri and args.parent_cid and args.root_uri and args.root_cid:
        return {
            "root": {"uri": args.root_uri, "cid": args.root_cid},
            "parent": {"uri": args.parent_uri, "cid": args.parent_cid},
        }

    # Otherwise, fetch the thread to resolve refs
    import urllib.parse
    query_params = {"uri": reply_to_uri}
    url = f"{XRPC_BASE}/app.bsky.feed.getPostThread?{urllib.parse.urlencode(query_params)}"

    payload = authenticated_request("GET", url)
    thread = payload.get("thread", {})
    post = thread.get("post", {})

    parent_ref = {"uri": post.get("uri"), "cid": post.get("cid")}

    # Walk up to find root
    root_ref = parent_ref
    current = thread
    while current and isinstance(current, dict):
        parent = current.get("parent")
        if not parent or not isinstance(parent, dict):
            break
        root_post = parent.get("post", parent)
        if root_post.get("uri") and root_post.get("cid"):
            root_ref = {"uri": root_post["uri"], "cid": root_post["cid"]}
        current = parent

    return {"root": root_ref, "parent": parent_ref}


def main():
    args = parse_args()
    text = args.text if args.text is not None else sys.stdin.read().strip()
    if not text:
        raise SystemExit("Post text is required.")

    facets = detect_facets(text)

    record = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    if facets:
        record["facets"] = facets

    effective_dry_run = args.dry_run or os.environ.get("DRY_RUN", "").lower() != "false"

    if args.reply_to:
        if effective_dry_run:
            # In dry-run mode, create placeholder reply refs
            record["reply"] = {
                "root": {"uri": args.root_uri or args.reply_to, "cid": args.root_cid or "dry-run-cid"},
                "parent": {"uri": args.parent_uri or args.reply_to, "cid": args.parent_cid or "dry-run-cid"},
            }
        else:
            record["reply"] = resolve_reply_refs(args.reply_to, args)

    if effective_dry_run:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
        print(json.dumps({
            "success": True,
            "dry_run": True,
            "uri": f"at://dry-run/app.bsky.feed.post/{digest}",
            "text": text,
            "reply_to": args.reply_to,
            "facets": facets,
            "record": record,
        }))
        return

    session = create_session()
    url = f"{XRPC_BASE}/com.atproto.repo.createRecord"
    payload = {
        "repo": session["did"],
        "collection": "app.bsky.feed.post",
        "record": record,
    }

    response = authenticated_request("POST", url, data=payload)

    print(json.dumps({
        "success": True,
        "dry_run": False,
        "uri": response.get("uri"),
        "cid": response.get("cid"),
        "text": text,
        "reply_to": args.reply_to,
        "facets": facets,
    }))


if __name__ == "__main__":
    main()
