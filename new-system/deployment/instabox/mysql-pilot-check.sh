#!/bin/bash
set -euo pipefail
umask 077

root=/data/maqibu-build/mysql-pilot-20261126
mkdir -m 0700 "$root"
image=mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902
container=maqibu-mysql-pilot-20261126
d() { sudo -n docker "$@"; }
sql() { d exec -i "$container" mysql --protocol=socket -uroot --binary-mode=1 "$@"; }
trap 'd stop -t 5 "$container" >/dev/null 2>&1 || true' EXIT

start() {
    d run -d --rm --pull=never --name "$container" --network none --cpus 1 --memory 512m --pids-limit 64 \
        --tmpfs /var/lib/mysql:rw,size=384m -e MYSQL_ALLOW_EMPTY_PASSWORD=yes "$image" \
        --skip-networking --local-infile=0 --secure-file-priv=NULL --max-connections=5 \
        --innodb-buffer-pool-size=48M --performance-schema=OFF --skip-log-bin >/dev/null
    for attempt in $(seq 1 45); do
        if test "$(d exec "$container" cat /proc/1/comm 2>/dev/null || true)" = mysqld &&
            sql -NBe 'SELECT 1' </dev/null >/dev/null 2>&1; then return; fi
        sleep 1
    done
    return 1
}

start
sql -e "CREATE DATABASE dedicated_test_learner;
    CREATE TABLE dedicated_test_learner.exercise_answer (id INT PRIMARY KEY, points INT NOT NULL);
    INSERT INTO dedicated_test_learner.exercise_answer VALUES (1, 10);" </dev/null
d exec "$container" mysqldump --protocol=socket -uroot --single-transaction --databases dedicated_test_learner > "$root/saved.sql"
test -s "$root/saved.sql"
d stop -t 5 "$container" >/dev/null
start
sql < "$root/saved.sql"
test "$(sql -NBe 'SELECT points FROM dedicated_test_learner.exercise_answer WHERE id=1' </dev/null)" = 10
echo 'Isolated test learner MySQL save and restore passed'
