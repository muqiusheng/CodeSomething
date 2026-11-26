#!/bin/bash
set -euo pipefail
umask 077

if (( $# != 3 )); then
    echo 'Usage: build-release.sh SOURCE_DIRECTORY OUTPUT_DIRECTORY GIT_COMMIT' >&2
    exit 2
fi

source_directory=$(realpath "$1")
output_directory=$(realpath -m "$2")
revision=$3
[[ $revision =~ ^[0-9a-f]{40}$ ]]
test -r "$source_directory/new-system/backend/pom.xml"
test -r "$source_directory/new-system/frontend/package-lock.json"
test -d "$source_directory/new-system/course-packs"
test ! -e "$output_directory"

(
    cd "$source_directory/new-system/frontend"
    npm ci --no-audit --no-fund
    npm run build
)
(
    cd "$source_directory/new-system/backend"
    mvn --batch-mode -DskipTests package
)

mkdir -m 0700 "$output_directory"
app_jars=("$source_directory"/new-system/backend/target/codesomething-backend-*.jar)
test "${#app_jars[@]}" = 1
cp -- "${app_jars[0]}" "$output_directory/backend.jar"
tar -C "$source_directory/new-system/frontend/dist" -czf "$output_directory/frontend.tar.gz" .
tar -C "$source_directory/new-system" -czf "$output_directory/course-packs.tar.gz" course-packs
printf '%s\n' "$revision" > "$output_directory/git-commit"
(
    cd "$output_directory"
    sha256sum backend.jar frontend.tar.gz course-packs.tar.gz git-commit > SHA256SUMS
    sha256sum -c SHA256SUMS
)
