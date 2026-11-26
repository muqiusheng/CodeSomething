#!/bin/bash
set -euo pipefail
umask 077

identity_directory=/data/codesomething/service/.shanghai-backup
deployment=/data/codesomething/release
output=${1:-"$identity_directory/release.cms"}
backend=codesomething-instabox-backend-1
edge=codesomething-instabox-edge-1
work=$(mktemp -d /var/tmp/maqibu-shanghai-release.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
d() { docker -H unix:///run/user/1001/docker.sock "$@"; }

test ! -e "$output"
d cp "$backend:/app/codesomething.jar" "$work/backend.jar"
d cp "$edge:/usr/share/nginx/html" "$work/frontend"
d cp "$backend:/app/new-system/course-packs" "$work/course-packs"
test -s "$work/frontend/app.html"
test -r "$deployment/deployment/site.env"
d inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' "$backend" "$edge" > "$work/runtime-images.txt"

contents=(backend.jar frontend runtime-images.txt course-packs)
if [[ -e "$deployment/deployment/docker-compose.mysql-executor.yml" ]]; then
    mkdir -m 0700 "$work/mysql-executor"
    cp -p /data/codesomething/service/.remote-mysql/{client.json,command} "$work/mysql-executor/"
    contents+=(mysql-executor)
fi
if [[ -e "$deployment/deployment/docker-compose.java-judge.yml" ]]; then
    mkdir -m 0700 "$work/java-judge"
    cp -p /data/codesomething/service/.remote-java/{backend.env,notify.json,worker-prod.env} "$work/java-judge/"
    cp -p /opt/{maqibu-java-origin.py,maqibu-java-notify.py} "$work/java-judge/"
    cp -p /etc/systemd/system/maqibu-java-{origin.service,notify.service,notify.timer} "$work/java-judge/"
    contents+=(java-judge)
fi
tar -cf - -C "$work" "${contents[@]}" -C "$deployment" deployment |
    gzip -1 |
    openssl cms -encrypt -binary -aes-256-cbc -stream -outform DER -out "$work/release.cms" "$identity_directory/shanghai.pem"
install -o csdeploy -g csdeploy -m 0600 "$work/release.cms" "$output"
install -o csdeploy -g csdeploy -m 0600 "$work/runtime-images.txt" "$(dirname "$output")/runtime-images.txt"
