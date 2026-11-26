#!/usr/bin/env python3
"""Receive immutable backups and verify recovery in a fresh directory."""
import argparse
import hashlib
import hmac
import http.client
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from contextlib import closing
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ARCHIVE = re.compile(r"codesomething-\d{8}T\d{6}\.\d{6}Z\.tar\.gz")
LEARNER = re.compile(r"learners/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.db")
MYSQL_SNAPSHOT = re.compile(r"mysql-idle/cs-sql-(?:school|learner)-[0-9a-f]{24}\.sql")
CHUNK_SIZE = 1024 * 1024
MAX_ARCHIVE_BYTES = 512 * CHUNK_SIZE
MAX_RESTORED_BYTES = 2 * 1024 * CHUNK_SIZE


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def flush_directory(path):
    if os.name != "nt":
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def receive(directory, name, expected, stream, length=None):
    if not ARCHIVE.fullmatch(name) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("Invalid backup name or SHA-256")
    directory.mkdir(parents=True, exist_ok=True)
    final = directory / name
    sha256 = hashlib.sha256()
    written = 0
    with tempfile.TemporaryDirectory(prefix=".receiving-", dir=directory) as staging:
        partial = Path(staging) / name
        with partial.open("xb") as output:
            while length is None or written < length:
                chunk = stream.read(CHUNK_SIZE if length is None else min(CHUNK_SIZE, length - written))
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_ARCHIVE_BYTES:
                    raise ValueError("Backup exceeds the compressed size limit")
                sha256.update(chunk)
                output.write(chunk)
            if written == 0 or (length is not None and written != length) or sha256.hexdigest() != expected:
                raise ValueError("Backup SHA-256 mismatch")
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(partial, final)
        except FileExistsError:
            if final.is_symlink() or not final.is_file() or digest(final) != expected:
                raise ValueError("An existing backup with this name has different content")
        flush_directory(directory)
    return final


def serve(bind, port, directory, key):
    class Receiver(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def do_PUT(self):
            if not hmac.compare_digest(self.headers.get("X-Maqibu-Backup-Key", "").encode(), key.encode()):
                self.send_error(403)
                return
            name = self.path.removeprefix("/backup/")
            length = self.headers.get("Content-Length", "")
            if (self.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal()
                    or len(length) > 10 or not (0 < int(length) <= MAX_ARCHIVE_BYTES)):
                self.send_error(400)
                return
            if not self.path.startswith("/backup/"):
                self.send_error(404)
                return
            try:
                receive(directory, name, self.headers.get("X-Backup-SHA256", ""), self.rfile, int(length))
            except ValueError:
                self.send_error(422)
                return
            except OSError:
                self.send_error(503)
                return
            self.send_response(201)
            self.end_headers()

    with HTTPServer((bind, port), Receiver) as server:
        server.serve_forever()


def push(archive, url, token, key):
    endpoint = urlsplit(url)
    if endpoint.scheme != "https" or not endpoint.hostname or endpoint.path not in ("", "/") or any(
        (endpoint.username, endpoint.password, endpoint.query, endpoint.fragment)
    ):
        raise ValueError("Expected the peer's private HTTPS origin without credentials in the URL")
    if not ARCHIVE.fullmatch(archive.name) or not archive.is_file() or archive.is_symlink():
        raise ValueError("Expected a regular backup archive")
    size = archive.stat().st_size
    if not (0 < size <= MAX_ARCHIVE_BYTES):
        raise ValueError("Backup exceeds the compressed size limit")
    with closing(http.client.HTTPSConnection(endpoint.hostname, endpoint.port, timeout=120)) as connection:
        with archive.open("rb") as stream:
            connection.request("PUT", f"/backup/{archive.name}", stream, {
                "Authorization": f"Bearer {token}",
                "X-Maqibu-Backup-Key": key,
                "Content-Length": str(size),
                "X-Backup-SHA256": digest(archive),
            })
            with connection.getresponse() as response:
                if response.status != 201:
                    raise ValueError(f"Peer backup was not accepted (HTTP {response.status})")
    print(archive.name)


def prune(directory, days):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    for archive in directory.glob("*.tar.gz"):
        if ARCHIVE.fullmatch(archive.name) and archive.is_file() and not archive.is_symlink():
            timestamp = datetime.fromtimestamp(archive.stat().st_mtime, timezone.utc)
            if timestamp < cutoff:
                archive.unlink(missing_ok=True)


def cycle(config):
    prune(Path(config["inbox"]), config.get("retention_days", 14))
    data = Path(config["data"])
    if not (data / "codesomething.db").exists():
        print("Waiting for a local application database")
        return
    retention = config.get("retention_days", 14)
    destination = Path(config["outbox"])
    command = [sys.executable, str(Path(__file__).with_name("backup-sqlite.py")),
               str(data), str(destination), "--retention-days", str(retention), "--rclone-destination", ""]
    if config.get("include_mysql_snapshots") is True:
        command.append("--include-mysql-snapshots")
    if config.get("mysql_docker_host"):
        command.extend(["--mysql-docker-host", config["mysql_docker_host"]])
    result = subprocess.run(
        command,
        check=True, stdout=subprocess.PIPE, text=True, timeout=300,
    )
    push(Path(result.stdout.strip()), config["peer_url"], config["peer_token"], config["peer_key"])


def check_database(path):
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError(f"Invalid database: {path.name}")
        if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise ValueError(f"Foreign-key errors in {path.name}")


def restore_check(archive, destination):
    if not ARCHIVE.fullmatch(archive.name) or not archive.is_file() or archive.is_symlink():
        raise ValueError("Expected a regular backup archive")
    seen = set()
    restored = 0
    databases = 0
    mysql_snapshots = 0
    destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    try:
        with tarfile.open(archive, "r|gz") as backup:
            for member in backup:
                name = member.name
                if member.isdir() and name == "learners":
                    continue
                mysql = MYSQL_SNAPSHOT.fullmatch(name) is not None
                if not member.isfile() or not (name == "codesomething.db" or LEARNER.fullmatch(name) or mysql):
                    raise ValueError(f"Unexpected archive member: {name!r}")
                restored += member.size
                if name in seen or restored > MAX_RESTORED_BYTES:
                    raise ValueError("Duplicate archive member or restored size limit exceeded")
                if mysql and member.size > 32 * CHUNK_SIZE:
                    raise ValueError("MySQL snapshot exceeds the size limit")
                seen.add(name)
                target = destination / name
                target.parent.mkdir(mode=0o700, exist_ok=True)
                with backup.extractfile(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                if mysql:
                    mysql_snapshots += 1
                else:
                    check_database(target)
                    databases += 1
        if "codesomething.db" not in seen:
            raise ValueError("Backup is missing the account database")
    except BaseException:
        shutil.rmtree(destination)
        raise
    print(f"Verified recovery of {databases} SQLite database(s) and {mysql_snapshots} MySQL snapshot(s)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    import_command = commands.add_parser("receive")
    import_command.add_argument("inbox", type=Path)
    import_command.add_argument("name")
    import_command.add_argument("sha256")
    restore_command = commands.add_parser("restore-check")
    restore_command.add_argument("archive", type=Path)
    restore_command.add_argument("directory", type=Path)
    serve_command = commands.add_parser("serve")
    serve_command.add_argument("config", type=Path)
    push_command = commands.add_parser("push")
    push_command.add_argument("config", type=Path)
    push_command.add_argument("archive", type=Path)
    cycle_command = commands.add_parser("cycle")
    cycle_command.add_argument("config", type=Path)
    prune_command = commands.add_parser("prune")
    prune_command.add_argument("inbox", type=Path)
    prune_command.add_argument("--days", type=int, choices=range(7, 15), default=14)
    arguments = parser.parse_args()
    os.umask(0o077)
    try:
        if arguments.command == "receive":
            print(receive(arguments.inbox, arguments.name, arguments.sha256, sys.stdin.buffer).name)
        elif arguments.command == "restore-check":
            restore_check(arguments.archive, arguments.directory)
        elif arguments.command == "prune":
            prune(arguments.inbox, arguments.days)
        else:
            config = json.loads(arguments.config.read_text(encoding="utf-8"))
            if arguments.command == "serve":
                key = config["receive_key"]
                if not re.fullmatch(r"[a-f0-9]{64}", key):
                    raise ValueError("Expected a randomly generated 32-byte receiver key encoded as hex")
                serve(config["bind"], config["port"], Path(config["inbox"]), key)
            elif arguments.command == "push":
                push(arguments.archive, config["peer_url"], config["peer_token"], config["peer_key"])
            else:
                cycle(config)
    except (ValueError, KeyError, OSError, subprocess.SubprocessError, http.client.HTTPException,
            tarfile.TarError, sqlite3.Error) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
