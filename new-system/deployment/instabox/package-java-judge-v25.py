#!/usr/bin/env python3
"""Add the queue and Java worker to the isolated V25 release branch."""
import argparse
from pathlib import Path
import zipfile


CLASSES = {
    "dev/codesomething/CodeSomethingApplication",
    "dev/codesomething/auth/PublicAccessFilter",
    "dev/codesomething/workspaces/CheckJobController",
    "dev/codesomething/workspaces/CheckJobWorker",
    "dev/codesomething/workspaces/RemoteJavaJobs",
    "dev/codesomething/workspaces/RemoteJavaWorker",
}


def build(source, destination, compiled, migration):
    changes = {}
    for path in compiled.rglob("*.class"):
        relative = path.relative_to(compiled).as_posix()
        if relative.partition("$")[0].removesuffix(".class") not in CLASSES:
            raise ValueError(f"Unexpected class in the isolated compile: {relative}")
        changes["BOOT-INF/classes/" + relative] = path.read_bytes()
    if len(changes) < len(CLASSES) or migration.name != "V25_1__remote_java_check_leases.sql":
        raise ValueError("Java queue build is incomplete")
    changes["BOOT-INF/classes/db/migration/" + migration.name] = migration.read_bytes()
    with zipfile.ZipFile(source) as baseline, zipfile.ZipFile(destination, mode="x") as target:
        if any("/db/migration/V25_1" in name or "/db/migration/V26" in name or "/db/migration/V27" in name
               or "/db/migration/V28" in name or "/db/migration/V29" in name for name in baseline.namelist()):
            raise ValueError("Expected the V25 release baseline")
        for member in baseline.infolist():
            data = changes.pop(member.filename, None)
            target.writestr(member, baseline.read(member) if data is None else data)
        for name, data in sorted(changes.items()):
            target.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(destination) as result:
        invalid = result.testzip()
        if invalid:
            raise ValueError(f"Invalid release archive entry: {invalid}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("compiled", type=Path)
    parser.add_argument("migration", type=Path)
    options = parser.parse_args()
    build(options.source, options.destination, options.compiled, options.migration)
