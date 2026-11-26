#!/bin/bash
set -euo pipefail
umask 077

identity_directory=$1
target=$2
area=$3
archive=$4
name=${archive##*/}
read -r sha _ < <(sha256sum -- "$archive")
bytes=$(stat -c%s -- "$archive")
transport=(ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=$identity_directory/known_hosts" -o ConnectTimeout=12
    -i "$identity_directory/id_ed25519" "$target")

if "${transport[@]}" "have $area $name $sha $bytes" </dev/null; then
    printf 'Already verified %s/%s\n' "$area" "$name"
else
    "${transport[@]}" "receive $area $name $sha $bytes" < "$archive"
fi
