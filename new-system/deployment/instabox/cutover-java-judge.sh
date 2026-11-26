#!/bin/bash
set -euo pipefail
umask 077

deployment=/data/codesomething/release/deployment
stage=/data/home/java-executor-v25-20261126
base=/data/codesomething/service/.remote-java
shanghai=/data/codesomething/service/.shanghai-backup
rollback_directory=/data/codesomething/backups/remote-java-cutover-verified-20261126
new_package=$shanghai/remote-executors-20261126
env_file=/etc/maqibu-shanghai-backup.env
project=codesomething-instabox
old_backend=$project-backend:0.8.1-remote-mysql-20261126
new_backend=$project-backend:0.8.1-remote-executors-20261126
new_edge=$project-edge:0.34.0-java-private-20261126
override=$deployment/docker-compose.java-judge.yml

minute=$((10#$(date -u +%H) * 60 + 10#$(date -u +%M)))
(( minute >= 570 && minute < 620 ))
test ! -e "$override"
test ! -e "$rollback_directory"
test ! -e "$new_package"
for file in backend.env notify.json worker-prod.env; do
    test "$(stat -c '%a:%U' "$base/$file")" = 600:csdeploy
done
test "$(systemctl show maqibu-shanghai-backup.service -p Result --value)" = success

d() { docker -H unix:///run/user/1001/docker.sock "$@"; }
compose() {
    d compose --project-directory "$deployment" --env-file "$deployment/site.env" -p "$project" \
        -f "$deployment/docker-compose.prod.yml" -f "$deployment/docker-compose.instabox.yml" \
        -f "$deployment/docker-compose.mysql-executor.yml" "$@"
}
ready() {
    for attempt in $(seq 1 33); do
        if d exec "$project-backend-1" curl -fsS --max-time 3 http://127.0.0.1:5188/api/v1/health 2>/dev/null |
            python3 -c 'import json,sys; h=json.load(sys.stdin); assert h["status"]=="UP" and h["database"]["status"]=="UP"' 2>/dev/null; then return; fi
        sleep 2
    done
    return 1
}
test "$(d inspect --format '{{.Config.Image}}' "$project-backend-1")" = "$old_backend"
d image inspect "$new_backend" "$new_edge" >/dev/null
install -d -m 0700 "$rollback_directory"
install -m 0600 "$env_file" "$rollback_directory/maqibu-shanghai-backup.env"
rollback() {
    code=$?
    trap - EXIT
    if (( code != 0 )); then
        systemctl disable --now maqibu-java-notify.timer || true
        systemctl disable --now maqibu-java-origin.service || true
        rm -f -- "$override"
        install -m 0600 "$rollback_directory/maqibu-shanghai-backup.env" "$env_file"
        compose up -d --no-build backend edge
        ready
        systemctl start maqibu-shanghai-backup.timer
    fi
    exit "$code"
}
trap rollback EXIT
systemctl stop maqibu-shanghai-backup.timer
install -m 0644 "$stage/docker-compose.java-judge.yml" "$override"
compose -f "$override" config --quiet
compose -f "$override" up -d --no-build backend edge
ready
test "$(d inspect --format '{{.Config.Image}}' "$project-backend-1")" = "$new_backend"
test "$(d inspect --format '{{.Config.Image}}' "$project-edge-1")" = "$new_edge"
systemctl enable --now maqibu-java-origin.service

set +x
source "$base/backend.env"
endpoint=http://127.0.0.1:17684/api/v1/internal/java-judge/claim
http_status=
for attempt in $(seq 1 12); do
    http_status=$(printf 'url = "%s"\nheader = "Authorization: Bearer %s"\ndata = "{}"\n' \
        "$endpoint" "$CS_REMOTE_JAVA_TOKEN" | curl -sS --max-time 3 -o /dev/null -w '%{http_code}' --config - 2>/dev/null || :)
    [[ $http_status = 204 ]] && break
    sleep 1
done
printf 'Private Java claim route reply during maintenance: %s\n' "$http_status"
test "$http_status" = 204
unset CS_REMOTE_JAVA_TOKEN
d exec "$project-backend-1" /opt/maqibu-mysql/command volume ls \
    --filter label=codesomething.mysql-slot=cs-mysql-slot-maqibu2 --format '{{.Name}}' | grep -c '^cs-mysql-slot-maqibu2-' | grep -qx 15

install -d -m 0700 -o csdeploy -g csdeploy "$new_package"
bash "$stage/shanghai-backup-release.sh" "$new_package/release.cms"
sed -i '/^BACKUP_RELEASE=/c\BACKUP_RELEASE=release-0340-083-20261126' "$env_file"
sed -i "/^BACKUP_PACKAGE_DIRECTORY=/c\BACKUP_PACKAGE_DIRECTORY=$new_package" "$env_file"
systemctl enable --now maqibu-java-notify.timer
systemctl start maqibu-shanghai-backup.timer
trap - EXIT
echo 'Production Java queue and private ingress enabled. A real job can be claimed during service hours.'
