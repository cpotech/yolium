#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import smtplib
import sys
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate, make_msgid

sys.path.insert(0, os.path.dirname(__file__))
from _imap import require_env


def parse_args():
    parser = argparse.ArgumentParser(description="Send an email via SMTP.")
    parser.add_argument("--to", required=True, help="Recipient email address.")
    parser.add_argument("--subject", required=True, help="Email subject.")
    parser.add_argument("--body", required=True, help="Email body (plain text).")
    parser.add_argument("--reply-to-id", dest="reply_to_id", help="Message-ID to reply to (for threading).")
    parser.add_argument("--dry-run", action="store_true", help="Simulate sending without actually delivering.")
    return parser.parse_args()


def main():
    args = parse_args()

    from_address = require_env("EMAIL_FROM_ADDRESS")
    from_name = os.environ.get("EMAIL_FROM_NAME", "").strip()

    effective_dry_run = args.dry_run or os.environ.get("DRY_RUN", "").lower() != "false"

    if effective_dry_run:
        digest = hashlib.sha256(
            f"{args.to}:{args.subject}:{args.body}".encode("utf-8")
        ).hexdigest()[:12]
        print(json.dumps({
            "success": True,
            "messageId": f"dry-run-{digest}",
            "dryRun": True,
            "to": args.to,
            "subject": args.subject,
        }))
        return

    smtp_host = require_env("EMAIL_SMTP_HOST")
    smtp_port = int(os.environ.get("EMAIL_SMTP_PORT", "587").strip() or "587")
    smtp_user = require_env("EMAIL_SMTP_USER")
    smtp_password = require_env("EMAIL_SMTP_PASSWORD")

    msg = MIMEText(args.body, "plain", "utf-8")
    msg["From"] = formataddr((from_name, from_address)) if from_name else from_address
    msg["To"] = args.to
    msg["Subject"] = args.subject
    msg["Date"] = formatdate(localtime=True)
    message_id = make_msgid()
    msg["Message-ID"] = message_id

    if args.reply_to_id:
        msg["In-Reply-To"] = args.reply_to_id
        msg["References"] = args.reply_to_id

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_address, [args.to], msg.as_string())
    except smtplib.SMTPException as exc:
        raise SystemExit(f"SMTP error: {exc}")

    print(json.dumps({
        "success": True,
        "messageId": message_id,
        "dryRun": False,
        "to": args.to,
        "subject": args.subject,
    }))


if __name__ == "__main__":
    main()
