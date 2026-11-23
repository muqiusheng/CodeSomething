#!/usr/bin/env python3
"""Write verified, online snapshots of all CodeSomething SQLite files."""
import argparse
import os
import re
import sqlite3
import subprocess
import tarfile
import tempfile
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path


def snapshot(source, target):
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"Expected a regular database: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=10)) as db:
        db.execute("VACUUM INTO ?", (str(target),))
    with closing(sqlite3.connect(target.as_uri() + "?mode=ro", uri=True)) as copy:
        if copy.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
            raise RuntimeError(f"Backup integrity check failed: {source.name}")
        if copy.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise RuntimeError(f"Backup foreign key check failed: {source.name}")


LEARNER_DATABASE = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.db")
ARCHIVE_STAMP = "%Y%m%dT%H%M%S.%fZ"
ARCHIVE_NAME = re.compile(r"codesomething-(\d{8}T\d{6}\.\d{6}Z)\.tar\.gz")


def prune_archives(destination, cutoff):
    for path in destination.iterdir():
        match = ARCHIVE_NAME.fullmatch(path.name)
        if match and path.is_file() and not path.is_symlink():
            timestamp = datetime.strptime(match[1], ARCHIVE_STAMP).replace(tzinfo=timezone.utc)
            if timestamp < cutoff:
                path.unlink()


def backup(data, destination, retention_days=14, rclone_destination=None):
    data, destination = data.resolve(), destination.resolve()
    if destination == data or data in destination.parents:
        raise ValueError("Choose a backup directory outside the data directory.")
    os.umask(0o077)
    destination.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    final = destination / f"codesomething-{now.strftime(ARCHIVE_STAMP)}.tar.gz"
    with tempfile.TemporaryDirectory(prefix=".partial-", dir=destination) as staging:
        staging = Path(staging)
        snapshot(data / "codesomething.db", staging / "codesomething.db")
        learners = data / "learners"
        if learners.is_symlink():
            raise ValueError("The learners directory must not be a symlink.")
        for source in sorted(learners.glob("*.db")):
            if LEARNER_DATABASE.fullmatch(source.name):
                snapshot(source, staging / "learners" / source.name)
        archive = staging / final.name
        with tarfile.open(archive, "w:gz") as output:
            output.add(staging / "codesomething.db", arcname="codesomething.db")
            if (staging / "learners").exists():
                output.add(staging / "learners", arcname="learners")
        with archive.open("rb+") as stream:
            os.fsync(stream.fileno())
        archive.replace(final)
    prune_archives(destination, now - timedelta(days=retention_days))
    if rclone_destination:
        for archive in sorted(destination.iterdir()):
            if ARCHIVE_NAME.fullmatch(archive.name) and archive.is_file() and not archive.is_symlink():
                subprocess.run(["rclone", "copyto", str(archive), rclone_destination.rstrip("/") + "/" + archive.name],
                               check=True, timeout=900)
    return final


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--retention-days", type=int, choices=range(7, 15), default=14)
    parser.add_argument("--rclone-destination", default=os.environ.get("CS_BACKUP_RCLONE_DESTINATION"))
    arguments = parser.parse_args()
    print(backup(arguments.data, arguments.destination, arguments.retention_days, arguments.rclone_destination))
