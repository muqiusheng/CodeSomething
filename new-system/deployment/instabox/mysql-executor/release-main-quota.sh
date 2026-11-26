#!/bin/bash
set -euo pipefail
umask 077

base=/data/codesomething/mysql-quota
archive_dir=/data/codesomething/backups/remote-mysql-cutover-relay-20261126
data=/data/codesomething/database
socket=unix:///run/user/1001/docker.sock
expected=codesomething-instabox-backend:0.8.1-remote-mysql-20261126
[[ $EUID = 0 && $# = 1 && $1 =~ ^codesomething-[0-9]{8}T[0-9]{6}\.[0-9]{6}Z\.tar\.gz$ ]]
[[ "$(realpath "$base")" = "$base" && -d "$archive_dir" ]]
d() { docker -H "$socket" "$@"; }
test "$(d inspect --format '{{.Config.Image}} {{.State.Health.Status}}' codesomething-instabox-backend-1)" = "$expected healthy"
systemctl is-active --quiet maqibu-mysql-relay.service
systemctl is-active --quiet maqibu-shanghai-backup.timer
test "$(systemctl show maqibu-shanghai-backup.service -p Result --value)" = success
test -s "/data/maqibu-peer-backup/outgoing/$1"
grep -qx BACKUP_RELEASE=release-0340-082-20261126 /etc/maqibu-shanghai-backup.env
mapfile -t daemons < <(pgrep -u csdeploy -x dockerd)
test "${#daemons[@]}" = 1
test -z "$(d ps -q --filter label=codesomething.public-mysql=1)"
for name in $(d ps -a --filter label=codesomething.public-mysql=1 --format '{{.Names}}'); do
    [[ $name =~ ^cs-sql-(school|learner)-[a-f0-9]{24}$ && -f "$data/mysql-idle/$name.sql" ]]
    test "$(d inspect --format '{{len .Mounts}} {{.State.Status}}' "$name")" = '0 exited'
done

slots=()
for index in $(seq -w 1 15); do
    volume=cs-mysql-slot-codesomething-$index
    file="$base/slot-$index.ext4"
    mount="$base/slot-$index"
    test -z "$(d ps -a -q --filter volume="$volume")"
    test "$(d volume inspect --format '{{index .Options "device"}} {{index .Labels "codesomething.mysql-slot"}}' "$volume")" = "$mount/mysql cs-mysql-slot-codesomething"
    [[ -f "$file" && ! -L "$file" && "$(stat -c %s "$file")" = 402653184 ]]
    device=$(nsenter -t "${daemons[0]}" -m -- findmnt -n -o SOURCE --mountpoint "$mount")
    [[ $device =~ ^/dev/loop[0-9]+$ && "$(losetup --noheadings --output BACK-FILE "$device")" = "$file" ]]
    slots+=("$index")
done
printf 'Verified 15 local quota files under %s, allocated bytes before cleanup:\n' "$base"
du -B1 -s "$base"
df -B1 --output=avail "$base" | tail -1

unit_drop=/etc/systemd/system/codesomething-rootless-docker.service.d/60-mysql-quota.conf
install -m 0644 "$unit_drop" "$archive_dir/60-mysql-quota.conf"
systemctl disable --now codesomething-mysql-quota.service
rm -- "$unit_drop"
systemctl daemon-reload

for index in "${slots[@]}"; do
    d volume rm "cs-mysql-slot-codesomething-$index" >/dev/null
    nsenter -t "${daemons[0]}" -m -- umount "$base/slot-$index"
    rm -- "$base/slot-$index.ext4"
done
df -B1 --output=avail "$base" | tail -1
test "$(d inspect --format '{{.State.Health.Status}}' codesomething-instabox-backend-1)" = healthy
