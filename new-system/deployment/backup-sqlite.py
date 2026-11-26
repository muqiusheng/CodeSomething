#!/usr/bin/env python3
"""Write verified, online snapshots of all CodeSomething SQLite files."""
import argparse
import hashlib
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
MYSQL_SNAPSHOT = re.compile(r"cs-sql-(?:school|learner)-[0-9a-f]{24}\.sql")
MAX_MYSQL_SNAPSHOT = 32 * 1024 * 1024
MYSQL_SCHEMA = re.compile(r"[a-z][a-z0-9_]{0,63}")
MYSQL_SYSTEM_SCHEMAS = {"mysql", "sys", "information_schema", "performance_schema"}


def checkpoint_mysql(data, destination, docker_host, docker_command=None):
    if docker_command:
        command = Path(docker_command)
        if not command.is_absolute() or not command.is_file() or not os.access(command, os.X_OK):
            raise ValueError("Use an absolute path to the private MySQL executor.")
        docker = [str(command)]
    else:
        if not re.fullmatch(r"unix:///[^\r\n]+", docker_host) or not docker_host.isascii():
            raise ValueError("Use the dedicated local Docker Unix socket for MySQL backups.")
        docker = ["docker", "--host", docker_host]
    scope = hashlib.sha256(os.fsencode(data)).hexdigest()
    listing = subprocess.check_output(docker + [
        "ps", "--no-trunc", "--filter", "label=codesomething.public-mysql=1",
        "--filter", f"label=codesomething.scope={scope}", "--format", "{{.ID}} {{.Names}}",
    ], text=True, timeout=10)
    destination.mkdir()
    for line in listing.splitlines():
        identifier, name = line.split()
        if not re.fullmatch(r"[a-f0-9]{64}", identifier) or not MYSQL_SNAPSHOT.fullmatch(name + ".sql"):
            raise ValueError("Unexpected MySQL checkpoint container identity.")
        # A recovering container is still importing this same verified snapshot.
        if (data / "mysql-idle" / (name + ".restoring")).is_file():
            restored = data / "mysql-idle" / (name + ".sql")
            if not restored.is_file():
                raise ValueError("MySQL restoration marker is missing its snapshot.")
            continue
        exec_mysql = docker + ["exec", identifier, "timeout", "--kill-after=2s", "15s"]
        def schemas():
            names = subprocess.check_output(exec_mysql + [
                "mysql", "--protocol=socket", "-uroot", "-NB", "-e",
                "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name",
            ], text=True, timeout=22).splitlines()
            names = [schema for schema in names if schema not in MYSQL_SYSTEM_SCHEMAS
                     and not schema.startswith(("cs_exam_", "cs_check_"))]
            if any(not MYSQL_SCHEMA.fullmatch(schema) for schema in names):
                raise ValueError("Unexpected MySQL schema name.")
            return names
        before = schemas()
        target = destination / (name + ".sql")
        with target.open("xb") as stream:
            if before:
                subprocess.run(docker + ["exec", identifier, "timeout", "--kill-after=1s", "5s",
                    "mysqldump", "--protocol=socket", "-uroot", "--default-character-set=utf8mb4",
                    "--set-gtid-purged=OFF", "--no-tablespaces", "--lock-all-tables", "--routines",
                    "--events", "--triggers", "--hex-blob", "--databases", *before,
                ], check=True, stdout=stream, timeout=10)
        if before != schemas() or (data / "mysql-idle" / (name + ".restoring")).is_file():
            raise ValueError("MySQL schemas changed while taking a checkpoint. Retry the backup.")
        length = target.stat().st_size
        if length > MAX_MYSQL_SNAPSHOT or (before and not length):
            raise ValueError("MySQL checkpoint has an invalid size.")


def prune_archives(destination, cutoff):
    for path in destination.iterdir():
        match = ARCHIVE_NAME.fullmatch(path.name)
        if match and path.is_file() and not path.is_symlink():
            timestamp = datetime.strptime(match[1], ARCHIVE_STAMP).replace(tzinfo=timezone.utc)
            if timestamp < cutoff:
                path.unlink()


def backup(data, destination, retention_days=14, rclone_destination=None, include_mysql_snapshots=False,
           mysql_docker_host=None, mysql_docker_command=None):
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
        active = staging / "mysql-live"
        if mysql_docker_host or mysql_docker_command:
            checkpoint_mysql(data, active, mysql_docker_host, mysql_docker_command)
        archive = staging / final.name
        with tarfile.open(archive, "w:gz") as output:
            output.add(staging / "codesomething.db", arcname="codesomething.db")
            if (staging / "learners").exists():
                output.add(staging / "learners", arcname="learners")
            if include_mysql_snapshots or mysql_docker_host or mysql_docker_command:
                snapshots = data / "mysql-idle"
                if snapshots.is_symlink():
                    raise ValueError("The MySQL snapshot directory must not be a symlink.")
                by_name = {source.name: source for source in snapshots.glob("*.sql")}
                by_name.update({source.name: source for source in active.glob("*.sql")})
                for source in sorted(by_name.values()):
                    if not MYSQL_SNAPSHOT.fullmatch(source.name):
                        continue
                    if source.is_symlink() or not source.is_file():
                        raise ValueError("Expected a regular MySQL snapshot.")
                    with source.open("rb") as stream:
                        member = tarfile.TarInfo("mysql-idle/" + source.name)
                        member.size = os.fstat(stream.fileno()).st_size
                        member.mode = 0o600
                        if member.size > MAX_MYSQL_SNAPSHOT:
                            raise ValueError("MySQL snapshot exceeds the size limit.")
                        output.addfile(member, stream)
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
    parser.add_argument("--include-mysql-snapshots", action="store_true")
    mysql_executor = parser.add_mutually_exclusive_group()
    mysql_executor.add_argument("--mysql-docker-host")
    mysql_executor.add_argument("--mysql-docker-command")
    arguments = parser.parse_args()
    print(backup(arguments.data, arguments.destination, arguments.retention_days, arguments.rclone_destination,
                 arguments.include_mysql_snapshots, arguments.mysql_docker_host, arguments.mysql_docker_command))
