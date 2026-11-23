#!/usr/bin/env python3
"""Create a new private production environment file with independently generated credentials."""
import argparse
import base64
import os
import secrets
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("destination", type=Path)
parser.add_argument("--ecs-2g", action="store_true")
arguments = parser.parse_args()
template = Path(__file__).with_name("ecs-2g.env.example" if arguments.ecs_2g else "production.env.example")
values = {
    "CS_JWT_SECRET": base64.b64encode(secrets.token_bytes(32)).decode("ascii"),
    "CS_INITIAL_ADMIN_PASSWORD": secrets.token_urlsafe(32),
}
lines = template.read_text(encoding="utf-8").splitlines()
descriptor = os.open(arguments.destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
    for line in lines:
        key, _, _ = line.partition("=")
        destination.write((f"{key}={values[key]}" if key in values else line) + "\n")
