#!/bin/bash
set -euo pipefail
umask 077

identity_directory=/data/codesomething/service/.shanghai-backup
release_area=$1
target=$2
data_directory=/data/codesomething/database
outgoing=/data/maqibu-peer-backup/outgoing
package_directory=${BACKUP_PACKAGE_DIRECTORY:-"$identity_directory"}

verify_release() {
    docker -H unix:///run/user/1001/docker.sock inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' \
        codesomething-instabox-backend-1 codesomething-instabox-edge-1 |
        cmp -s "$package_directory/runtime-images.txt" -
}

verify_release
mysql_executor=(--mysql-docker-host unix:///run/user/1001/docker.sock)
if [[ -n ${CS_MYSQL_EXECUTOR:-} ]]; then
    mysql_executor=(--mysql-docker-command "$CS_MYSQL_EXECUTOR")
fi
mysql_checkpoint=complete
backup() {
    python3 /opt/maqibu-peer-backup/backup-sqlite.py "$data_directory" "$outgoing" --retention-days 14 --rclone-destination "" --include-mysql-snapshots "$@"
}
if ! archive=$(backup "${mysql_executor[@]}"); then
    [[ -n ${CS_MYSQL_EXECUTOR:-} ]] || exit 1
    mysql_checkpoint=saved-snapshots-only
    printf 'Remote MySQL checkpoint unavailable. Sending SQLite and the last saved MySQL snapshots.\n' >&2
    archive=$(backup)
fi
verify_release

release_package="$package_directory/release.cms"
manifest="$identity_directory/${archive##*/}"
manifest="${manifest%.tar.gz}.manifest"
read -r snapshot_hash _ < <(sha256sum -- "$archive")
read -r release_hash _ < <(sha256sum -- "$release_package")
if [[ -f "$package_directory/java-notify.service" ]]; then
    /opt/shanghai-backup-send.sh "$identity_directory" "$target" "$release_area" "$package_directory/java-notify.service"
fi
printf 'snapshot=%s\nsnapshot_sha256=%s\nrelease=%s\nrelease_sha256=%s\n' \
    "${archive##*/}" "$snapshot_hash" "$release_area" "$release_hash" > "$manifest"
printf 'mysql_checkpoint=%s\n' "$mysql_checkpoint" >> "$manifest"
if [[ -f "$package_directory/java-notify.service" ]]; then
    read -r notify_hash _ < <(sha256sum -- "$package_directory/java-notify.service")
    printf 'java_notify_override_sha256=%s\n' "$notify_hash" >> "$manifest"
fi

/opt/shanghai-backup-send.sh "$identity_directory" "$target" "$release_area" "$release_package"
/opt/shanghai-backup-send.sh "$identity_directory" "$target" snapshots "$archive"
/opt/shanghai-backup-send.sh "$identity_directory" "$target" snapshots "$manifest"
