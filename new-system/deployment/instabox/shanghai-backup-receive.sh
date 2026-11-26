#!/bin/bash
set -euo pipefail
umask 077

read -r action area name sha bytes extra <<<"${SSH_ORIGINAL_COMMAND:-}"
[[ -z $extra && $sha =~ ^[0-9a-f]{64}$ && $bytes =~ ^[1-9][0-9]{0,9}$ ]]
case "$area" in
    snapshots)
        [[ $name =~ ^codesomething-[0-9]{8}T[0-9]{6}\.[0-9]{6}Z\.(tar\.gz|manifest)$ ]]
        (( bytes <= 536870912 ))
        ;;
    release-*)
        [[ $area =~ ^release-[0-9]{4}-[0-9]{3}-[0-9]{8}$ ]]
        case "$name" in images.tar.gz|release.cms|runtime-images.txt|SHA256SUMS|java-notify.service) ;; *) exit 2 ;; esac
        (( bytes <= 2147483648 ))
        ;;
    *) exit 2 ;;
esac

directory="/srv/maqibu-ingest/store/$area"
mkdir -p -m 0700 -- "$directory"
final="$directory/$name"
matches_hash() {
    test -f "$1" && test ! -L "$1" && test "$(stat -c%s "$1")" = "$bytes" &&
        printf '%s  %s\n' "$sha" "$1" | sha256sum -c --status -
}

if [[ $action == have ]]; then
    matches_hash "$final"
    exit
fi
[[ $action == receive ]]

temporary=$(mktemp --tmpdir="$directory" .incoming.XXXXXXXX)
trap 'rm -f -- "$temporary"' EXIT
head -c "$((bytes + 1))" > "$temporary"
matches_hash "$temporary"
sync -f "$temporary"
if ! ln -- "$temporary" "$final"; then
    matches_hash "$final"
fi
sync -f "$directory"
printf 'Accepted %s/%s\n' "$area" "$name"
