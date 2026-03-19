"""Shared IMAP connection helper for email tools."""

import imaplib
import os


def require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def connect_imap(host=None, port=None, user=None, password=None, use_ssl=True):
    """Connect to an IMAP server and authenticate.

    Args:
        host: IMAP server hostname (falls back to EMAIL_IMAP_HOST env var)
        port: IMAP server port (falls back to EMAIL_IMAP_PORT, default 993)
        user: IMAP username (falls back to EMAIL_IMAP_USER env var)
        password: IMAP password (falls back to EMAIL_IMAP_PASSWORD env var)
        use_ssl: Whether to use SSL (default True)

    Returns:
        Authenticated IMAP4_SSL (or IMAP4) connection
    """
    host = host or require_env("EMAIL_IMAP_HOST")
    port = int(port or os.environ.get("EMAIL_IMAP_PORT", "993").strip() or "993")
    user = user or require_env("EMAIL_IMAP_USER")
    password = password or require_env("EMAIL_IMAP_PASSWORD")

    if use_ssl:
        conn = imaplib.IMAP4_SSL(host, port)
    else:
        conn = imaplib.IMAP4(host, port)

    conn.login(user, password)
    return conn
