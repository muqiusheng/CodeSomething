#!/bin/sh
set -eu

case "${1:-}" in
  "") ;;
  --private)
    : "${CS_PRIVATE_TLS_CA:?Set the local certificate or CA for the private preview}"
    [ "${CS_PUBLIC_HOST:-}" = localhost ]
    ;;
  *) printf 'Usage: sh preflight.sh [--private]\n' >&2; exit 2 ;;
esac

: "${CS_RUNNER_DOCKER_SOCKET:?Set the dedicated rootless daemon socket}"
: "${CS_PROD_DATA_DIRECTORY:?Set the data directory}"
: "${CS_TLS_DIRECTORY:?Set the TLS directory}"
: "${CS_PUBLIC_HOST:?Set the public HTTPS hostname}"
: "${CS_JWT_SECRET:?Set the JWT signing key}"
[ "${CS_INVITE_REQUIRED:-true}" = true ]
[ -S "$CS_RUNNER_DOCKER_SOCKET" ]
[ -d "$CS_PROD_DATA_DIRECTORY" ] && [ -w "$CS_PROD_DATA_DIRECTORY" ]
[ "$(realpath "$CS_PROD_DATA_DIRECTORY")" = "$CS_PROD_DATA_DIRECTORY" ]
[ -r "$CS_TLS_DIRECTORY/fullchain.pem" ] && [ -r "$CS_TLS_DIRECTORY/privkey.pem" ]
python3 - "${1:-}" <<'PY'
import base64
import binascii
import os
import re
import sys

host = os.environ["CS_PUBLIC_HOST"]
if sys.argv[1] != "--private" and not re.fullmatch(r"(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]", host):
    raise SystemExit("CS_PUBLIC_HOST must be a fully qualified DNS name")
try:
    key = base64.b64decode(os.environ["CS_JWT_SECRET"], validate=True)
except binascii.Error:
    raise SystemExit("CS_JWT_SECRET must contain Base64-encoded random bytes")
if len(key) < 32 or len(set(key)) < 16:
    raise SystemExit("CS_JWT_SECRET requires at least 32 random bytes")
password = os.environ.get("CS_INITIAL_ADMIN_PASSWORD", "")
if password and not 32 <= len(password.encode("utf-8")) <= 72:
    raise SystemExit("Use a random 32–72 byte CS_INITIAL_ADMIN_PASSWORD")
PY
if [ "${1:-}" = "--private" ]; then
  openssl verify -purpose sslserver -verify_hostname localhost \
    -CAfile "$CS_PRIVATE_TLS_CA" "$CS_TLS_DIRECTORY/fullchain.pem" >/dev/null
else
  openssl verify -purpose sslserver -verify_hostname "$CS_PUBLIC_HOST" \
    -untrusted "$CS_TLS_DIRECTORY/fullchain.pem" "$CS_TLS_DIRECTORY/fullchain.pem" >/dev/null
fi
openssl x509 -checkend 86400 -noout -in "$CS_TLS_DIRECTORY/fullchain.pem" >/dev/null
cert_key=$(openssl x509 -pubkey -noout -in "$CS_TLS_DIRECTORY/fullchain.pem")
private_key=$(openssl pkey -pubout -in "$CS_TLS_DIRECTORY/privkey.pem")
[ "$cert_key" = "$private_key" ]
command -v flock >/dev/null
export DOCKER_HOST="unix://$CS_RUNNER_DOCKER_SOCKET"
unset DOCKER_CONTEXT

docker info --format '{{json .SecurityOptions}}' | grep -q 'name=rootless'
[ "$(docker info --format '{{.CgroupVersion}}')" = '2' ]
[ "$(docker info --format '{{.CgroupDriver}}')" = 'systemd' ]
jdk_image='eclipse-temurin@sha256:4b1a74fbffbe6b4e7b6f0171a472478282fb463790a51edf10e465d578f22b69'
docker run --rm --pull=never --network=none --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges --user=65534:65534 --log-driver=none \
  --memory=512m --memory-swap=512m --cpus=1 --pids-limit=64 "$jdk_image" sh -ec '
    test "$(cat /sys/fs/cgroup/memory.max)" = 536870912
    test "$(cat /sys/fs/cgroup/memory.swap.max)" = 0
    test "$(cat /sys/fs/cgroup/cpu.max)" = "100000 100000"
    test "$(cat /sys/fs/cgroup/pids.max)" = 64
  '
sqlite_check='import sqlite3, sys; sys.exit("SQLite 3.27 or newer is required for VACUUM INTO" if sqlite3.sqlite_version_info < (3, 27, 0) else None)'
if [ -n "${CS_BACKUP_SQLITE_IMAGE:-}" ]; then
  printf '%s\n' "$CS_BACKUP_SQLITE_IMAGE" | grep -Eq '^sha256:[0-9a-f]{64}$'
  docker run --rm --pull=never --network=none --read-only --cap-drop=ALL \
    --security-opt=no-new-privileges "$CS_BACKUP_SQLITE_IMAGE" python -c "$sqlite_check"
else
  python3 -c "$sqlite_check"
fi
docker image inspect 'mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902' >/dev/null
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for lock in image-lock.json jdbc-image-lock.json; do
  boot_image=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["image"])' \
    "$script_directory/../backend/src/main/resources/runner/boot/$lock")
  docker image inspect "$boot_image" >/dev/null
done
printf 'TLS chain and hostname, invite mode, key format, rootless runner, cgroups and pinned images verified.\n'
