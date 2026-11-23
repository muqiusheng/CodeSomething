#!/bin/sh
set -eu
umask 077

: "${CS_PROD_DATA_DIRECTORY:?Set the production data directory}"
: "${CS_BACKUP_DIRECTORY:?Set the backup directory}"
scripts=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$CS_BACKUP_DIRECTORY"

use_runner_daemon() {
  : "${CS_RUNNER_DOCKER_SOCKET:?Set the dedicated rootless daemon socket}"
  export DOCKER_HOST="unix://$CS_RUNNER_DOCKER_SOCKET"
  unset DOCKER_CONTEXT
}

case "${1:-}" in
  backup)
    if [ -n "${CS_BACKUP_SQLITE_IMAGE:-}" ]; then
      printf '%s\n' "$CS_BACKUP_SQLITE_IMAGE" | grep -Eq '^sha256:[0-9a-f]{64}$'
      if [ -n "${CS_BACKUP_RCLONE_DESTINATION:-}" ]; then
        printf 'Object storage sync requires the host Python backup runtime.\n' >&2
        exit 2
      fi
      data=$(realpath "$CS_PROD_DATA_DIRECTORY")
      destination=$(realpath "$CS_BACKUP_DIRECTORY")
      case "$destination/" in "$data/"*) printf 'Choose a backup directory outside the data directory.\n' >&2; exit 2;; esac
      use_runner_daemon
      exec flock -n "$destination/.backup.lock" docker run --rm --pull=never --network=none \
        --read-only --cap-drop=ALL --security-opt=no-new-privileges --memory=128m --pids-limit=32 \
        --mount "type=bind,source=$data,target=/data" \
        --mount "type=bind,source=$destination,target=/backups" \
        --mount "type=bind,source=$scripts/backup-sqlite.py,target=/backup-sqlite.py,readonly" \
        "$CS_BACKUP_SQLITE_IMAGE" python /backup-sqlite.py /data /backups \
        --retention-days "${CS_BACKUP_RETENTION_DAYS:-14}"
    fi
    exec flock -n "$CS_BACKUP_DIRECTORY/.backup.lock" python3 "$scripts/backup-sqlite.py" \
      "$CS_PROD_DATA_DIRECTORY" "$CS_BACKUP_DIRECTORY" --retention-days "${CS_BACKUP_RETENTION_DAYS:-14}"
    ;;
  cleanup)
    use_runner_daemon
    exec flock -n "$CS_BACKUP_DIRECTORY/.cleanup.lock" python3 "$scripts/cleanup-runner.py" "$CS_PROD_DATA_DIRECTORY"
    ;;
  *)
    printf 'Usage: sh maintenance.sh backup|cleanup\n' >&2
    exit 2
    ;;
esac
