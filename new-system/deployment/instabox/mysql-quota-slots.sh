#!/usr/bin/env bash
set -euo pipefail
umask 077

# Trusted host provisioning. MySQL containers receive only an individual local volume.
base=${1:?quota directory required}
owner=${2:?rootless Docker account required}
socket=${3:?rootless Docker socket required}
prefix=${4:?volume prefix required}
count=${5:-15}
[[ $EUID == 0 && $base == /* && $base != / && $socket == /* &&
   $prefix =~ ^cs-mysql-slot-[a-z0-9][a-z0-9-]{2,35}$ &&
   $count =~ ^([1-9]|1[0-5])$ ]]

if [[ ${MAQIBU_MYSQL_QUOTA_MOUNT_NS:-} != entered ]]; then
  mapfile -t daemons < <(pgrep -u "$owner" -x dockerd || true)
  if (( ${#daemons[@]} != 1 )); then
    printf 'Expected one dedicated rootless Docker daemon for %s.\n' "$owner" >&2
    exit 1
  fi
  # Instabox places /data in a private mount namespace for rootless Docker.
  exec nsenter -t "${daemons[0]}" -m -- env MAQIBU_MYSQL_QUOTA_MOUNT_NS=entered \
    /bin/bash "$(realpath "$0")" "$base" "$owner" "$socket" "$prefix" "$count"
fi

group=$(id -gn "$owner")
mapped_uid=$(awk -F: -v u="$owner" '$1 == u && $3 >= 999 {print $2+998; exit}' /etc/subuid)
mapped_gid=$(awk -F: -v u="$owner" '$1 == u && $3 >= 999 {print $2+998; exit}' /etc/subgid)
[[ -n $mapped_uid && -n $mapped_gid ]]
d() { docker --host "unix://$socket" "$@"; }
d info --format '{{json .SecurityOptions}}' | grep -q 'name=rootless'

install -d -o root -g "$group" -m 0710 "$base"
[[ $(realpath "$base") == "$base" ]]
exec 9>"$base/.provision.lock"
flock -n 9
missing=0
for i in $(seq -w 1 "$count"); do
  printf -v slot '%02d' "$((10#$i))"
  [[ -e "$base/slot-$slot.ext4" ]] || missing=$((missing+1))
done
available=$(df -Pk "$base" | awk 'NR==2 {print $4}')
if (( missing > 0 && available < (missing * 384 + 1536) * 1024 )); then
  printf 'Insufficient free disk: %s KiB available for %d additional 384 MiB quota slots and backup workspace.\n' "$available" "$missing" >&2
  exit 1
fi

for i in $(seq 1 "$count"); do
  printf -v slot '%02d' "$i"
  file="$base/slot-$slot.ext4"
  mount_dir="$base/slot-$slot"
  name="$prefix-$slot"
  if [[ ! -e $file ]]; then
    temporary=$(mktemp "$base/.slot-$slot.XXXXXXXX")
    trap 'rm -f -- "$temporary"' EXIT
    fallocate -l 384M "$temporary"
    mkfs.ext4 -q -F -m 0 -E nodiscard "$temporary"
    mv -- "$temporary" "$file"
    trap - EXIT
  fi
  [[ ! -L $file && $(stat -c '%u:%s' "$file") == 0:402653184 ]]
  if ! mountpoint -q "$mount_dir"; then
    install -d -o root -g root -m 0711 "$mount_dir"
    [[ $(realpath "$mount_dir") == "$mount_dir" ]]
    mount -o loop,nosuid,nodev,noexec "$file" "$mount_dir"
  fi
  device=$(findmnt -n -o SOURCE --mountpoint "$mount_dir")
  [[ $device =~ ^/dev/loop[0-9]+$ && $(losetup --noheadings --output BACK-FILE "$device") == "$file" ]]
  chmod 0711 "$mount_dir"
  if [[ ! -e "$mount_dir/mysql" ]]; then
    install -d -o "$mapped_uid" -g "$mapped_gid" -m 0777 "$mount_dir/mysql"
  fi
  [[ ! -L "$mount_dir/mysql" && $(stat -c '%u:%g' "$mount_dir/mysql") == "$mapped_uid:$mapped_gid" ]]
  d volume create --label "codesomething.mysql-slot=$prefix" --driver local \
    --opt type=none --opt o=bind --opt "device=$mount_dir/mysql" "$name" >/dev/null
  actual=$(d volume inspect --format '{{.Driver}} {{index .Options "device"}} {{index .Labels "codesomething.mysql-slot"}}' "$name")
  [[ $actual == "local $mount_dir/mysql $prefix" ]]
  printf '%s provisioned\n' "$name"
done
