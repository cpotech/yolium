"""Shared OAuth 1.0a signing for Twitter API v2 tools."""

import base64
import hashlib
import hmac
import time
import uuid
import urllib.parse


def percent_encode(value):
    return urllib.parse.quote(str(value), safe="~-._")


def build_oauth_header(method, url, consumer_key, consumer_secret, token, token_secret, query_params=None):
    """Build an OAuth 1.0a Authorization header.

    Args:
        method: HTTP method (GET, POST, etc.)
        url: Base URL without query string
        consumer_key: Twitter API key
        consumer_secret: Twitter API secret
        token: Access token
        token_secret: Access token secret
        query_params: Optional dict of query parameters to include in signature
    """
    nonce = uuid.uuid4().hex
    timestamp = str(int(time.time()))
    oauth_params = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": nonce,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": timestamp,
        "oauth_token": token,
        "oauth_version": "1.0",
    }
    # OAuth 1.0a requires all query params in the signature base string
    sig_params = dict(oauth_params)
    if query_params:
        sig_params.update(query_params)
    normalized = "&".join(
        f"{percent_encode(key)}={percent_encode(sig_params[key])}"
        for key in sorted(sig_params)
    )
    base_string = "&".join([
        method.upper(),
        percent_encode(url),
        percent_encode(normalized),
    ])
    signing_key = f"{percent_encode(consumer_secret)}&{percent_encode(token_secret)}"
    digest = hmac.new(
        signing_key.encode("utf-8"),
        base_string.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    oauth_params["oauth_signature"] = base64.b64encode(digest).decode("utf-8")
    return "OAuth " + ", ".join(
        f'{percent_encode(key)}="{percent_encode(value)}"'
        for key, value in sorted(oauth_params.items())
    )
