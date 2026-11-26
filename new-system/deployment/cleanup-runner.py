#!/usr/bin/env python3
"""Prune this deployment's unused Docker objects and old terminal-job input directories."""
import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import time
from contextlib import closing
from pathlib import Path

JOB_ID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
JOB_TABLES = {
    "runner": "check_jobs",
    "boot-runner": "check_jobs",
    "portfolio-runner": "portfolio_checks",
    "generated-runner": "generated_attempts",
}
TERMINAL = {
    "passed", "business_error", "compile_error", "environment_error",
    "timed_out", "cancelled", "interrupted", "cleanup_failed",
}


def docker(*arguments):
    return subprocess.run(["docker", *arguments], capture_output=True, text=True,
                          check=True, timeout=60).stdout


def learner_databases(data):
    yield data / "codesomething.db"
    learners = data / "learners"
    if learners.is_symlink():
        raise ValueError("The learners directory must not be a symlink.")
    yield from (path for path in sorted(learners.glob("*.db")) if JOB_ID.fullmatch(path.stem))


def clear_directories(data, mounted, cutoff):
    candidates = {}
    for directory, table in JOB_TABLES.items():
        root = data / directory
        if not root.is_dir() or root.is_symlink():
            continue
        for path in root.iterdir():
            if (JOB_ID.fullmatch(path.name) and not path.is_symlink() and path.is_dir()
                    and path.stat().st_mtime < cutoff and path not in mounted):
                candidates.setdefault((table, path.name), []).append(path)
    if not candidates:
        return
    confirmed = set()
    for database in learner_databases(data):
        if not database.is_file() or database.is_symlink():
            raise ValueError(f"Expected a regular database: {database}")
        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=10)) as db:
            for table, identifier in candidates:
                row = db.execute(f"SELECT status FROM {table} WHERE id = ?", (identifier,)).fetchone()
                if row and row[0] in TERMINAL:
                    confirmed.add((table, identifier))
    for candidate in sorted(confirmed):
        for path in candidates[candidate]:
            if path.is_dir() and not path.is_symlink() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path)
                print(f"Removed {path.name} from {path.parent.name}")


def main(data):
    data = data.resolve(strict=True)
    # Match RunnerInventory.scopeLabel on the Linux host and in the API container.
    scope = "codesomething.scope=" + hashlib.sha256(os.fsencode(data)).hexdigest()
    print(docker("container", "prune", "-f", "--filter", "until=168h", "--filter", f"label={scope}",
                 "--filter", "label!=codesomething.mysql-disk=1"))
    print(docker("image", "prune", "-f", "--filter", "until=168h", "--filter", "label=codesomething.deployment=true"))
    mounts = set()
    # Container mount sources are authoritative on the dedicated runner daemon.
    for container in docker("ps", "-aq", "--no-trunc").splitlines():
        result = docker("container", "inspect", "--format", "{{json .Mounts}}", container)
        mounts.update(Path(mount["Source"]).resolve() for mount in (json.loads(result) or [])
                      if mount["Type"] == "bind")
    clear_directories(data, mounts, time.time() - 7 * 86400)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    main(parser.parse_args().data)
