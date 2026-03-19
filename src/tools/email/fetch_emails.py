#!/usr/bin/env python3

import argparse
import email
import email.header
import email.utils
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _imap import connect_imap


def decode_header(value):
    """Decode an email header value into a plain string."""
    if not value:
        return ""
    parts = email.header.decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return " ".join(decoded)


def get_snippet(msg, max_length=200):
    """Extract a plain-text snippet from an email message."""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
                    return text.strip()[:max_length]
        return ""
    payload = msg.get_payload(decode=True)
    if payload:
        text = payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
        return text.strip()[:max_length]
    return ""


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch recent emails via IMAP.")
    parser.add_argument("--count", type=int, default=10, help="Max emails to fetch (default 10).")
    parser.add_argument("--folder", default="INBOX", help="Mailbox folder (default INBOX).")
    parser.add_argument("--unread-only", action="store_true", help="Only fetch unread emails.")
    parser.add_argument("--since", help="Only fetch emails since this date (DD-Mon-YYYY, e.g. 01-Jan-2025).")
    return parser.parse_args()


def main():
    args = parse_args()

    conn = connect_imap()
    try:
        conn.select(args.folder, readonly=True)

        criteria = []
        if args.unread_only:
            criteria.append("UNSEEN")
        if args.since:
            criteria.append(f'SINCE {args.since}')
        search_criteria = " ".join(criteria) if criteria else "ALL"

        status, data = conn.search(None, search_criteria)
        if status != "OK":
            raise SystemExit(f"IMAP search failed: {status}")

        msg_ids = data[0].split()
        # Take the most recent N messages
        msg_ids = msg_ids[-args.count:]

        emails_list = []
        for msg_id in reversed(msg_ids):
            status, msg_data = conn.fetch(msg_id, "(FLAGS RFC822)")
            if status != "OK":
                continue
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            # Extract flags
            flags_data = msg_data[0][0]
            flags_str = flags_data.decode("utf-8", errors="replace") if isinstance(flags_data, bytes) else str(flags_data)
            flags = []
            if "\\Seen" in flags_str:
                flags.append("seen")
            if "\\Flagged" in flags_str:
                flags.append("flagged")
            if "\\Answered" in flags_str:
                flags.append("answered")

            emails_list.append({
                "id": msg_id.decode("utf-8") if isinstance(msg_id, bytes) else str(msg_id),
                "from": decode_header(msg.get("From", "")),
                "to": decode_header(msg.get("To", "")),
                "subject": decode_header(msg.get("Subject", "")),
                "date": msg.get("Date", ""),
                "snippet": get_snippet(msg),
                "flags": flags,
            })

        print(json.dumps({
            "success": True,
            "count": len(emails_list),
            "emails": emails_list,
        }))
    finally:
        conn.logout()


if __name__ == "__main__":
    main()
