#!/bin/bash
set -euo pipefail

account=cs-mysql
home=/data/maqibu-mysql/daemon
test "$EUID" = 0
test -x /usr/bin/dockerd-rootless.sh
install -d -m 0711 /data/maqibu-mysql
if ! id "$account" >/dev/null 2>&1; then
    useradd --create-home --home-dir "$home" --shell /usr/sbin/nologin "$account"
fi
uid=$(id -u "$account")
grep -q "^$account:" /etc/subuid
grep -q "^$account:" /etc/subgid
install -d -m 0755 /usr/local/libexec
install -d -m 0700 -o "$account" -g "$account" "$home" "/run/user/$uid"
install -d -m 0755 "/etc/systemd/system/user@$uid.service.d"
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' > "/etc/systemd/system/user@$uid.service.d/50-mysql-delegate.conf"
loginctl enable-linger "$account"
install -m 0755 "$1" /usr/local/libexec/maqibu-mysql-quota
install -m 0755 "$2" /usr/local/libexec/maqibu-mysql-executor
cat > /etc/systemd/system/maqibu-mysql-rootless.service <<EOF
[Unit]
Description=Maqibu dedicated rootless MySQL container engine
Requires=user@$uid.service
After=network-online.target user@$uid.service
Wants=network-online.target
[Service]
Type=notify
NotifyAccess=all
Environment=HOME=$home
Environment=XDG_RUNTIME_DIR=/run/user/$uid
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus
ExecStartPre=/usr/bin/install -d -m 0700 -o $account -g $account /run/user/$uid
ExecStart=/usr/bin/unshare --mount --propagation private /bin/sh -ec 'mount -t proc -o nosuid,nodev,noexec proc /proc; exec /usr/bin/setpriv --reuid=$account --regid=$account --init-groups /usr/bin/dockerd-rootless.sh --iptables=false'
ExecStartPost=/usr/local/libexec/maqibu-mysql-quota /data/maqibu-mysql/quota $account /run/user/$uid/docker.sock cs-mysql-slot-maqibu2 15
Delegate=cpu cpuset io memory pids
KillMode=mixed
Restart=on-failure
TimeoutStartSec=180
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/maqibu-mysql-executor.service <<EOF
[Unit]
Description=Maqibu private MySQL executor
Requires=maqibu-mysql-rootless.service
After=maqibu-mysql-rootless.service
[Service]
User=$account
Group=$account
UMask=0077
Environment=CS_MYSQL_EXECUTOR_CONFIG=/data/maqibu-mysql/daemon/executor.json
ExecStart=/usr/local/libexec/maqibu-mysql-executor serve
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl restart "user@$uid.service"
systemctl enable maqibu-mysql-rootless.service
systemctl restart maqibu-mysql-rootless.service
