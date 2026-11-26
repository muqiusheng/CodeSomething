#!/bin/bash
set -euo pipefail
umask 077

deployment=/data/codesomething/release/deployment
stage=/data/home/remote-mysql-qa-20261126
backup_root=/data/codesomething/backups/remote-mysql-cutover-relay-20261126
database=/data/codesomething/database
executor=/data/codesomething/service/.remote-mysql
shanghai=/data/codesomething/service/.shanghai-backup
project=codesomething-instabox
old_image=$project-backend:0.8.1-mysql-quota-20261126
new_image=$project-backend:0.8.1-remote-mysql-20261126
archive=${1:?verified pre-switch backup filename required}
[[ $archive =~ ^codesomething-[0-9]{8}T[0-9]{6}\.[0-9]{6}Z\.tar\.gz$ ]]
pre=/data/maqibu-peer-backup/outgoing/$archive
release_area=release-0340-082-20261126
release_package="$shanghai/remote-mysql-20261126"

minute=$((10#$(date -u +%H) * 60 + 10#$(date -u +%M)))
(( minute >= 570 && minute < 617 ))
test -f "$pre"
test "$(stat -c %Y "$pre")" -ge "$(($(date +%s) - 1800))"
test ! -e "$backup_root"
test ! -e "$release_package"

d() { docker -H unix:///run/user/1001/docker.sock "$@"; }
compose() {
    d compose --project-directory "$deployment" --env-file "$deployment/site.env" -p "$project" \
        -f "$deployment/docker-compose.prod.yml" -f "$deployment/docker-compose.instabox.yml" "$@"
}
ready() {
    for attempt in $(seq 1 25); do
        if d exec "$project-backend-1" curl -fsS --max-time 3 http://127.0.0.1:5188/api/v1/health |
            python3 -c 'import json,sys; h=json.load(sys.stdin); assert h["status"]=="UP" and h["database"]["status"]=="UP"' 2>/dev/null; then return; fi
        sleep 2
    done
    return 1
}

test "$(d inspect --format '{{.Config.Image}}' "$project-backend-1")" = "$old_image"
d image inspect "$new_image" >/dev/null
test -r "$stage/production-qa.py"

if [[ -n $(d ps -q --filter label=codesomething.public-mysql=1) ]]; then
    echo 'Local MySQL still has live databases. Wait for hibernation before changing the executor.' >&2
    exit 1
fi
for name in $(d ps -a --filter label=codesomething.public-mysql=1 --format '{{.Names}}'); do
    [[ $name =~ ^cs-sql-(school|learner)-[a-f0-9]{24}$ && -f "$database/mysql-idle/$name.sql" ]]
done

install -d -m 0700 "$backup_root"
cp -a "$pre" "$backup_root/"
cp -a /etc/maqibu-shanghai-backup.env /opt/maqibu-peer-backup/backup-sqlite.py /opt/shanghai-backup-cycle.sh "$backup_root/"
test ! -e "$deployment/docker-compose.mysql-executor.yml"
install -m 0644 "$stage/docker-compose.mysql-executor.yml" "$deployment/docker-compose.mysql-executor.yml"

rollback() {
    code=$?
    trap - EXIT
    if (( code != 0 )); then
        rm -f -- "$deployment/docker-compose.mysql-executor.yml"
        install -m 0644 "$backup_root/backup-sqlite.py" /opt/maqibu-peer-backup/backup-sqlite.py
        install -m 0755 "$backup_root/shanghai-backup-cycle.sh" /opt/shanghai-backup-cycle.sh
        install -m 0600 "$backup_root/maqibu-shanghai-backup.env" /etc/maqibu-shanghai-backup.env
        compose up -d --no-deps --no-build backend
        ready
        systemctl start maqibu-shanghai-backup.timer
    fi
    exit "$code"
}
trap rollback EXIT
systemctl stop maqibu-shanghai-backup.timer
compose -f "$deployment/docker-compose.mysql-executor.yml" config --quiet
compose -f "$deployment/docker-compose.mysql-executor.yml" up -d --no-deps --no-build backend
ready
test "$(d inspect --format '{{.Config.Image}}' "$project-backend-1")" = "$new_image"
d exec "$project-backend-1" /opt/maqibu-mysql/command volume ls \
    --filter label=codesomething.mysql-slot=cs-mysql-slot-maqibu2 --format '{{.Name}}' | grep -c '^cs-mysql-slot-maqibu2-' | grep -qx 15
python3 "$stage/production-qa.py" verify

install -d -m 0700 -o csdeploy -g csdeploy "$release_package"
bash "$stage/shanghai-backup-release.sh" "$release_package/release.cms"
install -m 0644 "$stage/backup-sqlite.py" /opt/maqibu-peer-backup/backup-sqlite.py
install -m 0755 "$stage/shanghai-backup-cycle.sh" /opt/shanghai-backup-cycle.sh
sed -i "/^BACKUP_RELEASE=/c\BACKUP_RELEASE=$release_area" /etc/maqibu-shanghai-backup.env
printf 'BACKUP_PACKAGE_DIRECTORY=%s\nCS_MYSQL_EXECUTOR=%s/command\nCS_MYSQL_EXECUTOR_SOCKET=%s/relay/mysql.sock\n' \
    "$release_package" "$executor" "$executor" >> /etc/maqibu-shanghai-backup.env
systemctl start maqibu-shanghai-backup.timer
trap - EXIT
echo 'Production MySQL executor cutover passed.'
