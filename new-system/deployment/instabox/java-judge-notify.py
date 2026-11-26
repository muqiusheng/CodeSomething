#!/usr/bin/env python3
"""Wake the private Java worker when there is claimable work in SQLite."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.parse import urlsplit

WINDOWS = ((60, 270), (360, 570), (630, 1020))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, url):
        return None


def has_claimable_job(data, owner, now):
    if owner == "admin":
        paths = [data / "codesomething.db"]
    elif owner:
        paths = [data / "learners" / (owner + ".db")]
    else:
        primary = data / "codesomething.db"
        if not primary.is_file():
            return False
        with closing(sqlite3.connect(primary.as_uri() + "?mode=ro", uri=True, timeout=1)) as db:
            learners = db.execute("SELECT id FROM users WHERE status='active' AND role='ROLE_STUDENT'").fetchall()
        paths = [data / "learners" / (row[0] + ".db") for row in learners]
    for path in paths:
        if not path.is_file() or path.is_symlink():
            continue
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=1)) as db:
            if not any(column[1] == "remote_java" for column in db.execute("PRAGMA table_info(check_jobs)")):
                continue
            if db.execute("""
                SELECT 1 FROM check_jobs WHERE remote_java=1
                AND (status='queued' OR (status='running' AND remote_until<=?))
                LIMIT 1
                """, (now,)).fetchone():
                return True
    return False


def main(config, now=None):
    now = now or datetime.now(timezone.utc)
    minute = now.hour * 60 + now.minute
    if not any(start <= minute < end for start, end in WINDOWS):
        return
    settings = json.loads(config.read_text())
    data = Path(settings["data"]).resolve()
    if not has_claimable_job(data, settings.get("owner", ""), int(now.timestamp())):
        return
    endpoint = urlsplit(settings["endpoint"])
    if endpoint.scheme != "https" or not endpoint.hostname or endpoint.username or endpoint.query or endpoint.fragment:
        raise ValueError("A private HTTPS Java worker is required")
    request = Request(settings["endpoint"].rstrip("/") + "/java-judge/wake", data=b"", headers={
        "Authorization": "Bearer " + settings["token"],
        "Cookie": "__Host-instabox_port_auth=" + settings["port_token"],
    })
    with build_opener(NoRedirect()).open(request, timeout=8) as response:
        if response.status != 202:
            raise ValueError("Java worker did not accept the signal")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("configuration", type=Path)
    main(parser.parse_args().configuration)
