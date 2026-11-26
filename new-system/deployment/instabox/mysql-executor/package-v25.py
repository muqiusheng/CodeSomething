#!/usr/bin/env python3
"""Make the MySQL executor candidate from the verified, deployed V25 backend."""
import argparse
import hashlib
from pathlib import Path
import struct
import zipfile


PRODUCTION_SHA = "f694159aa0991a3bf9df2afe43a0c494c62d6a770612b28f353460b5fc5f38ae"
ENVIRONMENT_CLASS = "BOOT-INF/classes/dev/codesomething/sql/MysqlEnvironment.class"
OLD_VALUE = b"\x24{cs.runner.docker}"
NEW_VALUE = b"\x24{CS_MYSQL_EXECUTOR:\x24{cs.runner.docker}}"


def utf8_entry(value):
    return b"\x01" + struct.pack(">H", len(value)) + value


def build(source, destination):
    with source.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != PRODUCTION_SHA:
            raise ValueError("Unexpected production backend archive")
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination, mode="x") as candidate:
        for member in original.infolist():
            content = original.read(member)
            if member.filename == ENVIRONMENT_CLASS:
                if content.count(utf8_entry(OLD_VALUE)) != 1:
                    raise ValueError("Expected one MySQL Docker configuration reference")
                content = content.replace(utf8_entry(OLD_VALUE), utf8_entry(NEW_VALUE))
            candidate.writestr(member, content)
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination) as candidate:
        changes = [
            member for member in original.namelist()
            if original.read(member) != candidate.read(member)
        ]
        if changes != [ENVIRONMENT_CLASS] or candidate.testzip():
            raise ValueError("Candidate did not preserve the production archive contents")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    options = parser.parse_args()
    build(options.source, options.destination)
