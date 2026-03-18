#!/usr/bin/env python3

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _auth import create_session


def check_env(name):
    value = os.environ.get(name, "").strip()
    return value if value else None


def main():
    identifier = check_env("BLUESKY_IDENTIFIER")
    app_password = check_env("BLUESKY_APP_PASSWORD")

    missing = []
    if not identifier:
        missing.append("BLUESKY_IDENTIFIER")
    if not app_password:
        missing.append("BLUESKY_APP_PASSWORD")

    if missing:
        print(json.dumps({
            "valid": False,
            "error": f"Missing: {', '.join(missing)}",
            "hint": "Set BLUESKY_IDENTIFIER (handle or email) and BLUESKY_APP_PASSWORD "
                    "(generate at Settings > App Passwords in the Bluesky app).",
        }))
        sys.exit(1)
        return

    try:
        session = create_session()
        print(json.dumps({
            "valid": True,
            "handle": f"@{session['handle']}",
            "did": session["did"],
        }))
        sys.exit(0)
    except SystemExit as exc:
        print(json.dumps({
            "valid": False,
            "error": str(exc),
            "hint": "Check your BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD. "
                    "Generate an App Password at Settings > App Passwords in the Bluesky app.",
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
